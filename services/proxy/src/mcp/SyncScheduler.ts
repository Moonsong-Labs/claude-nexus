/**
 * Scheduler for periodic GitHub synchronization
 *
 * This class manages automated periodic synchronization of prompts from a GitHub repository.
 * It uses a recursive setTimeout pattern to avoid timer drift and provides graceful shutdown
 * capabilities that wait for any ongoing sync operations to complete.
 */

import type { GitHubSyncService } from './GitHubSyncService.js'
import { config, getErrorMessage, getErrorStack, getErrorCode } from '@claude-nexus/shared'
import { logger } from '../middleware/logger.js'

export class SyncScheduler {
  private timeoutId?: ReturnType<typeof setTimeout>
  private syncInProgress: Promise<void> | null = null
  private isStopping = false

  constructor(private readonly syncService: GitHubSyncService) {}

  /**
   * Indicates whether a sync operation is currently in progress.
   * @returns {boolean} True if a sync is running, false otherwise.
   */
  public get isRunning(): boolean {
    return !!this.syncInProgress
  }

  /**
   * Starts the scheduler. Runs an initial sync immediately and then schedules
   * subsequent syncs at the configured interval.
   *
   * If the scheduler is already running or in the process of stopping, this is a no-op.
   *
   * @returns {Promise<void>} A promise that resolves after the initial sync attempt completes.
   */
  public async start(): Promise<void> {
    if (this.timeoutId || this.isStopping) {
      logger.info('Sync scheduler is already running or stopping')
      return
    }

    const intervalSeconds = config.mcp.sync.interval
    logger.info(`Starting MCP sync scheduler (interval: ${intervalSeconds}s)`)

    // Run initial sync and wait for completion
    // Log errors but don't prevent scheduler from starting
    await this.triggerSync().catch(error => {
      logger.error('Initial sync failed on start', {
        error: {
          message: getErrorMessage(error),
          stack: getErrorStack(error),
          code: getErrorCode(error),
        },
      })
    })

    // Start the scheduling loop
    this.isStopping = false
    this.scheduleNextSync(intervalSeconds * 1000)
  }

  /**
   * Stops the scheduler gracefully.
   *
   * Cancels any pending sync operations and waits for any ongoing sync
   * to complete before returning.
   *
   * @returns {Promise<void>} A promise that resolves when the scheduler has fully stopped.
   */
  public async stop(): Promise<void> {
    if (!this.timeoutId && !this.isRunning) {
      logger.info('Sync scheduler is not running')
      return
    }

    logger.info('Stopping MCP sync scheduler...')
    this.isStopping = true

    // Cancel any scheduled sync
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = undefined
    }

    // Wait for any ongoing sync to complete
    if (this.syncInProgress) {
      logger.info('Waiting for ongoing sync to complete...')
      await this.syncInProgress
    }

    logger.info('MCP sync scheduler stopped')
  }

  /**
   * Manually triggers a sync operation.
   *
   * This method will throw an error if a sync is already in progress.
   * Unlike scheduled syncs, errors from manual triggers are propagated to the caller.
   *
   * @throws {Error} If a sync is already in progress.
   * @returns {Promise<void>} A promise that resolves on successful sync or rejects on failure.
   */
  public async triggerSync(): Promise<void> {
    if (this.syncInProgress) {
      throw new Error('Sync already in progress')
    }

    // Track the sync operation
    this.syncInProgress = this.runSyncInternal()

    try {
      await this.syncInProgress
    } finally {
      this.syncInProgress = null
    }
  }

  /**
   * Schedules the next sync operation using setTimeout.
   * This recursive pattern ensures a fixed delay between sync completions,
   * preventing timer drift that can occur with setInterval.
   */
  private scheduleNextSync(intervalMs: number): void {
    if (this.isStopping) {
      return
    }

    this.timeoutId = setTimeout(() => {
      this.runScheduledSync(intervalMs)
    }, intervalMs)
  }

  /**
   * Runs a scheduled sync operation.
   * Unlike manual triggers, this catches and logs errors to prevent
   * the scheduler from stopping on individual sync failures.
   */
  private async runScheduledSync(intervalMs: number): Promise<void> {
    if (this.syncInProgress) {
      logger.info('Sync already in progress, skipping scheduled run...')
    } else {
      try {
        await this.triggerSync()
      } catch (_error) {
        // Scheduled syncs should not crash the scheduler
        // Error is already logged in runSyncInternal
        logger.warn('Scheduled sync finished with error, will retry after interval')
      }
    }

    // Schedule the next sync regardless of success/failure
    this.scheduleNextSync(intervalMs)
  }

  /**
   * Core sync logic that executes the actual repository synchronization.
   * This method handles logging and error reporting, then re-throws
   * errors for proper propagation to callers.
   */
  private async runSyncInternal(): Promise<void> {
    logger.info('Running MCP sync...')

    try {
      await this.syncService.syncRepository()
      logger.info('MCP sync completed successfully')
    } catch (error) {
      logger.error('Sync operation failed', {
        error: {
          message: getErrorMessage(error),
          stack: getErrorStack(error),
          code: getErrorCode(error),
        },
      })
      // Re-throw to allow proper error handling by callers
      throw error
    }
  }
}
