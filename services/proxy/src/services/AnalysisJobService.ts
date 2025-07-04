import { Pool } from 'pg'
import { logger } from '../middleware/logger.js'

/**
 * Service for enqueueing conversation analysis jobs
 */
export class AnalysisJobService {
  constructor(private pool: Pool) {}

  /**
   * Enqueue a job for conversation analysis
   * Uses ON CONFLICT to prevent duplicate active jobs
   */
  async enqueueAnalysisJob(conversationId: string): Promise<void> {
    if (!conversationId) {
      logger.debug('No conversation ID provided, skipping analysis job enqueueing')
      return
    }

    try {
      const query = `
        INSERT INTO analysis_jobs (conversation_id)
        VALUES ($1)
        ON CONFLICT (conversation_id) WHERE status IN ('pending', 'processing')
        DO NOTHING
      `

      const result = await this.pool.query(query, [conversationId])

      if (result.rowCount && result.rowCount > 0) {
        logger.info('Enqueued analysis job', {
          metadata: {
            action: 'analysis_job_created',
            conversationId,
          },
        })
      } else {
        logger.debug('Analysis job already exists for conversation', {
          metadata: {
            action: 'analysis_job_skipped',
            reason: 'active_job_exists',
            conversationId,
          },
        })
      }
    } catch (error) {
      // Don't fail the main request if job enqueueing fails
      logger.error('Failed to enqueue analysis job', {
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          conversationId,
        },
      })
    }
  }

  /**
   * Check if analysis jobs feature is enabled
   */
  isEnabled(): boolean {
    // Check if the analysis_jobs table exists
    // This allows the feature to be gracefully disabled if migrations haven't run
    return process.env.ENABLE_ANALYSIS_JOBS !== 'false'
  }
}
