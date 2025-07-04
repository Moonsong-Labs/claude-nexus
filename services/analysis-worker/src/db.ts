import { Pool, PoolClient } from 'pg'
import { config, type AnalysisJob, type ApiRequestRow } from '@claude-nexus/shared'

/**
 * Database queries for the analysis worker
 */
export class AnalysisDatabase {
  constructor(private pool: Pool) {}

  /**
   * Atomically claim a pending job for processing
   */
  async claimJob(): Promise<AnalysisJob | null> {
    const query = `
      UPDATE analysis_jobs
      SET
        status = 'processing',
        updated_at = NOW(),
        processing_started_at = NOW(),
        attempts = attempts + 1
      WHERE id = (
        SELECT id
        FROM analysis_jobs
        WHERE status = 'pending'
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *;
    `

    const { rows } = await this.pool.query(query)
    return rows[0] || null
  }

  /**
   * Mark a job as completed
   */
  async markJobCompleted(
    jobId: string,
    durationMs: number,
    promptTokens: number,
    completionTokens: number
  ): Promise<void> {
    const query = `
      UPDATE analysis_jobs
      SET
        status = 'completed',
        completed_at = NOW(),
        updated_at = NOW(),
        duration_ms = $2,
        prompt_tokens = $3,
        completion_tokens = $4
      WHERE id = $1
    `

    await this.pool.query(query, [jobId, durationMs, promptTokens, completionTokens])
  }

  /**
   * Mark a job as failed
   */
  async markJobFailed(jobId: string, error: string, attempts: number): Promise<void> {
    const status = attempts >= 3 ? 'failed' : 'pending'

    const query = `
      UPDATE analysis_jobs
      SET
        status = $2,
        last_error = $3,
        updated_at = NOW(),
        processing_started_at = CASE WHEN $2 = 'pending' THEN NULL ELSE processing_started_at END
      WHERE id = $1
    `

    await this.pool.query(query, [jobId, status, error])
  }

  /**
   * Reset stuck jobs (watchdog function)
   */
  async resetStuckJobs(): Promise<string[]> {
    const query = `
      UPDATE analysis_jobs
      SET
        status = 'pending',
        updated_at = NOW(),
        processing_started_at = NULL,
        last_error = 'Job timed out. Reset by watchdog.'
      WHERE
        status = 'processing' AND
        processing_started_at < NOW() - INTERVAL '5 minutes' AND
        attempts < 3
      RETURNING id;
    `

    const { rows } = await this.pool.query(query)
    return rows.map(row => row.id)
  }

  /**
   * Fetch conversation messages for analysis
   * Limited to prevent memory exhaustion on large conversations
   */
  async fetchConversationMessages(
    conversationId: string,
    limit = config.analysisWorker.maxMessagesPerAnalysis
  ): Promise<ApiRequestRow[]> {
    const query = `
      SELECT 
        request_id,
        timestamp,
        body,
        response_body,
        model,
        input_tokens,
        output_tokens,
        message_count
      FROM api_requests
      WHERE conversation_id = $1
      ORDER BY timestamp ASC
      LIMIT $2
    `

    const { rows } = await this.pool.query(query, [conversationId, limit])
    return rows
  }

  /**
   * Upsert analysis result
   */
  async upsertAnalysisResult(
    conversationId: string,
    analysisResult: unknown,
    modelUsed: string,
    promptTokens: number,
    completionTokens: number
  ): Promise<void> {
    const totalTokens = promptTokens + completionTokens

    const query = `
      INSERT INTO conversation_analyses (
        conversation_id,
        analysis_result,
        model_used,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (conversation_id)
      DO UPDATE SET
        analysis_result = EXCLUDED.analysis_result,
        model_used = EXCLUDED.model_used,
        prompt_tokens = EXCLUDED.prompt_tokens,
        completion_tokens = EXCLUDED.completion_tokens,
        total_tokens = EXCLUDED.total_tokens,
        updated_at = NOW()
    `

    await this.pool.query(query, [
      conversationId,
      JSON.stringify(analysisResult),
      modelUsed,
      promptTokens,
      completionTokens,
      totalTokens,
    ])
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await callback(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}
