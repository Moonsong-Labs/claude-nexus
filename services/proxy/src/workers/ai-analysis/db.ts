import { container } from '../../container.js'
import { logger } from '../../middleware/logger.js'
import { AI_WORKER_CONFIG } from '@claude-nexus/shared/config'
import type { AnalysisStatus, ConversationAnalysis } from '@claude-nexus/shared/types'
import { getErrorMessage, getErrorStack, getErrorCode } from '@claude-nexus/shared'

const MAX_RETRIES = AI_WORKER_CONFIG.MAX_RETRIES
const JOB_TIMEOUT_MINUTES = AI_WORKER_CONFIG.JOB_TIMEOUT_MINUTES

// SQL Queries
const SQL_QUERIES = {
  CLAIM_JOB: `
    UPDATE conversation_analyses
    SET status = 'processing', updated_at = NOW()
    WHERE id = (
      SELECT id
      FROM conversation_analyses
      WHERE status = 'pending' AND retry_count < $1
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *;
  `,

  COMPLETE_JOB: `
    UPDATE conversation_analyses
    SET status = 'completed',
        analysis_content = $1,
        analysis_data = $2,
        raw_response = $3,
        model_used = $4,
        prompt_tokens = $5,
        completion_tokens = $6,
        generated_at = NOW(),
        processing_duration_ms = $7,
        updated_at = NOW(),
        completed_at = NOW()
    WHERE id = $8
  `,

  UPDATE_JOB_RETRY: `
    UPDATE conversation_analyses
    SET status = 'pending',
        retry_count = retry_count + 1,
        error_message = $1,
        updated_at = NOW()
    WHERE id = $2
  `,

  FAIL_JOB: `
    UPDATE conversation_analyses
    SET status = 'failed',
        error_message = $1,
        updated_at = NOW(),
        completed_at = NOW()
    WHERE id = $2
  `,

  RESET_STUCK_JOBS: `
    UPDATE conversation_analyses
    SET status = 'pending',
        retry_count = retry_count + 1,
        error_message = CASE 
          WHEN error_message IS NULL THEN '{"stuck_job": "Reset by watchdog"}'
          ELSE CASE
            WHEN error_message::text LIKE '{%' THEN 
              jsonb_build_object(
                'previous_errors', error_message::jsonb,
                'stuck_job', 'Reset by watchdog'
              )::text
            ELSE 
              jsonb_build_object(
                'previous_error', error_message,
                'stuck_job', 'Reset by watchdog'
              )::text
          END
        END,
        updated_at = NOW()
    WHERE status = 'processing' 
      AND updated_at < NOW() - INTERVAL '%s minutes'
  `,

  FAIL_EXCEEDED_RETRIES: `
    UPDATE conversation_analyses
    SET status = 'failed',
        error_message = jsonb_build_object(
          'error', 'Maximum retry attempts exceeded',
          'max_retries', $1,
          'retry_count', retry_count,
          'failed_at', NOW()
        )::text,
        updated_at = NOW(),
        completed_at = NOW()
    WHERE status = 'pending' 
      AND retry_count >= $1
  `,

  FETCH_CONVERSATION_MESSAGES: `
    SELECT body AS request_body, response_body, created_at
    FROM api_requests
    WHERE conversation_id = $1
      AND branch_id = $2
      AND response_body IS NOT NULL
    ORDER BY created_at ASC
  `,
}

export interface ConversationAnalysisJob {
  id: number
  conversation_id: string
  branch_id: string
  status: AnalysisStatus
  retry_count: number
  analysis_content?: string
  analysis_data?: ConversationAnalysis
  raw_response?: unknown
  error_message?: string
  model_used?: string
  prompt_tokens?: number
  completion_tokens?: number
  generated_at?: Date
  processing_duration_ms?: number
  created_at: Date
  updated_at: Date
  custom_prompt?: string
}

/**
 * Helper function to parse error messages from JSON storage
 */
function parseErrorMessage(errorMessage: string | undefined): Record<string, any> {
  if (!errorMessage) {
    return {}
  }

  try {
    return JSON.parse(errorMessage)
  } catch (_parseError) {
    return { parse_error: errorMessage }
  }
}

/**
 * Helper function to log database errors consistently
 */
