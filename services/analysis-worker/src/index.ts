import { Pool } from 'pg'
import { config } from '@claude-nexus/shared'
import { AnalysisWorker } from './worker.js'
import { logger } from './logger.js'

// Global state for graceful shutdown
let shuttingDown = false
let activeJobs = 0
let worker: AnalysisWorker | null = null

/**
 * Main entry point for the analysis worker service
 */
async function main() {
  logger.info('Starting Analysis Worker Service...')

  // Validate configuration
  if (!config.database.url) {
    logger.error('DATABASE_URL is required')
    process.exit(1)
  }

  if (!config.gemini.enabled || !config.gemini.apiKey) {
    logger.error('GEMINI_API_KEY is required for analysis worker')
    process.exit(1)
  }

  // Initialize database connection pool
  const pool = new Pool({
    connectionString: config.database.url,
    max: config.database.poolSize,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  })

  // Test database connection
  try {
    await pool.query('SELECT 1')
    logger.info('Database connection successful')
  } catch (error) {
    logger.error('Failed to connect to database:', error)
    process.exit(1)
  }

  // Initialize and start the worker
  worker = new AnalysisWorker(pool, {
    activeJobsCounter: () => activeJobs,
    incrementActiveJobs: () => activeJobs++,
    decrementActiveJobs: () => activeJobs--,
    isShuttingDown: () => shuttingDown,
  })

  worker.start()

  logger.info('Analysis Worker started successfully')
  logger.info(`- Polling interval: ${config.analysisWorker.pollingIntervalMs / 1000} seconds`)
  logger.info(`- Watchdog interval: ${config.analysisWorker.watchdogIntervalMs / 1000} seconds`)
  logger.info(`- Max retries: ${config.gemini.maxRetries}`)
  logger.info(`- Stuck job timeout: ${config.analysisWorker.stuckJobTimeoutMs / 1000 / 60} minutes`)
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown() {
  logger.info('Shutdown signal received. Stopping new work...')
  shuttingDown = true

  // Stop the worker from claiming new jobs
  if (worker) {
    worker.stop()
  }

  // Wait for active jobs to finish, with a timeout
  const deadline = Date.now() + 30000 // 30s timeout
  while (activeJobs > 0 && Date.now() < deadline) {
    logger.info(`Waiting for ${activeJobs} job(s) to finish...`)
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  if (activeJobs > 0) {
    logger.warn(`Forcing shutdown with ${activeJobs} job(s) still active.`)
  }

  logger.info('Exiting.')
  process.exit(0)
}

// Register shutdown handlers
process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

// Handle uncaught errors
process.on('uncaughtException', error => {
  logger.error('Uncaught exception:', error)
  gracefulShutdown()
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason)
  gracefulShutdown()
})

// Start the service
main().catch(error => {
  logger.error('Fatal error during startup:', error)
  process.exit(1)
})
