import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { container } from './container'
import { config, validateConfig } from './config'
import { loggingMiddleware } from './middleware/logger'
import { validationMiddleware } from './middleware/validation'
import { createRateLimiter, createDomainRateLimiter } from './middleware/rate-limit'
import { createHealthRoutes } from './routes/health'
import { initializeSlack } from './slack'
import { initializeDatabase } from './storage'
import { logger } from './middleware/logger'
import { HonoVariables, HonoBindings } from './types/context'

/**
 * Create and configure the Hono application
 * This is now much cleaner with all business logic extracted
 */
export async function createApp(): Promise<Hono<{ Variables: HonoVariables; Bindings: HonoBindings }>> {
  // Validate configuration
  validateConfig()
  
  // Initialize external services
  await initializeExternalServices()
  
  const app = new Hono<{ Variables: HonoVariables; Bindings: HonoBindings }>()
  
  // Centralized error handler
  app.onError((err, c) => {
    const requestId = c.get('requestId') || 'unknown'
    
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      requestId,
      path: c.req.path,
      method: c.req.method,
      domain: c.get('domain')
    })
    
    // Don't expose internal errors to clients
    const message = config.server.env === 'development' ? err.message : 'Internal server error'
    
    return c.json({
      error: {
        message,
        type: 'internal_error',
        request_id: requestId
      }
    }, err.status || 500)
  })
  
  // Global middleware
  app.use('*', cors())
  app.use('*', loggingMiddleware())
  
  // Rate limiting
  if (config.features.enableMetrics) {
    app.use('/v1/*', createRateLimiter())
    app.use('/v1/*', createDomainRateLimiter())
  }
  
  // Validation for API routes
  app.use('/v1/*', validationMiddleware())
  
  // Health check routes
  if (config.features.enableHealthChecks) {
    const healthRoutes = createHealthRoutes({
      pool: container.getDbPool(),
      version: process.env.npm_package_version
    })
    app.route('/health', healthRoutes)
  }
  
  // Token stats endpoint
  app.get('/token-stats', (c) => {
    const domain = c.req.query('domain')
    const stats = container.getMetricsService().getStats(domain)
    return c.json(stats)
  })
  
  // Storage API endpoints
  const storageService = container.getStorageService()
  if (storageService) {
    app.get('/api/requests', async (c) => {
      const domain = c.req.query('domain')
      const limit = parseInt(c.req.query('limit') || '100')
      
      try {
        const requests = await storageService.getRequestsByDomain(domain || '', limit)
        return c.json({
          status: 'ok',
          requests,
          count: requests.length
        })
      } catch (error) {
        logger.error('Failed to get requests', { error: error.message })
        return c.json({ error: 'Failed to retrieve requests' }, 500)
      }
    })
    
    app.get('/api/requests/:requestId', async (c) => {
      const requestId = c.req.param('requestId')
      
      try {
        const details = await storageService.getRequestDetails(requestId)
        if (!details.request) {
          return c.json({ error: 'Request not found' }, 404)
        }
        return c.json({
          status: 'ok',
          ...details
        })
      } catch (error) {
        logger.error('Failed to get request details', { error: error.message })
        return c.json({ error: 'Failed to retrieve request details' }, 500)
      }
    })
    
    app.get('/api/storage-stats', async (c) => {
      const domain = c.req.query('domain')
      const since = c.req.query('since')
      
      try {
        const stats = await storageService.getStats(
          domain,
          since ? new Date(since) : undefined
        )
        return c.json({
          status: 'ok',
          stats
        })
      } catch (error) {
        logger.error('Failed to get storage stats', { error: error.message })
        return c.json({ error: 'Failed to retrieve statistics' }, 500)
      }
    })
  }
  
  // Client setup files
  app.get('/client-setup/:filename', async (c) => {
    const filename = c.req.param('filename')
    
    // Validate filename to prevent directory traversal
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return c.text('Invalid filename', 400)
    }
    
    try {
      const fs = await import('fs')
      const path = await import('path')
      const filePath = path.join(process.cwd(), 'client-setup', filename)
      
      if (!fs.existsSync(filePath)) {
        return c.text('File not found', 404)
      }
      
      const content = fs.readFileSync(filePath, 'utf-8')
      const contentType = filename.endsWith('.json') ? 'application/json' :
                         filename.endsWith('.js') ? 'application/javascript' :
                         filename.endsWith('.sh') ? 'text/x-shellscript' :
                         'text/plain'
      
      return c.text(content, 200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600'
      })
    } catch (error) {
      logger.error('Failed to serve client setup file', {
        filename,
        error: error.message
      })
      return c.text('Internal server error', 500)
    }
  })
  
  // Main API routes
  const messageController = container.getMessageController()
  app.post('/v1/messages', (c) => messageController.handle(c))
  app.options('/v1/messages', (c) => messageController.handleOptions(c))
  
  // Root endpoint
  app.get('/', (c) => {
    return c.json({
      service: 'claude-nexus-proxy',
      version: process.env.npm_package_version || 'unknown',
      status: 'operational',
      endpoints: {
        api: '/v1/messages',
        health: '/health',
        metrics: '/metrics',
        stats: '/token-stats'
      }
    })
  })
  
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
      logger.error('Failed to initialize database', { error: error.message })
      if (config.storage.enabled) {
        throw error // Fatal if storage is required
      }
    }
  }
  
  // Initialize Slack if configured
  if (config.slack.enabled && config.slack.webhookUrl) {
    try {
      await initializeSlack(
        config.slack.webhookUrl,
        config.slack.channel,
        config.slack.username,
        config.slack.iconEmoji
      )
      logger.info('Slack integration initialized')
    } catch (error) {
      logger.error('Failed to initialize Slack', { error: error.message })
      // Non-fatal, continue without Slack
    }
  }
  
  // Log startup configuration
  logger.info('Service starting', {
    version: process.env.npm_package_version || 'unknown',
    environment: config.server.env,
    features: {
      storage: config.storage.enabled,
      slack: config.slack.enabled,
      telemetry: config.telemetry.enabled,
      healthChecks: config.features.enableHealthChecks
    }
  })
}