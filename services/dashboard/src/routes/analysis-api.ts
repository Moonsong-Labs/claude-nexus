import { Hono } from 'hono'
import { z } from 'zod'
import type { ProxyApiClient } from '../services/api-client.js'
import { logger } from '../middleware/logger.js'
import { requireApiClient } from '../middleware/api-client.js'
import {
  getErrorMessage,
  CreateAnalysisRequestSchema,
  RegenerateAnalysisBodySchema,
  type CreateAnalysisResponse,
  type GetAnalysisResponse,
  type RegenerateAnalysisResponse,
} from '@claude-nexus/shared'
import { HttpError } from '../errors/HttpError.js'

/**
 * API routes for AI-powered conversation analysis.
 * These routes proxy requests to the main proxy service for analysis operations.
 */
export const analysisRoutes = new Hono<{
  Variables: {
    apiClient?: ProxyApiClient
  }
}>()

// Schema for validating conversation ID and branch ID parameters
const AnalysisParamsSchema = z.object({
  conversationId: z.string().uuid({ message: 'Invalid conversation ID format' }),
  branchId: z.string().min(1, { message: 'Branch ID is required' }),
})

// Apply API client middleware to all analysis routes
analysisRoutes.use('*', requireApiClient)

// Error handler for consistent error logging and responses
analysisRoutes.onError((err, c) => {
  // Handle known HTTP errors
  if (err instanceof HttpError) {
    // TypeScript doesn't recognize that err.status is a valid status code
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return c.json(err.data || { error: err.message }, err.status as any)
  }

  // Handle Zod validation errors
  if (err instanceof z.ZodError) {
    return c.json(
      {
        error: 'Invalid request data',
        details: err.errors,
      },
      400
    )
  }

  // Log unexpected errors with full context
  logger.error('Analysis route error', {
    error: getErrorMessage(err),
    stack: err instanceof Error ? err.stack : undefined,
    path: c.req.path,
    method: c.req.method,
  })

  return c.json({ error: 'An internal server error occurred' }, 500)
})

/**
 * POST /api/analyses
 * Create a new conversation analysis request.
 *
 * @body {conversationId: string, branchId?: string} - Analysis request details
 * @returns {201} Analysis creation status with ID
 * @returns {400} Invalid request data
 * @returns {409} Analysis already exists for this conversation/branch
 * @returns {500} Server error
 */
analysisRoutes.post('/analyses', async c => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const apiClient = c.get('apiClient')! // Guaranteed by middleware

  try {
    // Parse and validate request body
    const body = await c.req.json()
    const validatedBody = CreateAnalysisRequestSchema.parse(body)

    // Forward to proxy service
    const response = await apiClient.post<CreateAnalysisResponse>('/api/analyses', validatedBody)
    return c.json(response, 201)
  } catch (error) {
    // Handle expected application-specific errors
    if (HttpError.isHttpError(error) && error.status === 409) {
      return c.json(error.data || { error: 'Analysis already exists' }, 409)
    }
    // Re-throw to be handled by onError
    throw error
  }
})

/**
 * GET /api/analyses/:conversationId/:branchId
 * Get analysis status/result for a specific conversation branch.
 *
 * @param {string} conversationId - UUID of the conversation
 * @param {string} branchId - Branch identifier
 * @returns {200} Analysis status and results
 * @returns {400} Invalid conversation ID or branch ID
 * @returns {404} Analysis not found
 * @returns {500} Server error
 */
analysisRoutes.get('/analyses/:conversationId/:branchId', async c => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const apiClient = c.get('apiClient')! // Guaranteed by middleware

  try {
    // Validate parameters
    const params = AnalysisParamsSchema.parse(c.req.param())
    const { conversationId, branchId } = params

    // Forward to proxy service
    const response = await apiClient.get<GetAnalysisResponse>(
      `/api/analyses/${conversationId}/${branchId}`
    )
    return c.json(response)
  } catch (error) {
    // Handle expected 404 errors
    if (HttpError.isHttpError(error) && error.status === 404) {
      return c.json({ error: 'Analysis not found' }, 404)
    }
    // Re-throw to be handled by onError
    throw error
  }
})

/**
 * POST /api/analyses/:conversationId/:branchId/regenerate
 * Force regeneration of analysis for a specific conversation branch.
 *
 * @param {string} conversationId - UUID of the conversation
 * @param {string} branchId - Branch identifier
 * @body {customPrompt?: string} - Optional custom prompt for analysis
 * @returns {200} Regeneration status
 * @returns {400} Invalid conversation ID or branch ID
 * @returns {404} Conversation not found
 * @returns {500} Server error
 */
analysisRoutes.post('/analyses/:conversationId/:branchId/regenerate', async c => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const apiClient = c.get('apiClient')! // Guaranteed by middleware

  try {
    // Validate parameters
    const params = AnalysisParamsSchema.parse(c.req.param())
    const { conversationId, branchId } = params

    // Parse optional body for custom prompt
    let body: { customPrompt?: string } | undefined
    try {
      const rawBody = await c.req.json()
      body = RegenerateAnalysisBodySchema.parse(rawBody)
    } catch {
      // No body or invalid JSON is acceptable for this endpoint
      body = undefined
    }

    // Forward to proxy service
    const response = await apiClient.post<RegenerateAnalysisResponse>(
      `/api/analyses/${conversationId}/${branchId}/regenerate`,
      body
    )
    return c.json(response)
  } catch (error) {
    // Handle expected 404 errors
    if (HttpError.isHttpError(error) && error.status === 404) {
      return c.json({ error: 'Conversation not found' }, 404)
    }
    // Re-throw to be handled by onError
    throw error
  }
})
