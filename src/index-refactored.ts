import { serve } from '@hono/node-server'
import { createApp } from './app'
import { config } from './config'
import { container } from './container'
import { logger } from './middleware/logger'
import { tokenTracker } from './tokenTracker'
import { closeRateLimitStores } from './middleware/rate-limit'

/**
 * Main entry point for the refactored application
 * Much cleaner with all logic properly separated
 */
async function main() {
  try {
    // Create the application
    const app = await createApp()
    
    // Start the server
    const server = serve({
      fetch: app.fetch,
      port: config.server.port,
      hostname: config.server.host
    })
    
    logger.info('Server started', {
      port: config.server.port,
      host: config.server.host,
      environment: config.server.env
    })
    
    // Start token stats reporting in Node.js mode
    if (typeof process !== 'undefined' && process.versions?.node) {
      setInterval(() => {
        tokenTracker.printStats()
      }, 10000) // Every 10 seconds
    }
    
    // Graceful shutdown
    setupGracefulShutdown(server)
    
  } catch (error) {
    logger.error('Failed to start server', { error: error.message })
    process.exit(1)
  }
}

/**
 * Setup graceful shutdown handlers
 */
function setupGracefulShutdown(server: any): void {
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, starting graceful shutdown`)
    
    try {
      // Stop accepting new connections
      server.close(() => {
        logger.info('HTTP server closed')
      })
      
      // Give ongoing requests time to complete
      const shutdownTimeout = setTimeout(() => {
        logger.warn('Forcefully shutting down after timeout')
        process.exit(1)
      }, 30000) // 30 second timeout
      
      // Print final token stats
      tokenTracker.printStats()
      
      // Close rate limit stores
      closeRateLimitStores()
      
      // Clean up container resources
      await container.cleanup()
      
      clearTimeout(shutdownTimeout)
      logger.info('Graceful shutdown complete')
      process.exit(0)
      
    } catch (error) {
      logger.error('Error during shutdown', { error: error.message })
      process.exit(1)
    }
  }
  
  // Handle various shutdown signals
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGQUIT', () => shutdown('SIGQUIT'))
  
  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack })
    shutdown('uncaughtException')
  })
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { reason, promise })
    shutdown('unhandledRejection')
  })
}

// Start the application
main()

// Export for testing
export default createApp