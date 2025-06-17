/**
 * Proxy Service - Composition Root
 * This is where all dependencies are wired together
 */

import { serve } from '@hono/node-server'
import { Pool } from 'pg'
import { config, createLogger } from '@claude-nexus/shared'
import { createProxyApp } from './app.js'
import { ProxyService } from './services/ProxyService.js'
import { AuthenticationService } from './services/AuthenticationService.js'
import { ClaudeApiClient } from './services/ClaudeApiClient.js'
import { MetricsService } from './services/MetricsService.js'
import { NotificationService } from './services/NotificationService.js'
import { StorageWriter } from './storage/writer.js'
import { StorageAdapter } from './storage/StorageAdapter.js'
import { MessageController } from './controllers/MessageController.js'
import { tokenTracker } from './services/tokenTracker.js'

// Create logger for this service
const logger = createLogger({ service: 'proxy' })

async function startServer() {
  logger.info('Starting proxy service', {
    metadata: {
      version: process.env.npm_package_version || '2.0.0',
      environment: config.server.env,
    },
  })

  // === COMPOSITION ROOT START ===

  // 1. Create foundational dependencies (no dependencies)
  const dbPool = config.database.url
    ? new Pool({
        connectionString: config.database.url,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      })
    : undefined

  // 2. Create services with their dependencies
  const authService = new AuthenticationService(config.api.claudeApiKey, config.auth.credentialsDir)

  const apiClient = new ClaudeApiClient()
  const notificationService = new NotificationService()

  // Wire up auth service to notification service
  notificationService.setAuthService(authService)

  // Create storage service if database is configured
  const storageService = dbPool && config.storage.enabled ? new StorageAdapter(dbPool) : undefined

  // Create metrics service with its dependencies
  const metricsService = new MetricsService(
    {
      enableTokenTracking: true,
      enableStorage: config.storage.enabled,
      enableTelemetry: config.telemetry.enabled,
    },
    storageService,
    config.telemetry.endpoint
  )

  // 3. Create the main proxy service with all its dependencies
  const proxyService = new ProxyService(authService, apiClient, notificationService, metricsService)

  // 4. Create the controller
  const messageController = new MessageController(proxyService)

  // === COMPOSITION ROOT END ===

  // Create the Hono app with all dependencies
  const app = await createProxyApp()

  // Start token tracking
  tokenTracker.startReporting()

  // Start the server
  const server = serve({
    fetch: app.fetch,
    port: config.server.port,
    hostname: config.server.host,
  })

  logger.info('Proxy service started', {
    metadata: {
      port: config.server.port,
      host: config.server.host,
    },
  })

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down proxy service...')

    // Print final token stats
    tokenTracker.printStats()
    tokenTracker.stopReporting()

    // Close storage service
    // Note: StorageAdapter doesn't have a close method,
    // the pool will be closed separately

    // Close database pool
    if (dbPool) {
      await dbPool.end()
    }

    // Close server
    server.close()

    logger.info('Proxy service shut down successfully')
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  process.on('SIGQUIT', shutdown)
}

// Error handling for uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    error: {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    },
  })
})

// Start the server
startServer().catch(err => {
  logger.error('Failed to start server', {
    error: {
      message: err.message,
      stack: err.stack,
    },
  })
  process.exit(1)
})
