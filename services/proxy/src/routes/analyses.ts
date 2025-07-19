import { Hono } from 'hono'
import { z } from 'zod'
import { Pool } from 'pg'
import { logger } from '../middleware/logger.js'
import {
  rateLimitAnalysisCreation,
  rateLimitAnalysisRetrieval,
} from '../middleware/analysis-rate-limit.js'
import { ConversationAnalysisStatus } from '@claude-nexus/shared/types'
import { uuidSchema, conversationBranchParamsSchema } from '@claude-nexus/shared/utils/validation'
import { HTTP_STATUS } from '../constants.js'
import { createErrorResponse } from '../utils/error-response.js'
import { handleZodError } from '../utils/zod-error-handler.js'
import { auditLog } from '../utils/audit-log.js'
import type {
  AnalysisCreatedResponse,
  AnalysisResponse,
  AnalysisErrorResponse
} from '../types/analysis-responses.js'

// Request schemas
const createAnalysisSchema = z.object({
  conversationId: uuidSchema,
  branchId: z.string().min(1, 'Branch ID is required'),
  customPrompt: z.string().optional(),
})

const regenerateAnalysisBodySchema = z.object({
  customPrompt: z.string().optional(),
}).optional()

const getAnalysisParamsSchema = conversationBranchParamsSchema

// Route handler type definitions
type AnalysisRouteHandler = Hono<{
  Variables: {
    pool?: Pool
    domain?: string
    requestId?: string
  }
}>

export const analysisRoutes: AnalysisRouteHandler = new Hono()

/**
 * POST /api/analyses - Create a new analysis request
 * 
 * @body {conversationId: string, branchId: string, customPrompt?: string}
 * @returns {AnalysisCreatedResponse} Analysis creation status
 */
analysisRoutes.post('/', rateLimitAnalysisCreation(), async c => {
  const pool = c.get('pool')
  const domain = c.get('domain') || 'unknown'
  const requestId = c.get('requestId') || 'unknown'

  if (!pool) {
    return createErrorResponse(c, 'Database not configured', HTTP_STATUS.SERVICE_UNAVAILABLE)
  }

  try {
    // Parse and validate request body
    const body = await c.req.json()
    const { conversationId, branchId, customPrompt } = createAnalysisSchema.parse(body)

    // Log the analysis request
    await auditLog(pool, {
      event_type: 'ANALYSIS_REQUEST',
      outcome: 'INITIATED',
      conversation_id: conversationId,
      branch_id: branchId,
      domain,
      request_id: requestId,
    })

    // Check if analysis already exists
    const existingResult = await pool.query(
      `SELECT id, status FROM conversation_analyses 
       WHERE conversation_id = $1 AND branch_id = $2`,
      [conversationId, branchId]
    )

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0]

      // If it's already completed, return it
      if (existing.status === ConversationAnalysisStatus.COMPLETED) {
        const response: AnalysisCreatedResponse = {
          message: 'Analysis already completed',
          analysisId: existing.id,
          status: existing.status,
        }
        return c.json(response, HTTP_STATUS.OK)
      }

      // If it's pending or processing, return the status
      if (
        existing.status === ConversationAnalysisStatus.PENDING ||
        existing.status === ConversationAnalysisStatus.PROCESSING
      ) {
        const response: AnalysisCreatedResponse = {
          message: 'Analysis already in progress',
          analysisId: existing.id,
          status: existing.status,
        }
        return c.json(response, HTTP_STATUS.OK)
      }
    }

    // Create new analysis request
    const insertResult = await pool.query(
      `INSERT INTO conversation_analyses 
       (conversation_id, branch_id, status, custom_prompt, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id`,
      [conversationId, branchId, ConversationAnalysisStatus.PENDING, customPrompt || null]
    )

    const analysisId = insertResult.rows[0].id

    await auditLog(pool, {
      event_type: 'ANALYSIS_REQUEST',
      outcome: 'SUCCESS',
      conversation_id: conversationId,
      branch_id: branchId,
      domain,
      request_id: requestId,
      metadata: { analysis_id: analysisId },
    })

    const response: AnalysisCreatedResponse = {
      message: 'Analysis request created',
      analysisId,
      status: ConversationAnalysisStatus.PENDING,
    }
    return c.json(response, HTTP_STATUS.CREATED)
  } catch (error) {
    logger.error('Failed to create analysis request', { error, requestId })

    // Handle Zod validation errors
    const zodResponse = handleZodError(error, c)
    if (zodResponse) return zodResponse

    return createErrorResponse(
      c,
      'Failed to create analysis request',
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    )
  }
})

/**
 * GET /api/analyses/:conversationId/:branchId - Get analysis status/result
 * 
 * @param {string} conversationId - UUID of the conversation
 * @param {string} branchId - Branch identifier
 * @returns {AnalysisResponse} Analysis data and status
 */
