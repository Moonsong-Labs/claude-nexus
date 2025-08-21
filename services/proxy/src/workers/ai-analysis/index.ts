import { AnalysisWorker } from './AnalysisWorker.js'
import { logger } from '../../middleware/logger.js'
import { AI_WORKER_CONFIG, GEMINI_CONFIG } from '@claude-nexus/shared/config'

let workerInstance: AnalysisWorker | null = null

export async function startAnalysisWorker(): Promise<AnalysisWorker | null> {
  if (workerInstance) {
    logger.warn('Analysis worker already started', { metadata: { worker: 'analysis-worker' } })
    return workerInstance
  }

  // Validate configuration before starting
  if (!AI_WORKER_CONFIG.ENABLED) {
    logger.info('AI Analysis Worker is disabled', { metadata: { worker: 'analysis-worker' } })
    return null
  }

  if (!GEMINI_CONFIG.API_KEY) {
    const error = new Error('GEMINI_API_KEY is not set in environment variables')
    logger.error(
      'FATAL: AI_WORKER_ENABLED is true, but GEMINI_API_KEY is not set. The AI Analysis Worker cannot start.',
      {
        metadata: {
          worker: 'analysis-worker',
          GEMINI_CONFIG_API_KEY: GEMINI_CONFIG.API_KEY || 'empty',
          ENV_GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET',
        },
      }
    )
    throw error
  }

  // Try to create and validate the Gemini service
  try {
    const { GeminiService } = await import('./GeminiService.js')
    const testService = new GeminiService()

    // Validate the API key with an actual API call
    const isValid = await testService.validateApiKey()
    if (!isValid) {
      logger.error('Gemini API key validation failed - worker cannot start', {
        metadata: { worker: 'analysis-worker' },
      })
      return null
    }
  } catch (error: any) {
    logger.error('Failed to initialize Gemini service', {
      error: {
        message: error.message,
        stack: error.stack,
      },
      metadata: { worker: 'analysis-worker' },
    })
    return null
  }

  workerInstance = new AnalysisWorker()
  workerInstance.start()

  // Don't register signal handlers here - let the main process handle shutdown
  // The main process will call stop() on the worker instance

  return workerInstance
}

export function getAnalysisWorker(): AnalysisWorker | null {
  return workerInstance
}

export { AnalysisWorker }
