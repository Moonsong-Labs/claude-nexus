import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { container } from './container.js'
import { loggingMiddleware, logger } from './middleware/logger.js'
import { requestIdMiddleware, getErrorMessage, getStatusCode } from '@claude-nexus/shared'
import { dashboardRoutes } from './routes/dashboard-api.js'
import { conversationDetailRoutes } from './routes/conversation-detail.js'
import { dashboardAuth } from './middleware/auth.js'
import { sparkProxyRoutes } from './routes/spark-proxy.js'
import { analysisRoutes } from './routes/analysis-api.js'
import { analysisPartialsRoutes } from './routes/partials/analysis.js'
import { analyticsPartialRoutes } from './routes/partials/analytics.js'
import { mcpProxyRoutes } from './routes/mcp-proxy.js'
import type { ProxyApiClient } from './services/api-client.js'

// Constants
const HEALTH_CHECK_TIMEOUT_MS = 5000 // 5 seconds

// Type definitions
type AppVariables = {
  apiClient: ProxyApiClient
}

/**
 * Creates and configures the dashboard web application.
 *
 * This function sets up:
 * - Global middleware (CORS, request ID generation, logging)
 * - Health check endpoint with proxy API connectivity check
 * - API endpoints for dashboard data (requests, stats, conversations)
 * - Dashboard HTML routes with authentication
 * - Proxy routes for Spark and MCP integrations
 *
 * @returns Configured Hono application instance
 */
