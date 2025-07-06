/**
 * REST API endpoints for MCP dashboard functionality
 */

import { Hono } from 'hono'
import type { PromptService } from '../mcp/PromptService.js'
import type { GitHubSyncService } from '../mcp/GitHubSyncService.js'
import type { SyncScheduler } from '../mcp/SyncScheduler.js'
import { logger } from '../middleware/logger.js'

export function createMcpApiRoutes(
  promptService: PromptService,
  syncService: GitHubSyncService,
  syncScheduler: SyncScheduler
) {
  const mcpApi = new Hono()

  // List prompts with filtering and pagination
  mcpApi.get('/prompts', async c => {
    const page = parseInt(c.req.query('page') || '1')
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100)
    const search = c.req.query('search')
    const active = c.req.query('active') !== 'false'

    const offset = (page - 1) * limit

    try {
      const prompts = await promptService.listPrompts({
        search,
        active,
        limit,
        offset,
      })

      return c.json({
        prompts,
        page,
        limit,
        total: prompts.length, // TODO: Add total count query
      })
    } catch (error) {
      logger.error('Error listing prompts:', error)
      return c.json({ error: 'Failed to list prompts' }, 500)
    }
  })

  // Get prompt details with usage stats
  mcpApi.get('/prompts/:id', async c => {
    const promptId = c.req.param('id')
    const includeStats = c.req.query('includeStats') === 'true'

    try {
      const prompt = await promptService.getPrompt(promptId)

      if (!prompt) {
        return c.json({ error: 'Prompt not found' }, 404)
      }

      const response: any = { prompt }

      if (includeStats) {
        const stats = await promptService.getUsageStats(promptId)
        response.stats = stats
      }

      return c.json(response)
    } catch (error) {
      logger.error('Error getting prompt:', error)
      return c.json({ error: 'Failed to get prompt' }, 500)
    }
  })

  // Get prompt usage statistics
  mcpApi.get('/prompts/:id/usage', async c => {
    const promptId = c.req.param('id')
    const days = parseInt(c.req.query('days') || '30')

    try {
      const stats = await promptService.getUsageStats(promptId, days)
      return c.json(stats)
    } catch (error) {
      logger.error('Error getting usage stats:', error)
      return c.json({ error: 'Failed to get usage statistics' }, 500)
    }
  })

  // Trigger manual sync
  mcpApi.post('/sync', async c => {
    try {
      await syncScheduler.triggerSync()
      return c.json({ message: 'Sync triggered successfully' })
    } catch (error) {
      logger.error('Error triggering sync:', error)
      const message = error instanceof Error ? error.message : 'Failed to trigger sync'
      return c.json({ error: message }, 500)
    }
  })

  // Get sync status
  mcpApi.get('/sync/status', async c => {
    try {
      const status = await syncService.getSyncStatus()
      return c.json(
        status || {
          repository: null,
          branch: null,
          sync_status: 'never_synced',
          last_sync_at: null,
          last_commit_sha: null,
          last_error: null,
        }
      )
    } catch (error) {
      logger.error('Error getting sync status:', error)
      return c.json({ error: 'Failed to get sync status' }, 500)
    }
  })

  return mcpApi
}
