import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { container } from './container.js'
import { config, validateConfig } from '@claude-nexus/shared/config'
import { requestIdMiddleware, HonoVariables, HonoBindings } from '@claude-nexus/shared'
import { loggingMiddleware, logger } from './middleware/logger.js'
import { validationMiddleware } from './middleware/validation.js'
import { createRateLimiter, createDomainRateLimiter } from './middleware/rate-limit.js'
import { createHealthRoutes } from './routes/health.js'
import { apiRoutes } from './routes/api.js'
import { sparkApiRoutes } from './routes/spark-api.js'
import { analysisRoutes } from './routes/analyses.js'
import { initializeAnalysisRateLimiters } from './middleware/analysis-rate-limit.js'
import { createMcpApiRoutes } from './routes/mcp-api.js'
import { initializeSlack } from './services/slack.js'
import { initializeDatabase } from './storage/writer.js'
import { apiAuthMiddleware } from './middleware/api-auth.js'
import { domainExtractorMiddleware } from './middleware/domain-extractor.js'
import { clientAuthMiddleware } from './middleware/client-auth.js'
import { createErrorResponse } from './utils/error-response.js'
import { createEndpointMetadata } from './utils/endpoint-metadata.js'
import { handleClientSetup } from './handlers/client-setup.js'
import { ERROR_MESSAGES, ERROR_TYPES, HTTP_STATUS, SERVICE_NAME, SERVICE_VERSION } from './constants.js'

/**
 * Apply rate limiting middleware to a route pattern
 */
function applyRateLimitingMiddleware(app: Hono<{ Variables: HonoVariables; Bindings: HonoBindings }>, pattern: string) {
  if (config.features.enableMetrics) {
    app.use(pattern, createRateLimiter())
    app.use(pattern, createDomainRateLimiter())
  }
}

/**
 * Create and configure the Proxy application
 */
export async function createProxyApp(): Promise<
  Hono<{ Variables: HonoVariables; Bindings: HonoBindings }>
