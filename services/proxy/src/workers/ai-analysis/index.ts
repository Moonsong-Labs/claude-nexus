import { AnalysisWorker } from './AnalysisWorker.js'
import { logger } from '../../middleware/logger.js'

let workerInstance: AnalysisWorker | null = null

export function startAnalysisWorker(): AnalysisWorker {
  if (workerInstance) {
    logger.warn('Analysis worker already started', { metadata: { worker: 'analysis-worker' } })
    return workerInstance
  }

  workerInstance = new AnalysisWorker()
  workerInstance.start()

  const gracefulShutdown = async (signal: string) => {
    logger.info(`${signal} received. Shutting down analysis worker gracefully...`, {
      metadata: { worker: 'analysis-worker' },
    })
    if (workerInstance) {
      await workerInstance.stop()
      workerInstance = null
    }
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))

  return workerInstance
}

export function getAnalysisWorker(): AnalysisWorker | null {
  return workerInstance
}

export { AnalysisWorker }
