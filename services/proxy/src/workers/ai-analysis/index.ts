import { AnalysisWorker } from './AnalysisWorker.js'
import { logger } from '../../middleware/logger.js'
import { AI_WORKER_CONFIG, GEMINI_CONFIG } from '@claude-nexus/shared/config'

/**
 * Custom error for configuration issues with the Analysis Worker.
 */
export class AnalysisWorkerConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AnalysisWorkerConfigurationError'
  }
}

let workerInstance: AnalysisWorker | null = null

/**
 * Validates the necessary configuration for the AI Analysis Worker.
 * @throws {AnalysisWorkerConfigurationError} If required configuration is missing.
 */
function validateConfiguration(): void {
  if (!GEMINI_CONFIG.API_KEY) {
    const message = 'GEMINI_API_KEY is not set in environment variables'
    logger.error('FATAL: AI_WORKER_ENABLED is true, but GEMINI_API_KEY is not set.', {
      metadata: {
        worker: 'analysis-worker',
        ENV_GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET',
      },
    })
    throw new AnalysisWorkerConfigurationError(message)
  }
}

/**
 * Starts and returns the singleton AnalysisWorker instance.
 * If the worker is disabled via configuration, returns null without starting.
 *
 * @returns The running worker instance, or null if the worker is disabled.
 * @throws {AnalysisWorkerConfigurationError} If the worker is enabled but configuration is invalid.
 */
export function startAnalysisWorker(): AnalysisWorker | null {
  if (workerInstance) {
    logger.warn('Analysis worker already started', { metadata: { worker: 'analysis-worker' } })
    return workerInstance
  }

  if (!AI_WORKER_CONFIG.ENABLED) {
    logger.info('AI Analysis Worker is disabled by configuration', {
      metadata: { worker: 'analysis-worker' },
    })
    return null
  }

  validateConfiguration()

  workerInstance = new AnalysisWorker()
  workerInstance.start()

  return workerInstance
}

/**
 * Retrieves the singleton AnalysisWorker instance.
 * @returns The worker instance if it has been started, otherwise null.
 */
export function getAnalysisWorker(): AnalysisWorker | null {
  return workerInstance
}

/**
 * Resets the singleton worker instance. For use in test environments only.
 * @internal
 */
export function _resetAnalysisWorkerForTesting(): void {
  if (process.env.NODE_ENV !== 'test') {
    logger.warn('_resetAnalysisWorkerForTesting should only be used in test environments', {
      metadata: { worker: 'analysis-worker' },
    })
    return
  }
  workerInstance = null
}

// Re-export the AnalysisWorker class for consumer convenience
export { AnalysisWorker }
