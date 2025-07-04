import { Pool } from 'pg'
import { config, type AnalysisJob } from '@claude-nexus/shared'
import { AnalysisDatabase } from './db.js'
import { GeminiClient } from './geminiClient.js'
import { logger } from './logger.js'

// Use configuration from shared config
const { pollingIntervalMs: POLLING_INTERVAL_MS, watchdogIntervalMs: WATCHDOG_INTERVAL_MS } =
  config.analysisWorker

interface WorkerContext {
  activeJobsCounter: () => number
  incrementActiveJobs: () => void
  decrementActiveJobs: () => void
  isShuttingDown: () => boolean
}

/**
 * Analysis Worker - Processes conversation analysis jobs
 */
export class AnalysisWorker {
  private db: AnalysisDatabase
  private gemini: GeminiClient
  private isRunning = false
  private pollTimer: Timer | null = null
  private watchdogTimer: Timer | null = null

  constructor(
    pool: Pool,
    private context: WorkerContext
  ) {
    this.db = new AnalysisDatabase(pool)
    this.gemini = new GeminiClient()
  }

  /**
   * Start the worker
   */
  start() {
    if (this.isRunning) {
      return
    }

    this.isRunning = true
    logger.info('AnalysisWorker started.')

    // Start polling for jobs
    this.poll()

    // Start watchdog process
    this.watchdogTimer = setInterval(() => {
      this.cleanupStuckJobs().catch(err => {
        console.error('Watchdog error:', err)
      })
    }, WATCHDOG_INTERVAL_MS)
  }

  /**
   * Stop the worker
   */
  stop() {
    this.isRunning = false

    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }

    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer)
      this.watchdogTimer = null
    }

    logger.info('AnalysisWorker stopped.')
  }

  /**
   * Poll for new jobs
   */
  private async poll() {
    if (!this.isRunning || this.context.isShuttingDown()) {
      return
    }

    try {
      const job = await this.db.claimJob()

      if (job) {
        // Process job asynchronously
        this.processJob(job).catch(err => {
          logger.error(`Unhandled error processing job ${job.id}:`, err)
        })
      }
    } catch (error) {
      logger.error('Error during polling/claiming job:', error)
    } finally {
      // Schedule the next poll
      if (this.isRunning && !this.context.isShuttingDown()) {
        this.pollTimer = setTimeout(() => this.poll(), POLLING_INTERVAL_MS)
      }
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: AnalysisJob): Promise<void> {
    const startTime = Date.now()
    this.context.incrementActiveJobs()

    logger.info(
      `Processing job ${job.id} for conversation ${job.conversation_id} (attempt ${job.attempts})`
    )

    try {
      // Validate conversation ID format (UUID)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(job.conversation_id)) {
        throw new Error('Invalid conversation ID format')
      }

      // 1. Fetch conversation messages
      logger.info(`Fetching messages for conversation ${job.conversation_id}...`)
      const messages = await this.db.fetchConversationMessages(job.conversation_id)

      if (messages.length === 0) {
        throw new Error('No messages found for conversation')
      }

      logger.info(`Found ${messages.length} messages to analyze`)

      // 2. Analyze with Gemini
      logger.info('Calling Gemini API for analysis...')
      const { analysis, usage } = await this.gemini.analyzeConversation(messages)

      logger.info(`Analysis completed. Tokens used: ${usage.total_tokens}`)

      // 3. Store the analysis result
      await this.db.upsertAnalysisResult(
        job.conversation_id,
        analysis,
        config.gemini.model,
        usage.prompt_tokens,
        usage.completion_tokens
      )

      // 4. Mark job as completed
      const durationMs = Date.now() - startTime
      await this.db.markJobCompleted(
        job.id,
        durationMs,
        usage.prompt_tokens,
        usage.completion_tokens
      )

      logger.info(`Job ${job.id} completed successfully in ${durationMs}ms`)
    } catch (error) {
      const _durationMs = Date.now() - startTime
      logger.error(`Error processing job ${job.id} (attempt ${job.attempts}):`, error)

      // Determine if we should retry
      const isRetryable = job.attempts < config.gemini.maxRetries
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      // Mark job as failed or pending for retry
      await this.db.markJobFailed(job.id, errorMessage, job.attempts)

      if (isRetryable) {
        logger.info(
          `Job ${job.id} failed, will be retried (${job.attempts}/${config.gemini.maxRetries} attempts used)`
        )
      } else {
        logger.error(`Job ${job.id} failed permanently after ${job.attempts} attempts`)
      }
    } finally {
      this.context.decrementActiveJobs()
    }
  }

  /**
   * Cleanup stuck jobs (watchdog process)
   */
  private async cleanupStuckJobs(): Promise<void> {
    try {
      logger.info('Running watchdog for stuck jobs...')
      const resetJobIds = await this.db.resetStuckJobs()

      if (resetJobIds.length > 0) {
        logger.warn(`Watchdog reset ${resetJobIds.length} stuck jobs:`, resetJobIds)
      }
    } catch (error) {
      logger.error('Error in watchdog process:', error)
    }
  }
}
