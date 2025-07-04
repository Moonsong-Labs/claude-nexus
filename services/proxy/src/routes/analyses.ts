import { Hono } from 'hono'
import { Pool } from 'pg'
import { nanoid } from 'nanoid'
import { logger } from '../middleware/logger.js'
import { getErrorMessage } from '@claude-nexus/shared'
import {
  createAnalysisSchema,
  analysisParamsSchema,
  AnalysisStatus,
  CreateAnalysisResponse,
  GetAnalysisResponse,
  RegenerateAnalysisResponse,
  AnalysisErrorResponse,
  AnalysisErrorCodes,
} from '@claude-nexus/shared/types/analysis'

export const analysesRoutes = new Hono<{
  Variables: {
    pool?: Pool
  }
}>()

/**
 * POST /api/analyses - Trigger analysis for a conversation branch
 */
analysesRoutes.post('/', async c => {
  const pool = c.get('pool')
  if (!pool) {
    return c.json<AnalysisErrorResponse>(
      {
        error: {
          code: 'service_unavailable',
          message: 'Database service is not available',
        },
      },
      503
    )
  }

  try {
    // Parse and validate request body
    const body = await c.req.json()
    const params = createAnalysisSchema.parse(body)

    // Check if conversation exists
    const conversationQuery = `
      SELECT COUNT(*) as count
      FROM api_requests
      WHERE conversation_id = $1 AND branch_id = $2
      LIMIT 1
    `
    const conversationResult = await pool.query(conversationQuery, [
      params.conversationId,
      params.branchId,
    ])

    if (conversationResult.rows[0].count === '0') {
      return c.json<AnalysisErrorResponse>(
        {
          error: {
            code: AnalysisErrorCodes.CONVERSATION_NOT_FOUND,
            message: `Conversation ${params.conversationId} with branch ${params.branchId} not found`,
          },
        },
        404
      )
    }

    // Check if analysis already exists for this conversation branch
    const existingQuery = `
      SELECT id, status
      FROM conversation_analyses
      WHERE conversation_id = $1 AND branch_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `
    const existingResult = await pool.query(existingQuery, [params.conversationId, params.branchId])

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0]
      // If analysis exists and is not failed, return conflict
      if (existing.status !== AnalysisStatus.FAILED) {
        return c.json<AnalysisErrorResponse>(
          {
            error: {
              code: AnalysisErrorCodes.ANALYSIS_EXISTS,
              message: `Analysis already exists for conversation ${params.conversationId} branch ${params.branchId}`,
              details: {
                analysisId: existing.id,
                status: existing.status,
              },
            },
          },
          409
        )
      }
    }

    // Create new analysis record
    const analysisId = nanoid()
    const insertQuery = `
      INSERT INTO conversation_analyses (
        id, conversation_id, branch_id, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, NOW(), NOW()
      )
      RETURNING id, conversation_id, branch_id, status
    `
    const insertResult = await pool.query(insertQuery, [
      analysisId,
      params.conversationId,
      params.branchId,
      AnalysisStatus.PENDING,
    ])

    const newAnalysis = insertResult.rows[0]

    // TODO: Queue analysis job for async processing
    // For now, we just create the record in pending state
    logger.info('Analysis queued', {
      metadata: {
        analysisId: newAnalysis.id,
        conversationId: params.conversationId,
        branchId: params.branchId,
      },
    })

    const response: CreateAnalysisResponse = {
      id: newAnalysis.id,
      conversationId: newAnalysis.conversation_id,
      branchId: newAnalysis.branch_id,
      status: newAnalysis.status,
      message: 'Analysis queued for processing',
    }

    return c.json(response, 201)
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return c.json<AnalysisErrorResponse>(
        {
          error: {
            code: AnalysisErrorCodes.INVALID_PARAMS,
            message: 'Invalid request parameters',
            details: error,
          },
        },
        400
      )
    }

    logger.error('Failed to create analysis', {
      error: getErrorMessage(error),
    })

    return c.json<AnalysisErrorResponse>(
      {
        error: {
          code: AnalysisErrorCodes.PROCESSING_ERROR,
          message: 'Failed to create analysis',
        },
      },
      500
    )
  }
})

/**
 * GET /api/analyses/:conversationId/:branchId - Get analysis status/result
 */
