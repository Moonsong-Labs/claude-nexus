/**
 * REST API endpoints for MCP (Model Context Protocol) dashboard functionality
 * 
 * This module provides endpoints for:
 * - Listing and searching prompts
 * - Getting prompt details
 * - Triggering GitHub sync
 * - Checking sync status
 */

import { Hono } from 'hono'
import { z } from 'zod'
import type { PromptRegistryService } from '../mcp/PromptRegistryService.js'
import type { GitHubSyncService } from '../mcp/GitHubSyncService.js'
import type { SyncScheduler } from '../mcp/SyncScheduler.js'
import { logger } from '../middleware/logger.js'
import { getErrorMessage, getErrorStack, getErrorCode } from '@claude-nexus/shared'
import { HTTP_STATUS } from '../constants.js'
import { createErrorResponse } from '../utils/error-response.js'
import { handleZodError } from '../utils/zod-error-handler.js'

// Request schemas
const listPromptsQuerySchema = z.object({
  search: z.string().optional(),
})

const promptIdParamSchema = z.object({
  id: z.string().min(1, 'Prompt ID is required'),
})

// Response types
interface PromptInfo {
  promptId: string
  name: string
  description?: string
  template: string
  inputSchema?: unknown
}

interface ListPromptsResponse {
  prompts: PromptInfo[]
  total: number
}

interface GetPromptResponse {
  prompt: PromptInfo
}

interface SyncResponse {
  message: string
}

interface SyncStatusResponse {
  repository: string | null
  branch: string | null
  sync_status: string
  last_sync_at: string | null
  last_commit_sha: string | null
  last_error: string | null
}

// Route handler type definition
type McpApiRouteHandler = Hono<{
  Variables: {
    requestId?: string
  }
}>

/**
 * Helper function to log errors consistently
 */
function logError(operation: string, error: unknown, metadata?: Record<string, unknown>) {
  logger.error(`Error ${operation}`, {
    error: {
      message: getErrorMessage(error),
      stack: getErrorStack(error),
      code: getErrorCode(error),
    },
    ...metadata && { metadata },
  })
}

export function createMcpApiRoutes(
  promptRegistry: PromptRegistryService,
  syncService: GitHubSyncService | null,
  syncScheduler: SyncScheduler | null
) {
  const mcpApi: McpApiRouteHandler = new Hono()

  /**
   * GET /prompts - List all prompts with optional search filtering
   * 
   * @query {string} [search] - Optional search term to filter prompts
   * @returns {ListPromptsResponse} List of prompts and total count
   */
  mcpApi.get('/prompts', async c => {
    // Validate query parameters
    const queryResult = listPromptsQuerySchema.safeParse(c.req.query())
    if (!queryResult.success) {
      const zodResponse = handleZodError(queryResult.error, c)
      if (zodResponse) {
        return zodResponse
      }
      return createErrorResponse(c, 'Invalid request parameters', HTTP_STATUS.BAD_REQUEST)
    }

    const { search } = queryResult.data

    try {
      let prompts = promptRegistry.listPrompts()

      // Apply search filter if provided
      if (search) {
        const searchLower = search.toLowerCase()
        prompts = prompts.filter(
          p =>
            p.name.toLowerCase().includes(searchLower) ||
            p.description?.toLowerCase().includes(searchLower) ||
            p.promptId.toLowerCase().includes(searchLower)
        )
      }

      const response: ListPromptsResponse = {
        prompts,
        total: prompts.length,
      }

      return c.json(response)
    } catch (error) {
      logError('listing prompts', error)
      return createErrorResponse(
        c,
        'Failed to list prompts',
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      )
    }
  })

  /**
   * GET /prompts/:id - Get details for a specific prompt
   * 
   * @param {string} id - The prompt ID
   * @returns {GetPromptResponse} Prompt details
   */
  mcpApi.get('/prompts/:id', async c => {
    // Validate route parameter
    const paramResult = promptIdParamSchema.safeParse(c.req.param())
    if (!paramResult.success) {
      const zodResponse = handleZodError(paramResult.error, c)
      if (zodResponse) {
        return zodResponse
      }
      return createErrorResponse(c, 'Invalid prompt ID', HTTP_STATUS.BAD_REQUEST)
    }

    const { id: promptId } = paramResult.data

    try {
      const prompt = promptRegistry.getPrompt(promptId)

      if (!prompt) {
        return createErrorResponse(
          c,
          'Prompt not found',
          HTTP_STATUS.NOT_FOUND,
          'not_found'
        )
      }

      const response: GetPromptResponse = { prompt }
      return c.json(response)
    } catch (error) {
      logError('getting prompt', error, { promptId })
      return createErrorResponse(
        c,
        'Failed to get prompt',
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      )
    }
  })

  /**
   * POST /sync - Trigger manual GitHub sync
   * 
   * @returns {SyncResponse} Success message
   */
  mcpApi.post('/sync', async c => {
    if (!syncScheduler) {
      return createErrorResponse(
        c,
        'GitHub sync not configured',
        501,
        'not_implemented'
      )
    }

    try {
      await syncScheduler.triggerSync()
      const response: SyncResponse = {
        message: 'Sync triggered successfully',
      }
      return c.json(response)
    } catch (error) {
      logError('triggering sync', error)
      const message = error instanceof Error ? error.message : 'Failed to trigger sync'
      return createErrorResponse(
        c,
        message,
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      )
    }
  })

  /**
   * GET /sync/status - Get current GitHub sync status
   * 
   * @returns {SyncStatusResponse} Current sync status and details
   */
  mcpApi.get('/sync/status', async c => {
    if (!syncService) {
      const response: SyncStatusResponse = {
        repository: null,
        branch: null,
        sync_status: 'not_configured',
        last_sync_at: null,
        last_commit_sha: null,
        last_error: 'GitHub sync service not configured',
      }
      return c.json(response)
    }

    try {
      const status = await syncService.getSyncStatus()
      const response: SyncStatusResponse = status 
        ? {
            ...status,
            last_sync_at: status.last_sync_at ? status.last_sync_at.toISOString() : null,
          }
        : {
            repository: null,
            branch: null,
            sync_status: 'never_synced',
            last_sync_at: null,
            last_commit_sha: null,
            last_error: null,
          }
      return c.json(response)
    } catch (error) {
      logError('getting sync status', error)
      return createErrorResponse(
        c,
        'Failed to get sync status',
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      )
    }
  })

  return mcpApi
}
