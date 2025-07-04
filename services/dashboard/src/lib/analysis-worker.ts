import { Pool } from 'pg'
import { logger } from '../middleware/logger'
import { getErrorMessage } from '@claude-nexus/shared'
import { ApiRequest } from '../storage/reader'

interface AnalysisResult {
  status: string
  analysis_content: string
  analysis_data: any // TODO: Define a more specific type for analysis_data
  raw_response: any // TODO: Define a more specific type for raw_response
  generated_at: Date
  processing_duration_ms: number
  prompt_tokens: number
  completion_tokens: number
}

interface AnalysisJob {
  id: number
  conversation_id: string
  branch_id: string
  status: string
  model_used: string | null
  created_at: Date
  updated_at: Date
  retry_count: number
}

// This is a placeholder for the actual Gemini API call
async function callGeminiAPI(_prompt: string, _model: string | null): Promise<any> {
  // In a real implementation, this would call the Gemini API
  // For now, we'll return a mock response
  return {
    content: '## Mock Analysis',
    data: {
      summary: 'This is a mock analysis.',
      keyTopics: ['mock', 'analysis'],
      sentiment: 'neutral',
    },
    raw: { mock: true },
    usage: {
      input_tokens: 100,
      output_tokens: 50,
    },
  }
}

// This is a placeholder for fetching conversation messages
async function fetchConversationMessages(
  conversationId: string,
  branchId: string,
  pool: Pool
): Promise<ApiRequest[]> {
  // In a real implementation, this would fetch messages from the database
  // For now, we'll return a mock response
  const query = `
    SELECT * FROM api_requests 
    WHERE conversation_id = $1 AND branch_id = $2 
    ORDER BY timestamp ASC
  `
  const result = await pool.query(query, [conversationId, branchId])
  return result.rows
}

// This is a placeholder for preparing the analysis prompt
async function prepareAnalysisPrompt(messages: ApiRequest[]): Promise<string> {
  // In a real implementation, this would use the truncation strategy
  return `Analyze the following conversation: ${JSON.stringify(messages)}`
}

// This is a placeholder for updating the analysis result
async function updateAnalysisResult(
  jobId: number,
  result: AnalysisResult,
  pool: Pool
): Promise<void> {
  const query = `
    UPDATE conversation_analyses
    SET status = $1, analysis_content = $2, analysis_data = $3, raw_response = $4,
        generated_at = $5, processing_duration_ms = $6, prompt_tokens = $7,
        completion_tokens = $8, updated_at = NOW()
    WHERE id = $9
  `
  await pool.query(query, [
    result.status,
    result.analysis_content,
    result.analysis_data,
    result.raw_response,
    result.generated_at,
    result.processing_duration_ms,
    result.prompt_tokens,
    result.completion_tokens,
    jobId,
  ])
}

// This is a placeholder for handling errors
async function handleError(jobId: number, error: unknown, pool: Pool): Promise<void> {
  const query = `
    UPDATE conversation_analyses
    SET status = 'failed', error_message = $1, updated_at = NOW()
    WHERE id = $2
  `
  await pool.query(query, [getErrorMessage(error), jobId])
  logger.error('Failed to process analysis job', { error: getErrorMessage(error) })
}

export class AnalysisWorker {
  constructor(private pool: Pool) {}

  async processJob() {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      const jobResult = await client.query<AnalysisJob>(`
        SELECT * FROM conversation_analyses
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `)

      const job = jobResult.rows[0]

      if (!job) {
        await client.query('COMMIT')
        return
      }

      await client.query(
        `
        UPDATE conversation_analyses
        SET status = 'processing', updated_at = NOW()
        WHERE id = $1
      `,
        [job.id]
      )

      await client.query('COMMIT')

      try {
        const messages = await fetchConversationMessages(
          job.conversation_id,
          job.branch_id,
          this.pool
        )
        const prompt = await prepareAnalysisPrompt(messages)
        const startTime = Date.now()
        const response = await callGeminiAPI(prompt, job.model_used)
        const duration = Date.now() - startTime

        await updateAnalysisResult(
          job.id,
          {
            status: 'completed',
            analysis_content: response.content,
            analysis_data: response.data,
            raw_response: response.raw,
            generated_at: new Date(),
            processing_duration_ms: duration,
            prompt_tokens: response.usage.input_tokens,
            completion_tokens: response.usage.output_tokens,
          },
          this.pool
        )
      } catch (error) {
        await handleError(job.id, error, this.pool)
      }
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  }
}

export async function cleanupStuckJobs(pool: Pool) {
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000)

  await pool.query(
    `
    UPDATE conversation_analyses
    SET status = 'pending', retry_count = retry_count + 1, updated_at = NOW()
    WHERE status = 'processing'
      AND updated_at < $1
      AND retry_count < 3
  `,
    [staleThreshold]
  )

  await pool.query(
    `
    UPDATE conversation_analyses
    SET status = 'failed', error_message = 'Max retries exceeded', updated_at = NOW()
    WHERE status = 'processing'
      AND updated_at < $1
      AND retry_count >= 3
  `,
    [staleThreshold]
  )
}
