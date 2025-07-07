/**
 * Service for syncing prompts from GitHub repository
 */

import { Octokit } from '@octokit/rest'
import * as yaml from 'js-yaml'
import matter from 'gray-matter'
import type { Pool } from 'pg'
import type { PromptService } from './PromptService.js'
import type { YamlPromptFormat, JsonPromptFormat, MarkdownFrontmatter } from './types/prompts.js'

type ParsedPrompt = {
  promptId: string
  name: string
  description?: string
  content: string
  arguments?: Array<{
    name: string
    type?: string
    description?: string
    required?: boolean
    default?: unknown
  }>
  metadata: Record<string, unknown>
  githubPath: string
  githubUrl: string
  version: number
  isActive: boolean
  githubSha?: string
}
import { config, getErrorMessage, getErrorStack, getErrorCode } from '@claude-nexus/shared'
import { logger } from '../middleware/logger.js'

export class GitHubSyncService {
  private octokit: Octokit
  private readonly owner: string
  private readonly repo: string
  private readonly branch: string
  private readonly path: string

  constructor(
    private pool: Pool,
    private promptService: PromptService
  ) {
    if (!config.mcp.github.token) {
      throw new Error('GitHub token is required for MCP sync')
    }

    this.octokit = new Octokit({
      auth: config.mcp.github.token,
    })

    this.owner = config.mcp.github.owner
    this.repo = config.mcp.github.repo
    this.branch = config.mcp.github.branch
    // Remove trailing slash from path if present
    this.path = config.mcp.github.path.replace(/\/$/, '')
  }

