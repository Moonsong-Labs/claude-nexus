/**
 * Proxy Service - Server Entry Point
 * Handles HTTP server startup and graceful shutdown
 */

import { serve } from '@hono/node-server'
import { config, createLogger } from '@claude-nexus/shared'
import { createProxyApp } from './app.js'
import { container } from './container.js'
import { tokenTracker } from './services/tokenTracker.js'
import { startAnalysisWorker } from './workers/ai-analysis/index.js'

// Create logger for this service
const logger = createLogger({ service: 'proxy' })

async function startServer() {
  try {
    logger.info('Starting proxy service', {
      metadata: {
        version: process.env.npm_package_version || '2.0.0',
        environment: config.server.env,
        features: {
          storage: config.storage.enabled ? 'enabled' : 'disabled',
          telemetry: config.telemetry.enabled ? 'enabled' : 'disabled',
          sparkApi: config.spark.enabled ? 'enabled' : 'disabled',
        },
      },
    })

    // Create the Hono app (dependencies are managed by container)
    const app = await createProxyApp()

    // Start token tracking
    tokenTracker.startReporting()

    // Start AI Analysis Worker
    const analysisWorker = startAnalysisWorker()

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
        sparkApi: config.spark.enabled
          ? {
              enabled: true,
              url: config.spark.apiUrl,
              hasApiKey: !!config.spark.apiKey,
            }
          : {
              enabled: false,
              reason: !config.spark.apiKey ? 'SPARK_API_KEY not set' : 'SPARK_ENABLED is false',
            },
      },
    })

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down proxy service...')

      // Print final token stats
      tokenTracker.printStats()
      tokenTracker.stopReporting()

      // Stop analysis worker
      if (analysisWorker) {
        await analysisWorker.stop()
      }

      // Cleanup container resources (database pool, storage, etc.)
      await container.cleanup()

      // Close server
      server.close()

      logger.info('Proxy service shut down successfully')
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
    process.on('SIGQUIT', shutdown)
  } catch (error) {
    logger.error('Failed to start server', {
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    })
    process.exit(1)
  }
}

// Error handling for uncaught errors
process.on('unhandledRejection', (reason, _promise) => {
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
