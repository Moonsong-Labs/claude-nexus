import { Hono, type Context, type Next } from 'hono'
import { z } from 'zod'
import { getErrorMessage, config } from '@claude-nexus/shared'
import { HTTP_STATUS } from '../constants.js'

export const sparkApiRoutes = new Hono()

// Constants
const MAX_BATCH_SESSION_IDS = 100

/**
 * Middleware to check Spark API configuration
 */
const checkSparkConfig = async (c: Context, next: Next) => {
  if (!config.spark.enabled || !config.spark.apiUrl || !config.spark.apiKey) {
    return c.json({ error: 'Spark API not configured' }, HTTP_STATUS.SERVICE_UNAVAILABLE as any)
  }
  await next()
}

// Schema definitions
const FeedbackSchema = z.object({
  rating: z.number().min(1).max(5),
  comments: z.string(),
})

const SectionFeedbackSchema = z.object({
  section_id: z.string(),
  feedback: FeedbackSchema,
})

const RecommendationFeedbackSchema = z.object({
  overall_feedback: FeedbackSchema,
  section_feedbacks: z.array(SectionFeedbackSchema).optional(),
})

const SourceFeedbackSchema = z.object({
  source_url: z.string(),
  feedback: FeedbackSchema,
})

const LessonLearnedSchema = z.object({
  situation: z.string(),
  action: z.string(),
  result: z.string(),
  learning: z.string(),
  generalized_code_example: z.string().nullable().optional(),
})

const CodeChangesSchema = z.object({
  number_of_files_created: z.number().nullable().optional(),
  number_of_files_edited: z.number().nullable().optional(),
  number_of_files_deleted: z.number().nullable().optional(),
  total_number_of_lines_added: z.number().nullable().optional(),
  total_number_of_lines_removed: z.number().nullable().optional(),
})

const IntegrationMetricsSchema = z.object({
  integration_time_seconds: z.number().nullable().optional(),
  code_changes: CodeChangesSchema.optional(),
  number_of_actions: z.number().nullable().optional(),
})

const FeedbackReportSchema = z.object({
  recommendation_feedback: RecommendationFeedbackSchema,
  source_feedbacks: z.array(SourceFeedbackSchema).optional(),
  lessons_learned: z.array(LessonLearnedSchema).optional(),
  integration_metrics: IntegrationMetricsSchema.optional(),
})

const SendFeedbackRequestSchema = z.object({
  session_id: z.string(),
  feedback: FeedbackReportSchema,
})

const BatchFeedbackRequestSchema = z.object({
  session_ids: z.array(z.string()).max(MAX_BATCH_SESSION_IDS),
})

/**
 * Get feedback for a specific session
 */
sparkApiRoutes.get('/spark/sessions/:sessionId/feedback', checkSparkConfig, async c => {
  const sessionId = c.req.param('sessionId')

  try {
    const response = await fetch(`${config.spark.apiUrl}/sessions/${sessionId}/feedback`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.spark.apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      let errorDetail = `Failed to get feedback: ${response.statusText}`
      try {
        const errorData = await response.json()
        if (errorData && typeof errorData === 'object' && 'detail' in errorData) {
          errorDetail = String(errorData.detail)
        }
      } catch {
        // Use default error message if JSON parsing fails
      }
      return c.json({ error: errorDetail }, response.status as any)
    }

    // Note: Using 'as any' for external API responses to avoid complex type definitions
    // In a future refactor, consider adding proper type definitions for Spark API responses
    const data: unknown = await response.json()
    return c.json(data as any)
  } catch (error) {
    console.error('Error fetching feedback:', error)
    return c.json({ error: getErrorMessage(error) || 'Failed to fetch feedback' }, 500)
  }
})

/**
 * Send feedback for a recommendation session
 */
sparkApiRoutes.post('/spark/feedback', checkSparkConfig, async c => {

  try {
    const body = await c.req.json()
    const validatedData = SendFeedbackRequestSchema.parse(body)

    const response = await fetch(`${config.spark.apiUrl}/send_feedback`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.spark.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validatedData),
    })

    if (!response.ok) {
      let errorDetail = `Failed to send feedback: ${response.statusText}`
      try {
        const errorData = await response.json()
        if (errorData && typeof errorData === 'object' && 'detail' in errorData) {
          errorDetail = String(errorData.detail)
        }
      } catch {
        // Use default error message if JSON parsing fails
      }
      return c.json({ error: errorDetail }, response.status as any)
    }

    // Note: Using 'as any' for external API responses to avoid complex type definitions
    // In a future refactor, consider adding proper type definitions for Spark API responses
    const data: unknown = await response.json()
    return c.json(data as any)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request data', details: error.errors }, 400)
    }
    console.error('Error sending feedback:', error)
    return c.json({ error: getErrorMessage(error) || 'Failed to send feedback' }, 500)
  }
})

/**
 * Get feedback for multiple sessions in batch
 */
sparkApiRoutes.post('/spark/feedback/batch', checkSparkConfig, async c => {

  try {
    const body = await c.req.json()
    const validatedData = BatchFeedbackRequestSchema.parse(body)

    const sparkUrl = `${config.spark.apiUrl}/feedback/batch`
    const response = await fetch(sparkUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.spark.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validatedData),
    })

    if (!response.ok) {
      let errorDetail = `Failed to fetch batch feedback: ${response.statusText}`
      
      try {
        const errorText = await response.text()
        if (errorText) {
          try {
            const errorData = JSON.parse(errorText)
            if (errorData && typeof errorData === 'object' && 'detail' in errorData) {
              errorDetail = String(errorData.detail)
            }
          } catch {
            // If not JSON, use the text as error message if it's not too long
            if (errorText.length < 200) {
              errorDetail = errorText
            }
          }
        }
      } catch {
        // Use default error message if reading response fails
      }
      
      return c.json({ error: errorDetail }, response.status as any)
    }

    // Note: Using 'as any' for external API responses to avoid complex type definitions
    // In a future refactor, consider adding proper type definitions for Spark API responses
    const data: unknown = await response.json()
    return c.json(data as any)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid request data', details: error.errors }, 400)
    }
    console.error('Error fetching batch feedback:', error)
    return c.json({ error: getErrorMessage(error) || 'Failed to fetch batch feedback' }, 500)
  }
})