  async syncRepository(): Promise<void> {
    logger.info(`Starting GitHub sync from ${this.owner}/${this.repo}`, {
      metadata: {
        owner: this.owner,
        repo: this.repo,
        branch: this.branch,
        path: this.path,
      },
    })

    try {
      // Update sync status to 'syncing'
      await this.updateSyncStatus('syncing')

      // Get the latest commit SHA
      const { data: ref } = await this.octokit.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${this.branch}`,
      })
      const latestSha = ref.object.sha

      // Get repository contents at the specified path
      const prompts = await this.fetchPrompts()

      logger.info(`Found ${prompts.length} prompt files`)

      // Process and store each prompt
      let successCount = 0
      for (const prompt of prompts) {
        try {
          await this.promptService.upsertPrompt({
            ...prompt,
            githubSha: latestSha,
          })
          successCount++
        } catch (error) {
          logger.error(`Failed to store prompt ${prompt.promptId}`, {
            error: {
              message: getErrorMessage(error),
              stack: getErrorStack(error),
              code: getErrorCode(error),
            },
          })
        }
      }

      // Update sync status to success
      await this.updateSyncStatus('success', latestSha)

      logger.info(`GitHub sync completed. Stored ${successCount}/${prompts.length} prompts`)
    } catch (error) {
      logger.error('GitHub sync failed', {
        error: {
          message: getErrorMessage(error),
          stack: getErrorStack(error),
          code: getErrorCode(error),
        },
      })
      await this.updateSyncStatus(
        'error',
        undefined,
        error instanceof Error ? error.message : 'Unknown error'
      )
      throw error
    }
  }

  private async fetchPrompts(): Promise<Array<ParsedPrompt>> {
    const prompts: Array<ParsedPrompt> = []

    try {
      // List contents of the prompts directory
      logger.debug('Fetching directory contents', {
        metadata: {
          owner: this.owner,
          repo: this.repo,
          path: this.path,
          ref: this.branch,
        },
      })

      const { data: contents } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: this.path,
        ref: this.branch,
      })

      if (!Array.isArray(contents)) {
        logger.warn('Expected directory listing but got single file')
        return prompts
      }

      // Process each file
      for (const item of contents) {
        if (item.type !== 'file') {
          continue
        }

        // Only process supported file types
        const ext = item.name.split('.').pop()?.toLowerCase()
        if (!['yaml', 'yml', 'json', 'md'].includes(ext || '')) {
          continue
        }

        try {
          // Fetch file content
          const { data: file } = await this.octokit.repos.getContent({
            owner: this.owner,
            repo: this.repo,
            path: item.path,
            ref: this.branch,
          })

          if ('content' in file && file.content) {
            const content = Buffer.from(file.content, 'base64').toString('utf-8')
            const prompt = await this.parsePromptFile(content, item.path, item.html_url || '')

            if (prompt) {
              prompts.push(prompt)
            }
          }
        } catch (error) {
          logger.error(`Failed to process file ${item.path}`, {
            error: {
              message: getErrorMessage(error),
              stack: getErrorStack(error),
              code: getErrorCode(error),
            },
            metadata: {
              filePath: item.path,
            },
          })
        }
      }
    } catch (error) {
      logger.error('Error fetching prompts from GitHub', {
        error: {
          message: getErrorMessage(error),
          stack: getErrorStack(error),
          code: getErrorCode(error),
        },
      })
      throw error
    }

    return prompts
  }

  private async parsePromptFile(
    content: string,
    filePath: string,
    githubUrl: string
  ): Promise<ParsedPrompt | null> {
    const ext = filePath.split('.').pop()?.toLowerCase()

    try {
      switch (ext) {
        case 'yaml':
        case 'yml':
          return this.parseYamlPrompt(content, filePath, githubUrl)

        case 'json':
          return this.parseJsonPrompt(content, filePath, githubUrl)

        case 'md':
          return this.parseMarkdownPrompt(content, filePath, githubUrl)

        default:
          logger.warn(`Unsupported file type: ${ext}`)
          return null
      }
    } catch (error) {
      logger.error(`Error parsing ${filePath}`, {
        error: {
          message: getErrorMessage(error),
          stack: getErrorStack(error),
          code: getErrorCode(error),
        },
        metadata: {
          filePath,
        },
      })
      return null
    }
  }

  private parseYamlPrompt(content: string, filePath: string, githubUrl: string): ParsedPrompt {
    const data = yaml.load(content) as YamlPromptFormat

    if (!data.id || !data.name || !data.content) {
      throw new Error('Invalid YAML prompt format: missing required fields')
    }

    return {
      promptId: data.id,
      name: data.name,
      description: data.description,
      content: data.content,
      arguments: data.arguments,
      metadata: data.metadata || {},
      githubPath: filePath,
      githubUrl,
      version: 1,
      isActive: true,
    }
  }

  private parseJsonPrompt(content: string, filePath: string, githubUrl: string): ParsedPrompt {
    const data = JSON.parse(content) as JsonPromptFormat

    if (!data.id || !data.name || !data.content) {
      throw new Error('Invalid JSON prompt format: missing required fields')
    }

    return {
      promptId: data.id,
      name: data.name,
      description: data.description,
      content: data.content,
      arguments: data.arguments,
      metadata: data.metadata || {},
      githubPath: filePath,
      githubUrl,
      version: 1,
      isActive: true,
    }
  }

  private parseMarkdownPrompt(content: string, filePath: string, githubUrl: string): ParsedPrompt {
    const parsed = matter(content)
    const frontmatter = parsed.data as MarkdownFrontmatter

    if (!frontmatter.id || !frontmatter.name) {
      throw new Error('Invalid Markdown prompt format: missing required frontmatter fields')
    }

    return {
      promptId: frontmatter.id,
      name: frontmatter.name,
      description: frontmatter.description,
      content: parsed.content.trim(),
      arguments: frontmatter.arguments,
      metadata: frontmatter.metadata || {},
      githubPath: filePath,
      githubUrl,
      version: 1,
      isActive: true,
    }
  }

  private async updateSyncStatus(
    status: 'pending' | 'syncing' | 'success' | 'error',
    commitSha?: string,
    error?: string
  ): Promise<void> {
    const query = `
      INSERT INTO mcp_sync_status (repository, branch, sync_status, last_sync_at, last_commit_sha, last_error)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (repository, branch) DO UPDATE SET
        sync_status = EXCLUDED.sync_status,
        last_sync_at = EXCLUDED.last_sync_at,
        last_commit_sha = COALESCE(EXCLUDED.last_commit_sha, mcp_sync_status.last_commit_sha),
        last_error = EXCLUDED.last_error,
        updated_at = NOW()
    `

    const params = [
      `${this.owner}/${this.repo}`,
      this.branch,
      status,
      status === 'success' ? new Date() : null,
      commitSha || null,
      error || null,
    ]

    try {
      await this.pool.query(query, params)
    } catch (error) {
      logger.error('Error updating sync status', {
        error: {
          message: getErrorMessage(error),
          stack: getErrorStack(error),
          code: getErrorCode(error),
        },
      })
    }
  }

  async getSyncStatus(): Promise<{
    repository: string
    branch: string
    sync_status: string
    last_sync_at: Date | null
    last_commit_sha: string | null
    last_error: string | null
    updated_at: Date
  } | null> {
    const query = `
      SELECT repository, branch, sync_status, last_sync_at, last_commit_sha, last_error, updated_at
      FROM mcp_sync_status
      WHERE repository = $1 AND branch = $2
    `

    const params = [`${this.owner}/${this.repo}`, this.branch]

    try {
      const result = await this.pool.query(query, params)
      return result.rows[0] || null
    } catch (error) {
      logger.error('Error getting sync status', {
        error: {
          message: getErrorMessage(error),
          stack: getErrorStack(error),
          code: getErrorCode(error),
        },
      })
      return null
    }
  }
}