export async function createDashboardApp(): Promise<Hono<{ Variables: AppVariables }>> {
  const app = new Hono<{ Variables: AppVariables }>()

  // Centralized error handler
  app.onError((err, c) => {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: c.req.path,
      method: c.req.method,
    })

    // Don't expose internal errors to clients
    const message = process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'

    const status = getStatusCode(err)

    return c.json(
      {
        error: {
          message,
          type: 'internal_error',
        },
      },
      status as 500
    )
  })

  // Global middleware
  app.use('*', cors())
  app.use('*', requestIdMiddleware()) // Generate request ID first
  app.use('*', loggingMiddleware()) // Then use it for logging

  /**
   * Health check endpoint
   * Returns service status and checks proxy API connectivity
   */
  app.get('/health', async c => {
    const apiClient = container.getApiClient()
    const health: Record<string, unknown> = {
      status: 'healthy',
      service: 'claude-nexus-dashboard',
      version: process.env.npm_package_version || 'unknown',
      timestamp: new Date().toISOString(),
    }

    // Check proxy API connection with timeout
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS)

      // Note: getStats() doesn't currently support signal, but we handle the timeout
      await Promise.race([
        apiClient.getStats(),
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new Error('Health check timeout'))
          )
        }),
      ])

      clearTimeout(timeout)
      health.proxyApi = 'connected'
    } catch (error) {
      health.status = 'unhealthy'
      health.proxyApi = 'disconnected'
      health.error = getErrorMessage(error)
    }

    return c.json(health, health.status === 'healthy' ? 200 : 503)
  })

  /**
   * Get requests by domain
   * @query domain - Optional domain filter
   * @query limit - Maximum number of results (default: 100)
   */
  app.get('/api/requests', async c => {
    const storageService = container.getStorageService()
    const domain = c.req.query('domain')
    const limit = parseInt(c.req.query('limit') || '100')

    try {
      const requests = await storageService.getRequestsByDomain(domain || '', limit)
      return c.json({
        status: 'ok',
        requests,
        count: requests.length,
      })
    } catch (error) {
      logger.error('Failed to get requests', { error: getErrorMessage(error) })
      return c.json({ error: 'Failed to retrieve requests' }, 500)
    }
  })

  /**
   * Get detailed information for a specific request
   * @param requestId - Unique request identifier
   */
  app.get('/api/requests/:requestId', async c => {
    const storageService = container.getStorageService()
    const requestId = c.req.param('requestId')

    try {
      const details = await storageService.getRequestDetails(requestId)
      if (!details.request) {
        return c.json({ error: 'Request not found' }, 404)
      }
      return c.json({
        status: 'ok',
        ...details,
      })
    } catch (error) {
      logger.error('Failed to get request details', { error: getErrorMessage(error) })
      return c.json({ error: 'Failed to retrieve request details' }, 500)
    }
  })

  /**
   * Get storage statistics
   * @query domain - Optional domain filter
   * @query since - Optional date filter (ISO 8601 format)
   */
  app.get('/api/storage-stats', async c => {
    const storageService = container.getStorageService()
    const domain = c.req.query('domain')
    const since = c.req.query('since')

    try {
      const stats = await storageService.getStats(domain, since ? new Date(since) : undefined)
      return c.json({
        status: 'ok',
        stats,
      })
    } catch (error) {
      logger.error('Failed to get storage stats', { error: getErrorMessage(error) })
      return c.json({ error: 'Failed to retrieve statistics' }, 500)
    }
  })

  /**
   * Get conversations with optional filtering
   * @query domain - Optional domain filter
   * @query limit - Maximum number of results (default: 50)
   * @query excludeSubtasks - Whether to exclude subtask conversations (default: false)
   */
  app.get('/api/conversations', async c => {
    const storageService = container.getStorageService()
    const domain = c.req.query('domain')
    const limit = parseInt(c.req.query('limit') || '50')
    const excludeSubtasks = c.req.query('excludeSubtasks') === 'true'

    try {
      const conversations = await storageService.getConversationsWithFilter(
        domain,
        limit,
        excludeSubtasks
      )
      return c.json({
        status: 'ok',
        conversations,
        count: conversations.length,
      })
    } catch (error) {
      logger.error('Failed to get conversations', { error: getErrorMessage(error) })
      return c.json({ error: 'Failed to retrieve conversations' }, 500)
    }
  })

  /**
   * Get subtasks for a specific request
   * @param requestId - Parent request identifier
   */
  app.get('/api/requests/:requestId/subtasks', async c => {
    const storageService = container.getStorageService()
    const requestId = c.req.param('requestId')

    try {
      const subtasks = await storageService.getSubtasksForRequest(requestId)
      return c.json({
        status: 'ok',
        subtasks,
        count: subtasks.length,
      })
    } catch (error) {
      logger.error('Failed to get subtasks', { error: getErrorMessage(error), requestId })
      return c.json({ error: 'Failed to retrieve subtasks' }, 500)
    }
  })

  // Apply auth middleware to all dashboard routes
  app.use('/*', dashboardAuth)

  // Provide API client to all routes via context
  app.use('/*', async (c, next) => {
    c.set('apiClient', container.getApiClient())
    return next()
  })

  // Mount dashboard routes
  app.route('/dashboard', dashboardRoutes)
  app.route('/dashboard', conversationDetailRoutes)
  app.route('/dashboard/api', sparkProxyRoutes)
  app.route('/dashboard/api', mcpProxyRoutes)

  // Mount analysis API routes
  app.route('/api', analysisRoutes)

  // Mount partials routes
  app.route('/partials/analysis', analysisPartialsRoutes)
  app.route('/', analyticsPartialRoutes)

  /**
   * Root endpoint - redirects to dashboard
   */
  app.get('/', c => {
    return c.redirect('/dashboard')
  })

  /**
   * API info endpoint - lists available API endpoints
   */
  app.get('/api', c => {
    return c.json({
      service: 'claude-nexus-dashboard',
      version: process.env.npm_package_version || 'unknown',
      endpoints: {
        dashboard: '/',
        health: '/health',
        requests: '/api/requests',
        stats: '/api/storage-stats',
        conversations: '/api/conversations',
        subtasks: '/api/requests/:requestId/subtasks',
      },
    })
  })

  // Log successful initialization
  logger.info('Dashboard application initialized', {
    proxyUrl: process.env.PROXY_API_URL || 'http://proxy:3000',
  })

  return app
}