> {
  // Validate configuration
  validateConfig()

  // Initialize external services
  await initializeExternalServices()

  // Initialize AI analysis rate limiters
  initializeAnalysisRateLimiters()

  // Log pool status after initialization
  const pool = container.getDbPool()
  logger.info('Proxy app initialization', {
    metadata: {
      hasPool: !!pool,
      storageEnabled: config.storage.enabled,
      databaseUrl: config.database.url ? 'configured' : 'not configured',
    },
  })

  const app = new Hono<{ Variables: HonoVariables; Bindings: HonoBindings }>()

  // Centralized error handler
  app.onError((err, c) => {
    const requestId = c.get('requestId') || 'unknown'

    logger.error('Unhandled error', {
      error: { message: err.message, stack: err.stack },
      requestId,
      path: c.req.path,
      method: c.req.method,
      domain: c.get('domain'),
      metadata: {},
    })

    // Don't expose internal errors to clients
    const message = config.server.env === 'development' ? err.message : ERROR_MESSAGES.INTERNAL_SERVER_ERROR
    const status = (err as any).status || HTTP_STATUS.INTERNAL_SERVER_ERROR

    return createErrorResponse(c, message, status)
  })

  // Global middleware
  app.use('*', cors())
  app.use('*', requestIdMiddleware()) // Generate request ID first
  app.use('*', loggingMiddleware()) // Then use it for logging

  // Domain extraction for all routes
  app.use('*', domainExtractorMiddleware())

  // Client authentication for proxy routes
  // Apply before rate limiting to protect against unauthenticated requests
  if (config.features.enableClientAuth !== false) {
    app.use('/v1/*', clientAuthMiddleware())
  }

  // Rate limiting
  applyRateLimitingMiddleware(app, '/v1/*')

  // Validation for API routes
  app.use('/v1/*', validationMiddleware())

  // Health check routes
  if (config.features.enableHealthChecks) {
    const healthRoutes = createHealthRoutes({
      pool: container.getDbPool(),
      version: SERVICE_VERSION,
    })
    app.route('/health', healthRoutes)
  }

  // Token stats endpoint
  app.get('/token-stats', c => {
    const domain = c.req.query('domain')
    const stats = container.getMetricsService().getStats(domain)
    return c.json(stats)
  })

  // OAuth refresh metrics endpoint
  app.get('/oauth-metrics', async c => {
    const { getRefreshMetrics } = await import('./credentials.js')
    const metrics = getRefreshMetrics()
    return c.json(metrics)
  })

  // Dashboard API routes with authentication
  app.use('/api/*', apiAuthMiddleware())
  app.use('/api/*', async (c, next) => {
    // Inject pool into context for API routes
    const pool = container.getDbPool()
    if (!pool) {
      logger.error('Database pool not available for API request', {
        path: c.req.path,
      })
      return createErrorResponse(
        c,
        ERROR_MESSAGES.DATABASE_UNAVAILABLE,
        HTTP_STATUS.SERVICE_UNAVAILABLE,
        ERROR_TYPES.SERVICE_UNAVAILABLE,
        'service_unavailable'
      )
    }
    c.set('pool', pool)
    await next()
  })
  app.route('/api', apiRoutes)

  // Spark API routes (protected by same auth as dashboard API)
  app.route('/api', sparkApiRoutes)

  // AI Analysis routes (protected by same auth as dashboard API)
  app.route('/api/analyses', analysisRoutes)

  // MCP routes
  if (config.mcp.enabled) {
    // Apply client authentication to MCP routes
    app.use('/mcp/*', clientAuthMiddleware())

    // Apply rate limiting to MCP routes
    applyRateLimitingMiddleware(app, '/mcp/*')

    const mcpHandler = container.getMcpHandler()
    const promptRegistry = container.getPromptRegistry()
    const syncService = container.getGitHubSyncService()
    const syncScheduler = container.getSyncScheduler()

    if (mcpHandler) {
      // MCP JSON-RPC endpoint (now protected by auth)
      app.post('/mcp', c => mcpHandler.handle(c))

      // MCP discovery endpoint (now protected by auth)
      app.get('/mcp', c => {
        return c.json({
          name: `${SERVICE_NAME}-mcp-server`,
          version: '1.0.0',
          capabilities: {
            prompts: {
              listPrompts: true,
              getPrompt: true,
            },
          },
        })
      })
    }

    // MCP Dashboard API routes (protected by dashboard auth)
    if (promptRegistry) {
      const mcpApiRoutes = createMcpApiRoutes(
        promptRegistry,
        syncService || null,
        syncScheduler || null
      )
      app.route('/api/mcp', mcpApiRoutes)
      logger.info('MCP API routes registered at /api/mcp')
    } else {
      logger.warn('MCP API routes not registered - prompt registry not available')
    }
  }

  // Client setup files
  app.get('/client-setup/:filename', handleClientSetup)

  // Main API routes
  const messageController = container.getMessageController()
  app.post('/v1/messages', c => messageController.handle(c))
  app.options('/v1/messages', c => messageController.handleOptions(c))

  // Root endpoint
  app.get('/', c => c.json(createEndpointMetadata()))

  return app
}

/**
 * Initialize external services
 */
async function initializeExternalServices(): Promise<void> {
  // Initialize database if configured
  const pool = container.getDbPool()
  if (pool) {
    try {
      await initializeDatabase(pool)
      logger.info('Database initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize database', {
        error: error instanceof Error ? { message: error.message } : { message: String(error) },
      })
      if (config.storage.enabled) {
        throw error // Fatal if storage is required
      }
    }
  }

  // Initialize Slack if configured
  if (config.slack.enabled && config.slack.webhookUrl) {
    try {
      initializeSlack(config.slack)
      logger.info('Slack integration initialized')
    } catch (error) {
      logger.error('Failed to initialize Slack', {
        error: error instanceof Error ? { message: error.message } : { message: String(error) },
      })
      // Non-fatal, continue without Slack
    }
  }

  // Log startup configuration
  logger.info('Proxy service starting', {
    metadata: {
      version: SERVICE_VERSION,
      environment: config.server.env,
      features: {
        storage: config.storage.enabled,
        slack: config.slack.enabled,
        telemetry: config.telemetry.enabled,
        healthChecks: config.features.enableHealthChecks,
        mcp: config.mcp.enabled,
      },
      mcp: config.mcp.enabled
        ? {
            github: {
              owner: config.mcp.github.owner || 'not configured',
              repo: config.mcp.github.repo || 'not configured',
              path: config.mcp.github.path,
            },
            sync: {
              interval: config.mcp.sync.interval,
            },
          }
        : undefined,
    },
  })
}