analysisRoutes.get('/:conversationId/:branchId', rateLimitAnalysisRetrieval(), async c => {
  const pool = c.get('pool')
  const domain = c.get('domain') || 'unknown'
  const requestId = c.get('requestId') || 'unknown'

  if (!pool) {
    return createErrorResponse(c, 'Database not configured', HTTP_STATUS.SERVICE_UNAVAILABLE)
  }

  try {
    // Validate parameters
    const params = getAnalysisParamsSchema.parse(c.req.param())
    const { conversationId, branchId } = params

    // Get analysis
    const result = await pool.query(
      `SELECT 
        id,
        status,
        analysis_content,
        analysis_data,
        error_message,
        created_at,
        updated_at,
        completed_at,
        prompt_tokens,
        completion_tokens
       FROM conversation_analyses
       WHERE conversation_id = $1 AND branch_id = $2`,
      [conversationId, branchId]
    )

    if (result.rows.length === 0) {
      return createErrorResponse(c, 'Analysis not found', HTTP_STATUS.NOT_FOUND)
    }

    const analysis = result.rows[0]

    await auditLog(pool, {
      event_type: 'ANALYSIS_RETRIEVAL',
      outcome: 'SUCCESS',
      conversation_id: conversationId,
      branch_id: branchId,
      domain,
      request_id: requestId,
      metadata: {
        analysis_id: analysis.id,
        status: analysis.status,
      },
    })

    const response: AnalysisResponse = {
      id: analysis.id,
      conversationId,
      branchId,
      status: analysis.status,
      content: analysis.analysis_content,
      data: analysis.analysis_data,
      error: analysis.error_message,
      createdAt: analysis.created_at,
      updatedAt: analysis.updated_at,
      completedAt: analysis.completed_at,
      tokenUsage: {
        prompt: analysis.prompt_tokens,
        completion: analysis.completion_tokens,
        total: (analysis.prompt_tokens || 0) + (analysis.completion_tokens || 0),
      },
    }
    return c.json(response, HTTP_STATUS.OK)
  } catch (error) {
    logger.error('Failed to get analysis', {
      error: error instanceof Error ? error.message : String(error),
      requestId,
    })

    // Handle Zod validation errors
    const zodResponse = handleZodError(error, c)
    if (zodResponse) return zodResponse

    return createErrorResponse(
      c,
      'Failed to retrieve analysis',
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    )
  }
})

/**
 * POST /api/analyses/:conversationId/:branchId/regenerate - Force regeneration
 * 
 * @param {string} conversationId - UUID of the conversation
 * @param {string} branchId - Branch identifier
 * @body {customPrompt?: string} Optional custom prompt for analysis
 * @returns {AnalysisCreatedResponse} Analysis regeneration status
 */
analysisRoutes.post(
  '/:conversationId/:branchId/regenerate',
  rateLimitAnalysisCreation(),
  async c => {
    const pool = c.get('pool')
    const domain = c.get('domain') || 'unknown'
    const requestId = c.get('requestId') || 'unknown'

    if (!pool) {
      return c.json({ error: 'Database not configured' }, 503)
    }

    try {
      // Validate parameters
      const params = getAnalysisParamsSchema.parse(c.req.param())
      const { conversationId, branchId } = params

      // Parse optional body for custom prompt
      let customPrompt: string | undefined
      try {
        const body = await c.req.json()
        const parsed = regenerateAnalysisBodySchema.parse(body)
        customPrompt = parsed?.customPrompt
      } catch (error) {
        // No body or invalid JSON is acceptable for this endpoint
        logger.debug('No body provided for regenerate request', { requestId })
      }
      // Log the regeneration request
      await auditLog(pool, {
        event_type: 'ANALYSIS_REGENERATION_REQUEST',
        outcome: 'INITIATED',
        conversation_id: conversationId,
        branch_id: branchId,
        domain,
        request_id: requestId,
      })

      // Check if analysis exists
      const existingResult = await pool.query(
        `SELECT id, status FROM conversation_analyses 
       WHERE conversation_id = $1 AND branch_id = $2`,
        [conversationId, branchId]
      )

      let analysisId: string

      if (existingResult.rows.length > 0) {
        // Update existing analysis to pending
        analysisId = existingResult.rows[0].id
        await pool.query(
          `UPDATE conversation_analyses 
         SET status = $1, updated_at = NOW(), retry_count = retry_count + 1, custom_prompt = $3
         WHERE id = $2`,
          [ConversationAnalysisStatus.PENDING, analysisId, customPrompt || null]
        )
      } else {
        // Create new analysis
        const insertResult = await pool.query(
          `INSERT INTO conversation_analyses 
         (conversation_id, branch_id, status, custom_prompt, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id`,
          [conversationId, branchId, ConversationAnalysisStatus.PENDING, customPrompt || null]
        )
        analysisId = insertResult.rows[0].id
      }

      await auditLog(pool, {
        event_type: 'ANALYSIS_REGENERATION_REQUEST',
        outcome: 'SUCCESS',
        conversation_id: conversationId,
        branch_id: branchId,
        domain,
        request_id: requestId,
        metadata: { analysis_id: analysisId },
      })

      const response: AnalysisCreatedResponse = {
        message: 'Analysis regeneration requested',
        analysisId,
        status: ConversationAnalysisStatus.PENDING,
      }
      return c.json(response, HTTP_STATUS.OK)
    } catch (error) {
      logger.error('Failed to regenerate analysis', { error, requestId })

      // Handle Zod validation errors
      const zodResponse = handleZodError(error, c)
      if (zodResponse) return zodResponse

      return createErrorResponse(
        c,
        'Failed to regenerate analysis',
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      )
    }
  }
)