function logDatabaseError(context: string, error: unknown, jobId?: number): void {
  const metadata: Record<string, any> = { worker: 'analysis-worker' }
  if (jobId !== undefined) {
    metadata.jobId = jobId
  }

  logger.error(context, {
    error: {
      message: getErrorMessage(error),
      stack: getErrorStack(error),
      code: getErrorCode(error),
    },
    metadata,
  })
}

/**
 * Claims a pending job for processing using row-level locking
 * @returns The claimed job or null if no jobs are available
 */
export async function claimJob(): Promise<ConversationAnalysisJob | null> {
  const pool = container.getDbPool()
  if (!pool) {
    logger.error('Database pool not available', { metadata: { worker: 'analysis-worker' } })
    return null
  }

  try {
    const result = await pool.query(SQL_QUERIES.CLAIM_JOB, [MAX_RETRIES])
    const { rows } = result

    if (rows.length === 0) {
      return null
    }

    logger.debug(`Claimed job: ${rows[0].id}`, { metadata: { worker: 'analysis-worker' } })
    return rows[0] as ConversationAnalysisJob
  } catch (error) {
    logDatabaseError('Error claiming job', error)
    throw error
  }
}

/**
 * Marks a job as completed with analysis results
 * @param id - Job ID
 * @param analysisContent - Text content of the analysis
 * @param analysisData - Structured analysis data (optional)
 * @param rawResponse - Raw response from the AI model
 * @param modelUsed - Name of the AI model used
 * @param promptTokens - Number of tokens in the prompt
 * @param completionTokens - Number of tokens in the completion
 * @param processingDurationMs - Processing time in milliseconds
 */
export async function completeJob(
  id: number,
  analysisContent: string,
  analysisData: ConversationAnalysis | null,
  rawResponse: unknown,
  modelUsed: string,
  promptTokens: number,
  completionTokens: number,
  processingDurationMs: number
): Promise<void> {
  const pool = container.getDbPool()
  if (!pool) {
    logger.error('Database pool not available', { metadata: { worker: 'analysis-worker' } })
    throw new Error('Database pool not available')
  }

  try {
    await pool.query(SQL_QUERIES.COMPLETE_JOB, [
      analysisContent,
      analysisData ? JSON.stringify(analysisData) : null,
      JSON.stringify(rawResponse),
      modelUsed,
      promptTokens,
      completionTokens,
      processingDurationMs,
      id,
    ])

    logger.debug(`Completed job: ${id}`, { metadata: { worker: 'analysis-worker' } })
  } catch (error) {
    logDatabaseError(`Error completing job ${id}`, error, id)
    throw error
  }
}

/**
 * Marks a job as failed with retry logic
 * @param job - The job that failed
 * @param error - The error that caused the failure
 */
export async function failJob(job: ConversationAnalysisJob, error: Error): Promise<void> {
  const pool = container.getDbPool()
  if (!pool) {
    logger.error('Database pool not available', { metadata: { worker: 'analysis-worker' } })
    throw new Error('Database pool not available')
  }

  try {
    const currentRetries = job.retry_count || 0
    const hasMoreRetries = currentRetries < MAX_RETRIES

    const errorDetails = {
      message: error.message,
      name: error.name,
      timestamp: new Date().toISOString(),
    }

    const existingErrors = parseErrorMessage(job.error_message)

    if (hasMoreRetries) {
      await pool.query(SQL_QUERIES.UPDATE_JOB_RETRY, [
        JSON.stringify({
          ...existingErrors,
          [`retry_${currentRetries + 1}`]: errorDetails,
        }),
        job.id,
      ])

      logger.info(
        `Job ${job.id} failed, will retry (attempt ${currentRetries + 1}/${MAX_RETRIES})`,
        { metadata: { worker: 'analysis-worker' } }
      )
    } else {
      await pool.query(SQL_QUERIES.FAIL_JOB, [
        JSON.stringify({
          ...existingErrors,
          final_error: errorDetails,
        }),
        job.id,
      ])

      logger.warn(`Job ${job.id} permanently failed after ${MAX_RETRIES} retries`, {
        metadata: { worker: 'analysis-worker' },
      })
    }
  } catch (dbError) {
    logDatabaseError(`Error updating failed job ${job.id}`, dbError, job.id)
    throw dbError
  }
}

