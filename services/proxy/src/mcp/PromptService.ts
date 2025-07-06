/**
 * Service for managing MCP prompts
 */

import type { Pool } from 'pg'
import type { McpPrompt, PromptFilter, PromptUsage } from './types/prompts.js'
import { LRUCache } from 'lru-cache'
import { config, getErrorMessage, getErrorStack, getErrorCode } from '@claude-nexus/shared'
import { logger } from '../middleware/logger.js'

export class PromptService {
  private cache: LRUCache<string, McpPrompt>

  constructor(private pool: Pool) {
    this.cache = new LRUCache<string, McpPrompt>({
      max: config.mcp.cache.maxSize,
      ttl: config.mcp.cache.ttl * 1000, // Convert to milliseconds
    })
  }

  async listPrompts(filter: PromptFilter = {}): Promise<McpPrompt[]> {
    const { search, active = true, limit = 100, offset = 0 } = filter

    let query = `
      SELECT 
        id, prompt_id, name, description, content, arguments,
        metadata, github_path, github_sha, github_url, version,
        is_active, created_at, updated_at, synced_at
      FROM mcp_prompts
      WHERE 1=1
    `
    const params: Array<boolean | string | number> = []
    let paramCount = 0

    if (active !== undefined) {
      params.push(active)
      query += ` AND is_active = $${++paramCount}`
    }

    if (search) {
      params.push(`%${search}%`)
      query += ` AND (name ILIKE $${++paramCount} OR description ILIKE $${paramCount})`
    }

    query += ` ORDER BY name ASC`

    params.push(limit)
    query += ` LIMIT $${++paramCount}`

    params.push(offset)
    query += ` OFFSET $${++paramCount}`

    try {
      const result = await this.pool.query(query, params)
      return result.rows.map(this.mapRowToPrompt)
    } catch (error) {
      logger.error('Error listing prompts', {
        error: {
          message: getErrorMessage(error),
          stack: getErrorStack(error),
          code: getErrorCode(error),
        },
      })
      throw error
    }
  }

  async getPrompt(promptId: string): Promise<McpPrompt | null> {
    // Check cache first
    const cached = this.cache.get(promptId)
    if (cached) {
      return cached
    }

    const query = `
      SELECT 
        id, prompt_id, name, description, content, arguments,
        metadata, github_path, github_sha, github_url, version,
        is_active, created_at, updated_at, synced_at
      FROM mcp_prompts
      WHERE prompt_id = $1 AND is_active = true
    `

    try {
      const result = await this.pool.query(query, [promptId])
      if (result.rows.length === 0) {
        return null
      }

      const prompt = this.mapRowToPrompt(result.rows[0])

      // Cache the prompt
      this.cache.set(promptId, prompt)

      return prompt
    } catch (error) {
      logger.error('Error getting prompt', {
        error: {
          message: getErrorMessage(error),
          stack: getErrorStack(error),
          code: getErrorCode(error),
        },
        metadata: {
          promptId,
        },
      })
      throw error
    }
  }

  async upsertPrompt(
    prompt: Omit<McpPrompt, 'id' | 'createdAt' | 'updatedAt' | 'syncedAt'>
  ): Promise<void> {
    const query = `
      INSERT INTO mcp_prompts (
        prompt_id, name, description, content, arguments,
        metadata, github_path, github_sha, github_url, version, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (prompt_id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        content = EXCLUDED.content,
        arguments = EXCLUDED.arguments,
        metadata = EXCLUDED.metadata,
        github_path = EXCLUDED.github_path,
        github_sha = EXCLUDED.github_sha,
        github_url = EXCLUDED.github_url,
        version = mcp_prompts.version + 1,
        is_active = EXCLUDED.is_active,
        updated_at = NOW(),
        synced_at = NOW()
    `

    const params = [
      prompt.promptId,
      prompt.name,
      prompt.description || null,
      prompt.content,
      JSON.stringify(prompt.arguments || []),
      JSON.stringify(prompt.metadata || {}),
      prompt.githubPath,
      prompt.githubSha || null,
      prompt.githubUrl || null,
      prompt.version || 1,
      prompt.isActive !== false,
    ]

    try {
      await this.pool.query(query, params)

      // Invalidate cache
      this.cache.delete(prompt.promptId)
    } catch (error) {
      logger.error('Error upserting prompt', {
        error: {
          message: getErrorMessage(error),
          stack: getErrorStack(error),
          code: getErrorCode(error),
        },
        metadata: {
          promptId: prompt.promptId,
        },
      })
      throw error
    }
  }

  async recordUsage(usage: PromptUsage): Promise<void> {
    const query = `
      INSERT INTO mcp_prompt_usage (
        prompt_id, domain, account_id, request_id, arguments, used_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `

    const params = [
      usage.promptId,
      usage.domain || null,
      usage.accountId || null,
      usage.requestId || null,
      JSON.stringify(usage.arguments || {}),
      usage.usedAt,
    ]

    try {
      await this.pool.query(query, params)
    } catch (error) {
      logger.error('Error recording prompt usage', {
        error: {
          message: getErrorMessage(error),
          stack: getErrorStack(error),
          code: getErrorCode(error),
        },
        metadata: {
          promptId: usage.promptId,
        },
      })
      // Don't throw - usage tracking shouldn't break the request
    }
  }

  async getUsageStats(
    promptId: string,
    days: number = 30
  ): Promise<{
    totalUses: number
    uniqueDomains: number
    uniqueAccounts: number
    dailyUsage: Array<{
      date: Date
      count: number
    }>
  }> {
    const query = `
      SELECT 
        COUNT(*) as total_uses,
        COUNT(DISTINCT domain) as unique_domains,
        COUNT(DISTINCT account_id) as unique_accounts,
        DATE_TRUNC('day', used_at) as day,
        COUNT(*) as daily_uses
      FROM mcp_prompt_usage
      WHERE prompt_id = $1
        AND used_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE_TRUNC('day', used_at)
      ORDER BY day DESC
    `

    try {
      const result = await this.pool.query(query, [promptId])
      return {
        totalUses: result.rows[0]?.total_uses || 0,
        uniqueDomains: result.rows[0]?.unique_domains || 0,
        uniqueAccounts: result.rows[0]?.unique_accounts || 0,
        dailyUsage: result.rows.map(row => ({
          date: row.day,
          count: parseInt(row.daily_uses),
        })),
      }
    } catch (error) {
      logger.error('Error getting usage stats', {
        error: {
          message: getErrorMessage(error),
          stack: getErrorStack(error),
          code: getErrorCode(error),
        },
        metadata: {
          promptId,
        },
      })
      throw error
    }
  }

  private mapRowToPrompt(row: {
    id: number
    prompt_id: string
    name: string
    description: string | null
    content: string
    arguments: Array<{
      name: string
      type?: string
      description?: string
      required?: boolean
      default?: unknown
    }> | null
    metadata: Record<string, unknown> | null
    github_path: string
    github_sha: string | null
    github_url: string | null
    version: number
    is_active: boolean
    created_at: Date
    updated_at: Date
    synced_at: Date | null
  }): McpPrompt {
    return {
      id: row.id.toString(),
      promptId: row.prompt_id,
      name: row.name,
      description: row.description || undefined,
      content: row.content,
      arguments: row.arguments || [],
      metadata: row.metadata || {},
      githubPath: row.github_path,
      githubSha: row.github_sha || undefined,
      githubUrl: row.github_url || undefined,
      version: row.version,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      syncedAt: row.synced_at || row.updated_at,
    }
  }

  clearCache(): void {
    this.cache.clear()
  }
}
