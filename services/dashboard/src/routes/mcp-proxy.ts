/**
 * Proxy routes for MCP API endpoints
 *
 * Provides a secure proxy layer for the dashboard to access MCP endpoints
 * without exposing the dashboard API key to the browser.
 */

import { Hono } from 'hono'
import type { ProxyApiClient } from '../services/api-client.js'
import { csrfProtection } from '../middleware/csrf.js'
import { logger } from '../middleware/logger.js'
import { getErrorMessage } from '@claude-nexus/shared'

interface McpSyncResponse {
  message: string
}

interface McpSyncStatusResponse {
  repository: string | null
  branch: string | null
  sync_status: string
  last_sync_at: string | null
  last_commit_sha: string | null
  last_error: string | null
}

export const mcpProxyRoutes = new Hono<{
  Variables: {
    apiClient?: ProxyApiClient
    csrfToken?: string
  }
}>()

// Apply CSRF protection to all routes
mcpProxyRoutes.use('*', csrfProtection())

/**
 * POST /dashboard/api/mcp/sync - Trigger GitHub sync
 */
mcpProxyRoutes.post('/mcp/sync', async c => {
  const apiClient = c.get('apiClient')

  if (!apiClient) {
    logger.error('MCP sync proxy: API client not configured')
    return c.json({ error: 'API client not configured' }, 500)
  }

  try {
    const response = await apiClient.fetch('/api/mcp/sync', {
      method: 'POST',
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('MCP sync proxy: upstream error', {
        statusCode: response.status,
        statusText: response.statusText,
        errorText,
      })

      // Try to parse error response
      try {
        const errorData = JSON.parse(errorText)
        return c.json(errorData, response.status as any)
      } catch {
        return c.json({ error: 'Failed to trigger sync' }, response.status as any)
      }
    }

    const data = (await response.json()) as McpSyncResponse
    return c.json(data)
  } catch (error) {
    logger.error('MCP sync proxy: request failed', {
      error: getErrorMessage(error),
    })
    return c.json({ error: 'Failed to trigger sync' }, 500)
  }
})

/**
 * GET /dashboard/api/mcp/sync/status - Get sync status
 */
mcpProxyRoutes.get('/mcp/sync/status', async c => {
  const apiClient = c.get('apiClient')

  if (!apiClient) {
    logger.error('MCP sync status proxy: API client not configured')
    return c.json({ error: 'API client not configured' }, 500)
  }

  try {
    const response = await apiClient.fetch('/api/mcp/sync/status')

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('MCP sync status proxy: upstream error', {
        statusCode: response.status,
        statusText: response.statusText,
        errorText,
      })

      // Try to parse error response
      try {
        const errorData = JSON.parse(errorText)
        return c.json(errorData, response.status as any)
      } catch {
        return c.json({ error: 'Failed to get sync status' }, response.status as any)
      }
    }

    const data = (await response.json()) as McpSyncStatusResponse
    return c.json(data)
  } catch (error) {
    logger.error('MCP sync status proxy: request failed', {
      error: getErrorMessage(error),
    })
    return c.json({ error: 'Failed to get sync status' }, 500)
  }
})