/**
 * Resets jobs that have been processing for too long
 * @returns Number of jobs reset
 */
export async function resetStuckJobs(): Promise<number> {
  const pool = container.getDbPool()
  if (!pool) {
    logger.error('Database pool not available', { metadata: { worker: 'analysis-worker' } })
    return 0
  }

  try {
    // Validate timeout value to prevent SQL injection
    const timeoutMinutes = Math.max(1, Math.min(60, JOB_TIMEOUT_MINUTES))

    // Use sprintf-style formatting with validation
    const query = SQL_QUERIES.RESET_STUCK_JOBS.replace('%s', timeoutMinutes.toString())

    const result = await pool.query(query)

    const resetCount = result.rowCount || 0
    if (resetCount > 0) {
      logger.info(`Reset ${resetCount} stuck jobs`, { metadata: { worker: 'analysis-worker' } })
    }
    return resetCount
  } catch (error) {
    logDatabaseError('Error resetting stuck jobs', error)
    throw error
  }
}

/**
 * Fails jobs that have exceeded the maximum retry limit
 * @returns Number of jobs failed
 */
export async function failJobsExceedingMaxRetries(): Promise<number> {
  const pool = container.getDbPool()
  if (!pool) {
    logger.error('Database pool not available', { metadata: { worker: 'analysis-worker' } })
    return 0
  }

  try {
    const result = await pool.query(SQL_QUERIES.FAIL_EXCEEDED_RETRIES, [MAX_RETRIES])

    const failedCount = result.rowCount || 0
    if (failedCount > 0) {
      logger.info(`Failed ${failedCount} jobs that exceeded max retries`, {
        metadata: { worker: 'analysis-worker' },
      })
    }
    return failedCount
  } catch (error) {
    logDatabaseError('Error failing jobs with max retries', error)
    throw error
  }
}

/**
 * Extracts user message content from Claude API message format
 */
function extractUserMessageContent(message: any): string {
  if (typeof message.content === 'string') {
    return message.content
  }

  return message.content
    .map((block: { type: string; text?: string }) => (block.type === 'text' ? block.text : ''))
    .join('\n')
}

/**
 * Formats assistant response content blocks
 */
function formatAssistantContent(block: { type: string; text?: string; name?: string }): string {
  switch (block.type) {
    case 'text':
      return block.text || ''
    case 'tool_use':
      return `[Tool Use: ${block.name}]`
    case 'tool_result':
      return `[Tool Result]`
    default:
      return ''
  }
}

/**
 * Fetches all messages from a conversation
 * @param conversationId - UUID of the conversation
 * @param branchId - Branch ID (defaults to 'main')
 * @returns Array of messages with role and content
 */
export async function fetchConversationMessages(
  conversationId: string,
  branchId: string = 'main'
): Promise<Array<{ role: 'user' | 'model'; content: string }>> {
  const pool = container.getDbPool()
  if (!pool) {
    logger.error('Database pool not available', { metadata: { worker: 'analysis-worker' } })
    throw new Error('Database pool not available')
  }

  try {
    const result = await pool.query(SQL_QUERIES.FETCH_CONVERSATION_MESSAGES, [
      conversationId,
      branchId,
    ])

    const messages: Array<{ role: 'user' | 'model'; content: string }> = []

    for (const row of result.rows) {
      // Extract user message
      if (row.request_body?.messages) {
        const lastUserMessage = row.request_body.messages
          .filter((msg: { role: string }) => msg.role === 'user')
          .pop()

        if (lastUserMessage) {
          messages.push({
            role: 'user',
            content: extractUserMessageContent(lastUserMessage),
          })
        }
      }

      // Extract assistant response
      if (row.response_body?.content) {
        const assistantContent = row.response_body.content.map(formatAssistantContent).join('\n')

        messages.push({ role: 'model', content: assistantContent })
      }
    }

    logger.debug(`Fetched ${messages.length} messages for conversation ${conversationId}`, {
      metadata: { worker: 'analysis-worker' },
    })
    return messages
  } catch (error) {
    logDatabaseError('Error fetching conversation messages', error)
    throw error
  }
}
