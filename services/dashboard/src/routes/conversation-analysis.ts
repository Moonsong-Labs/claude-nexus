import { Hono } from 'hono'
import { Pool } from 'pg'
import { ConversationAnalyzer } from '../services/conversation-analyzer.js'
import {
  getErrorMessage,
  type ConversationAnalysisRequest,
  type ConversationAnalysisResponse,
} from '@claude-nexus/shared'
import { logger } from '../middleware/logger.js'

export const conversationAnalysisRoutes = new Hono()

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT = 10 // 10 requests per hour per conversation
const RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 hour in milliseconds

function checkRateLimit(conversationId: string): boolean {
  const now = Date.now()
  const key = `conversation:${conversationId}`
  const limit = rateLimitMap.get(key)

  if (!limit || now > limit.resetTime) {
    rateLimitMap.set(key, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    })
    return true
  }

  if (limit.count >= RATE_LIMIT) {
    return false
  }

  limit.count++
  return true
}

// Initialize analyzer with database pool
let analyzer: ConversationAnalyzer | null = null

function getAnalyzer(pool: Pool): ConversationAnalyzer {
  if (!analyzer) {
    analyzer = new ConversationAnalyzer(pool)
  }
  return analyzer
}

/**
 * POST /api/conversations/:id/analysis
 * Analyze a conversation and return structured insights
 */
conversationAnalysisRoutes.post('/conversations/:id/analysis', async c => {
  const conversationId = c.req.param('id')

  // Check rate limit
  if (!checkRateLimit(conversationId)) {
    logger.warn('Rate limit exceeded for conversation analysis', {
      metadata: { conversationId },
    })
    return c.json(
      {
        error: {
          type: 'rate_limit_exceeded',
          message: 'Too many analysis requests. Please try again later.',
        },
      },
      429
    )
  }

  try {
    // Parse request body
    const body = (await c.req
      .json<Partial<ConversationAnalysisRequest>>()
      .catch(() => ({}))) as Partial<ConversationAnalysisRequest>

    const request: ConversationAnalysisRequest = {
      conversationId,
      includeBranches: body.includeBranches ?? true,
      maxTokens: body.maxTokens,
    }

    // Get database pool from container
    const { container } = await import('../container.js')
    const pool = container.getPool()
    const analyzer = getAnalyzer(pool)

    // Perform analysis
    const analysis = await analyzer.analyzeConversation(request)

    logger.info('Conversation analysis completed', {
      metadata: {
        conversationId,
        messageCount: analysis.metadata.messageCount,
        truncated: analysis.metadata.truncated,
      },
    })

    return c.json<ConversationAnalysisResponse>(analysis)
  } catch (error: any) {
    // Handle specific error types
    if (error.type === 'conversation_not_found') {
      return c.json({ error: { type: error.type, message: error.message } }, 404)
    }

    if (error.type === 'analysis_failed' || error.type === 'invalid_response') {
      logger.error('Analysis failed', {
        metadata: {
          conversationId,
          error: error.message,
          details: error.details,
        },
      })
      return c.json({ error: { type: error.type, message: error.message } }, 500)
    }

    // Generic error handling
    logger.error('Unexpected error during conversation analysis', {
      metadata: {
        conversationId,
        error: getErrorMessage(error),
      },
    })

    return c.json(
      {
        error: {
          type: 'internal_error',
          message: 'Failed to analyze conversation',
        },
      },
      500
    )
  }
})

/**
 * GET /api/conversations/:id/analysis
 * Get cached analysis for a conversation
 */
conversationAnalysisRoutes.get('/conversations/:id/analysis', async c => {
  const conversationId = c.req.param('id')

  try {
    // Get database pool from container
    const { container } = await import('../container.js')
    const pool = container.getPool()

    // Query for cached analysis
    const query = `
      SELECT analysis_result, created_at, model_used
      FROM conversation_analyses
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `

    const result = await pool.query(query, [conversationId])

    if (result.rows.length === 0) {
      return c.json(
        {
          error: {
            type: 'analysis_not_found',
            message: 'No analysis found for this conversation',
          },
        },
        404
      )
    }

    const row = result.rows[0]
    const analysis: ConversationAnalysisResponse = {
      ...row.analysis_result,
      metadata: {
        ...row.analysis_result.metadata,
        modelUsed: row.model_used,
      },
    }

    return c.json(analysis)
  } catch (error: any) {
    logger.error('Failed to get cached analysis', {
      metadata: {
        conversationId,
        error: getErrorMessage(error),
      },
    })

    return c.json(
      {
        error: {
          type: 'internal_error',
          message: 'Failed to retrieve analysis',
        },
      },
      500
    )
  }
})

/**
 * DELETE /api/conversations/:id/analysis
 * Delete cached analysis for a conversation (force re-analysis)
 */
conversationAnalysisRoutes.delete('/conversations/:id/analysis', async c => {
  const conversationId = c.req.param('id')

  try {
    // Get database pool from container
    const { container } = await import('../container.js')
    const pool = container.getPool()

    // Delete cached analysis
    const result = await pool.query(
      'DELETE FROM conversation_analyses WHERE conversation_id = $1',
      [conversationId]
    )

    if (result.rowCount === 0) {
      return c.json(
        {
          error: {
            type: 'analysis_not_found',
            message: 'No analysis found to delete',
          },
        },
        404
      )
    }

    logger.info('Deleted cached conversation analysis', {
      metadata: {
        conversationId,
      },
    })

    return c.json({ success: true, message: 'Analysis cache cleared' })
  } catch (error: any) {
    logger.error('Failed to delete cached analysis', {
      metadata: {
        conversationId,
        error: getErrorMessage(error),
      },
    })

    return c.json(
      {
        error: {
          type: 'internal_error',
          message: 'Failed to delete analysis',
        },
      },
      500
    )
  }
})