analysesRoutes.get('/:conversationId/:branchId', async c => {
  const pool = c.get('pool')
  if (!pool) {
    return c.json<AnalysisErrorResponse>(
      {
        error: {
          code: 'service_unavailable',
          message: 'Database service is not available',
        },
      },
      503
    )
  }

  try {
    // Validate path parameters
    const params = analysisParamsSchema.parse({
      conversationId: c.req.param('conversationId'),
      branchId: c.req.param('branchId'),
    })

    // Get the latest analysis for this conversation branch
    const analysisQuery = `
      SELECT 
        ca.id,
        ca.conversation_id,
        ca.branch_id,
        ca.status,
        ca.content,
        ca.metadata,
        ca.created_at,
        ca.updated_at,
        ca.completed_at,
        -- Get conversation details
        conv.domain,
        conv.account_id,
        conv.message_count,
        conv.total_tokens
      FROM conversation_analyses ca
      LEFT JOIN LATERAL (
        SELECT 
          domain,
          account_id,
          COUNT(*) as message_count,
          SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) as total_tokens
        FROM api_requests
        WHERE conversation_id = ca.conversation_id 
          AND branch_id = ca.branch_id
        GROUP BY domain, account_id
        LIMIT 1
      ) conv ON true
      WHERE ca.conversation_id = $1 AND ca.branch_id = $2
      ORDER BY ca.created_at DESC
      LIMIT 1
    `
    const result = await pool.query(analysisQuery, [params.conversationId, params.branchId])

    if (result.rows.length === 0) {
      return c.json<AnalysisErrorResponse>(
        {
          error: {
            code: AnalysisErrorCodes.ANALYSIS_NOT_FOUND,
            message: `No analysis found for conversation ${params.conversationId} branch ${params.branchId}`,
          },
        },
        404
      )
    }

    const row = result.rows[0]
    const response: GetAnalysisResponse = {
      id: row.id,
      conversationId: row.conversation_id,
      branchId: row.branch_id,
      status: row.status,
      content: row.content,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      conversationDetails: row.domain
        ? {
            domain: row.domain,
            accountId: row.account_id,
            messageCount: parseInt(row.message_count),
            totalTokens: parseInt(row.total_tokens),
          }
        : undefined,
    }

    return c.json(response)
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return c.json<AnalysisErrorResponse>(
        {
          error: {
            code: AnalysisErrorCodes.INVALID_PARAMS,
            message: 'Invalid request parameters',
            details: error,
          },
        },
        400
      )
    }

    logger.error('Failed to get analysis', {
      error: getErrorMessage(error),
      metadata: {
        conversationId: c.req.param('conversationId'),
        branchId: c.req.param('branchId'),
      },
    })

    return c.json<AnalysisErrorResponse>(
      {
        error: {
          code: AnalysisErrorCodes.PROCESSING_ERROR,
          message: 'Failed to retrieve analysis',
        },
      },
      500
    )
  }
})

/**
 * POST /api/analyses/:conversationId/:branchId/regenerate - Regenerate analysis
 */
analysesRoutes.post('/:conversationId/:branchId/regenerate', async c => {
  const pool = c.get('pool')
  if (!pool) {
    return c.json<AnalysisErrorResponse>(
      {
        error: {
          code: 'service_unavailable',
          message: 'Database service is not available',
        },
      },
      503
    )
  }

  try {
    // Validate path parameters
    const params = analysisParamsSchema.parse({
      conversationId: c.req.param('conversationId'),
      branchId: c.req.param('branchId'),
    })

    // Check if analysis exists
    const existingQuery = `
      SELECT id, status
      FROM conversation_analyses
      WHERE conversation_id = $1 AND branch_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `
    const existingResult = await pool.query(existingQuery, [params.conversationId, params.branchId])

    if (existingResult.rows.length === 0) {
      return c.json<AnalysisErrorResponse>(
        {
          error: {
            code: AnalysisErrorCodes.ANALYSIS_NOT_FOUND,
            message: `No analysis found for conversation ${params.conversationId} branch ${params.branchId}`,
          },
        },
        404
      )
    }

    const previousAnalysis = existingResult.rows[0]

    // Create new analysis record for regeneration
    const newAnalysisId = nanoid()
    const insertQuery = `
      INSERT INTO conversation_analyses (
        id, conversation_id, branch_id, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, NOW(), NOW()
      )
      RETURNING id, conversation_id, branch_id, status
    `
    const insertResult = await pool.query(insertQuery, [
      newAnalysisId,
      params.conversationId,
      params.branchId,
      AnalysisStatus.PENDING,
    ])

    const newAnalysis = insertResult.rows[0]

    // TODO: Queue regeneration job for async processing
    // For now, we just create the new record in pending state
    logger.info('Analysis regeneration queued', {
      metadata: {
        analysisId: newAnalysis.id,
        previousAnalysisId: previousAnalysis.id,
        conversationId: params.conversationId,
        branchId: params.branchId,
      },
    })

    const response: RegenerateAnalysisResponse = {
      id: newAnalysis.id,
      conversationId: newAnalysis.conversation_id,
      branchId: newAnalysis.branch_id,
      status: newAnalysis.status,
      message: 'Analysis regeneration queued for processing',
      previousAnalysisId: previousAnalysis.id,
    }

    return c.json(response, 201)
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return c.json<AnalysisErrorResponse>(
        {
          error: {
            code: AnalysisErrorCodes.INVALID_PARAMS,
            message: 'Invalid request parameters',
            details: error,
          },
        },
        400
      )
    }

    logger.error('Failed to regenerate analysis', {
      error: getErrorMessage(error),
      metadata: {
        conversationId: c.req.param('conversationId'),
        branchId: c.req.param('branchId'),
      },
    })

    return c.json<AnalysisErrorResponse>(
      {
        error: {
          code: AnalysisErrorCodes.PROCESSING_ERROR,
          message: 'Failed to regenerate analysis',
        },
      },
      500
    )
  }
})
