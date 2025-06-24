import { Hono } from 'hono'
import { z } from 'zod'
import { Pool } from 'pg'
import { logger } from '../middleware/logger.js'
import { getErrorMessage, getErrorStack } from '@claude-nexus/shared'
import { container } from '../container.js'

// Query parameter schemas
const statsQuerySchema = z.object({
  domain: z.string().optional(),
  since: z.string().datetime().optional(),
})

const requestsQuerySchema = z.object({
  domain: z.string().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).default('100'),
  offset: z.string().regex(/^\d+$/).transform(Number).default('0'),
})

const conversationsQuerySchema = z.object({
  domain: z.string().optional(),
  accountId: z.string().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).default('20'),
})

// Response types
interface StatsResponse {
  totalRequests: number
  totalTokens: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheCreationTokens: number
  totalCacheReadTokens: number
  averageResponseTime: number
  errorCount: number
  activeDomains: number
  requestsByModel: Record<string, number>
  requestsByType: Record<string, number>
}

interface RequestSummary {
  requestId: string
  domain: string
  model: string
  timestamp: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  durationMs: number
  responseStatus: number
  error?: string
  requestType?: string
  conversationId?: string
}

interface RequestDetails extends RequestSummary {
  requestBody: any
  responseBody: any
  usageData?: any
  streamingChunks: Array<{
    chunkIndex: number
    timestamp: string
    data: string
    tokenCount: number
  }>
}

export const apiRoutes = new Hono<{
  Variables: {
    pool?: Pool
  }
}>()

/**
 * GET /api/stats - Get aggregated statistics
 */
apiRoutes.get('/stats', async c => {
  let pool = c.get('pool')

  // Fallback: try to get pool from container if not in context
  if (!pool) {
    const { container } = await import('../container.js')
    pool = container.getDbPool()

    if (!pool) {
      logger.warn('API stats requested but pool is not available', {
        metadata: {
          hasPool: !!pool,
          poolType: typeof pool,
          path: c.req.path,
        },
      })
      return c.json({ error: 'Database not configured' }, 503)
    }
  }

  try {
    const query = c.req.query()
    const params = statsQuerySchema.parse(query)

    const conditions = []
    const values = []
    let paramCount = 0

    if (params.domain) {
      conditions.push(`domain = $${++paramCount}`)
      values.push(params.domain)
    }

    if (params.since) {
      conditions.push(`timestamp > $${++paramCount}`)
      values.push(params.since)
    } else {
      // Default to last 24 hours
      conditions.push(`timestamp > NOW() - INTERVAL '24 hours'`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Get base statistics
    const statsQuery = `
      SELECT
        COUNT(*) as total_requests,
        COALESCE(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)), 0) as total_tokens,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(cache_creation_input_tokens), 0) as total_cache_creation_tokens,
        COALESCE(SUM(cache_read_input_tokens), 0) as total_cache_read_tokens,
        COALESCE(AVG(duration_ms), 0) as avg_response_time,
        COUNT(*) FILTER (WHERE error IS NOT NULL) as error_count,
        COUNT(DISTINCT domain) as active_domains
      FROM api_requests
      ${whereClause}
    `

    const statsResult = await pool.query(statsQuery, values)
    const stats = statsResult.rows[0]

    // Get model breakdown
    const modelQuery = `
      SELECT model, COUNT(*) as count
      FROM api_requests
      ${whereClause}
      GROUP BY model
      ORDER BY count DESC
    `
    const modelResult = await pool.query(modelQuery, values)
    const requestsByModel = Object.fromEntries(
      modelResult.rows.map(row => [row.model, parseInt(row.count)])
    )

    // Get request type breakdown
    const typeQuery = `
      SELECT request_type, COUNT(*) as count
      FROM api_requests
      ${whereClause}
      AND request_type IS NOT NULL
      GROUP BY request_type
      ORDER BY count DESC
    `
    const typeResult = await pool.query(typeQuery, values)
    const requestsByType = Object.fromEntries(
      typeResult.rows.map(row => [row.request_type, parseInt(row.count)])
    )

    const response: StatsResponse = {
      totalRequests: parseInt(stats.total_requests) || 0,
      totalTokens: parseInt(stats.total_tokens) || 0,
      totalInputTokens: parseInt(stats.total_input_tokens) || 0,
      totalOutputTokens: parseInt(stats.total_output_tokens) || 0,
      totalCacheCreationTokens: parseInt(stats.total_cache_creation_tokens) || 0,
      totalCacheReadTokens: parseInt(stats.total_cache_read_tokens) || 0,
      averageResponseTime: parseFloat(stats.avg_response_time) || 0,
      errorCount: parseInt(stats.error_count) || 0,
      activeDomains: parseInt(stats.active_domains) || 0,
      requestsByModel,
      requestsByType,
    }

    return c.json(response)
  } catch (error) {
    logger.error('Failed to get stats', { error: getErrorMessage(error) })
    return c.json({ error: 'Failed to retrieve statistics' }, 500)
  }
})

/**
 * GET /api/requests - Get recent requests
 */
apiRoutes.get('/requests', async c => {
  let pool = c.get('pool')

  // Fallback: try to get pool from container if not in context
  if (!pool) {
    const { container } = await import('../container.js')
    pool = container.getDbPool()

    if (!pool) {
      return c.json({ error: 'Database not configured' }, 503)
    }
  }

  try {
    const query = c.req.query()
    const params = requestsQuerySchema.parse(query)

    const conditions = []
    const values = []
    let paramCount = 0

    if (params.domain) {
      conditions.push(`domain = $${++paramCount}`)
      values.push(params.domain)
    }

    // Add limit and offset
    values.push(params.limit)
    values.push(params.offset)

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const requestsQuery = `
      SELECT 
        request_id,
        domain,
        model,
        timestamp,
        COALESCE(input_tokens, 0) as input_tokens,
        COALESCE(output_tokens, 0) as output_tokens,
        COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) as total_tokens,
        COALESCE(duration_ms, 0) as duration_ms,
        COALESCE(response_status, 0) as response_status,
        error,
        request_type
      FROM api_requests
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
    `

    const result = await pool.query(requestsQuery, values)

    const requests: RequestSummary[] = result.rows.map(row => ({
      requestId: row.request_id,
      domain: row.domain,
      model: row.model,
      timestamp: row.timestamp,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      totalTokens: row.total_tokens,
      durationMs: row.duration_ms,
      responseStatus: row.response_status,
      error: row.error,
      requestType: row.request_type,
    }))

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM api_requests
      ${whereClause}
    `
    const countResult = await pool.query(countQuery, values.slice(0, -2)) // Exclude limit/offset
    const totalCount = parseInt(countResult.rows[0].total) || 0

    return c.json({
      requests,
      pagination: {
        total: totalCount,
        limit: params.limit,
        offset: params.offset,
        hasMore: params.offset + params.limit < totalCount,
      },
    })
  } catch (error) {
    logger.error('Failed to get requests', { error: getErrorMessage(error) })
    return c.json({ error: 'Failed to retrieve requests' }, 500)
  }
})

/**
 * GET /api/requests/:id - Get request details
 */
apiRoutes.get('/requests/:id', async c => {
  let pool = c.get('pool')

  // Fallback: try to get pool from container if not in context
  if (!pool) {
    const { container } = await import('../container.js')
    pool = container.getDbPool()

    if (!pool) {
      return c.json({ error: 'Database not configured' }, 503)
    }
  }

  const requestId = c.req.param('id')

  try {
    // Get request details
    const requestQuery = `
      SELECT 
        request_id,
        domain,
        model,
        timestamp,
        COALESCE(input_tokens, 0) as input_tokens,
        COALESCE(output_tokens, 0) as output_tokens,
        COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) as total_tokens,
        COALESCE(duration_ms, 0) as duration_ms,
        COALESCE(response_status, 0) as response_status,
        error,
        request_type,
        conversation_id,
        body as request_body,
        response_body,
        usage_data
      FROM api_requests 
      WHERE request_id = $1
    `
    const requestResult = await pool.query(requestQuery, [requestId])

    if (requestResult.rows.length === 0) {
      return c.json({ error: 'Request not found' }, 404)
    }

    const row = requestResult.rows[0]

    // Get streaming chunks if any
    const chunksQuery = `
      SELECT chunk_index, timestamp, data
      FROM streaming_chunks 
      WHERE request_id = $1 
      ORDER BY chunk_index
    `
    const chunksResult = await pool.query(chunksQuery, [requestId])

    const details: RequestDetails = {
      requestId: row.request_id,
      domain: row.domain,
      model: row.model,
      timestamp: row.timestamp,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      totalTokens: row.total_tokens,
      durationMs: row.duration_ms,
      responseStatus: row.response_status,
      error: row.error,
      requestType: row.request_type,
      conversationId: row.conversation_id,
      requestBody: row.request_body,
      responseBody: row.response_body,
      usageData: row.usage_data,
      streamingChunks: chunksResult.rows.map(chunk => ({
        chunkIndex: chunk.chunk_index,
        timestamp: chunk.timestamp,
        data: chunk.data,
        tokenCount: 0, // token_count not in schema
      })),
    }

    return c.json(details)
  } catch (error) {
    logger.error('Failed to get request details', {
      error: getErrorMessage(error),
      stack: getErrorStack(error),
      requestId,
    })
    return c.json(
      {
        error: 'Failed to retrieve request details',
        details: getErrorMessage(error),
      },
      500
    )
  }
})

/**
 * GET /api/domains - Get list of active domains
 */
apiRoutes.get('/domains', async c => {
  let pool = c.get('pool')

  // Fallback: try to get pool from container if not in context
  if (!pool) {
    const { container } = await import('../container.js')
    pool = container.getDbPool()

    if (!pool) {
      // Return empty domains list when database is not configured
      logger.debug('Domains API called but database not configured')
      return c.json({ domains: [] })
    }
  }

  try {
    const query = `
      SELECT DISTINCT domain, COUNT(*) as request_count
      FROM api_requests
      WHERE timestamp > NOW() - INTERVAL '7 days'
      GROUP BY domain
      ORDER BY request_count DESC
    `

    const result = await pool.query(query)
    const domains = result.rows.map(row => ({
      domain: row.domain,
      requestCount: parseInt(row.request_count),
    }))

    return c.json({ domains })
  } catch (error) {
    logger.error('Failed to get domains', { error: getErrorMessage(error) })
    return c.json({ error: 'Failed to retrieve domains' }, 500)
  }
})

/**
 * GET /api/conversations - Get conversations with account information
 */
apiRoutes.get('/conversations', async c => {
  let pool = c.get('pool')

  if (!pool) {
    const { container } = await import('../container.js')
    pool = container.getDbPool()

    if (!pool) {
      return c.json({ error: 'Database not configured' }, 503)
    }
  }

  try {
    const query = c.req.query()
    const params = conversationsQuerySchema.parse(query)

    const conditions: string[] = []
    const values: any[] = []
    let paramCount = 0

    if (params.domain) {
      conditions.push(`domain = $${++paramCount}`)
      values.push(params.domain)
    }

    if (params.accountId) {
      conditions.push(`account_id = $${++paramCount}`)
      values.push(params.accountId)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Get conversations grouped by conversation_id with account info and subtask status
    // TODO: Optimize query performance (HIGH)
    // The correlated subqueries for latest_request_id and parent_task_request_id
    // create an N+1 query pattern. Should be rewritten using window functions
    // or additional CTEs to calculate all fields in a single pass.
    // See: https://github.com/Moonsong-Labs/claude-nexus-proxy/pull/13#review
    const conversationsQuery = `
      WITH conversation_summary AS (
        SELECT 
          conversation_id,
          domain,
          account_id,
          MIN(timestamp) as first_message_time,
          MAX(timestamp) as last_message_time,
          COUNT(*) as message_count,
          SUM(input_tokens + output_tokens) as total_tokens,
          COUNT(DISTINCT branch_id) as branch_count,
          ARRAY_AGG(DISTINCT model) as models_used,
          (SELECT request_id FROM api_requests 
           WHERE conversation_id = ar.conversation_id 
           ${whereClause ? 'AND ' + whereClause.replace('WHERE', '') : ''}
           ORDER BY timestamp DESC 
           LIMIT 1) as latest_request_id,
          BOOL_OR(is_subtask) as is_subtask,
          (SELECT parent_task_request_id FROM api_requests 
           WHERE conversation_id = ar.conversation_id 
           AND is_subtask = true 
           LIMIT 1) as parent_task_request_id,
          COUNT(CASE WHEN is_subtask THEN 1 END) as subtask_message_count
        FROM api_requests ar
        ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} conversation_id IS NOT NULL
        GROUP BY conversation_id, domain, account_id
      )
      SELECT * FROM conversation_summary
      ORDER BY last_message_time DESC
      LIMIT $${++paramCount}
    `

    values.push(params.limit)

    const result = await pool.query(conversationsQuery, values)

    const conversations = result.rows.map(row => ({
      conversationId: row.conversation_id,
      domain: row.domain,
      accountId: row.account_id,
      firstMessageTime: row.first_message_time,
      lastMessageTime: row.last_message_time,
      messageCount: parseInt(row.message_count),
      totalTokens: parseInt(row.total_tokens),
      branchCount: parseInt(row.branch_count),
      modelsUsed: row.models_used,
      latestRequestId: row.latest_request_id,
      isSubtask: row.is_subtask,
      parentTaskRequestId: row.parent_task_request_id,
      subtaskMessageCount: parseInt(row.subtask_message_count || 0),
    }))

    return c.json({ conversations })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid parameters', details: error.errors }, 400)
    }
    logger.error('Failed to get conversations', { error: getErrorMessage(error) })
    return c.json({ error: 'Failed to retrieve conversations' }, 500)
  }
})

// Token usage query schemas
const tokenUsageWindowSchema = z.object({
  accountId: z.string(),
  domain: z.string().optional(),
  model: z.string().optional(),
  window: z.string().regex(/^\d+$/).transform(Number).default('300'), // Default 5 hours (300 minutes)
})

const tokenUsageDailySchema = z.object({
  accountId: z.string(),
  domain: z.string().optional(),
  days: z.string().regex(/^\d+$/).transform(Number).default('30'),
  aggregate: z
    .string()
    .transform(v => v === 'true')
    .default('false'),
})

/**
 * GET /api/token-usage/current - Get current window token usage
 */
apiRoutes.get('/token-usage/current', async c => {
  const tokenUsageService = container.getTokenUsageService()

  if (!tokenUsageService) {
    return c.json({ error: 'Token usage tracking not configured' }, 503)
  }

  try {
    const query = c.req.query()
    const params = tokenUsageWindowSchema.parse(query)

    const windowHours = params.window / 60 // Convert minutes to hours
    const usage = await tokenUsageService.getUsageWindow(
      params.accountId,
      windowHours,
      params.domain,
      params.model
    )

    return c.json(usage)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid parameters', details: error.errors }, 400)
    }
    logger.error('Failed to get token usage window', { error: getErrorMessage(error) })
    return c.json({ error: 'Failed to retrieve token usage' }, 500)
  }
})

/**
 * GET /api/token-usage/daily - Get daily token usage
 */
apiRoutes.get('/token-usage/daily', async c => {
  const tokenUsageService = container.getTokenUsageService()

  if (!tokenUsageService) {
    return c.json({ error: 'Token usage tracking not configured' }, 503)
  }

  try {
    const query = c.req.query()
    const params = tokenUsageDailySchema.parse(query)

    const usage = params.aggregate
      ? await tokenUsageService.getAggregatedDailyUsage(
          params.accountId,
          params.days,
          params.domain
        )
      : await tokenUsageService.getDailyUsage(params.accountId, params.days, params.domain)

    return c.json({ usage })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid parameters', details: error.errors }, 400)
    }
    logger.error('Failed to get daily token usage', { error: getErrorMessage(error) })
    return c.json({ error: 'Failed to retrieve daily usage' }, 500)
  }
})

/**
 * GET /api/token-usage/time-series - Get token usage time series with 5-minute granularity
 */
apiRoutes.get('/token-usage/time-series', async c => {
  const tokenUsageService = container.getTokenUsageService()

  if (!tokenUsageService) {
    return c.json({ error: 'Token usage tracking not configured' }, 503)
  }

  try {
    const query = c.req.query()
    const accountId = query.accountId
    const windowHours = parseInt(query.window || '5')
    const intervalMinutes = parseInt(query.interval || '5')

    if (!accountId) {
      return c.json({ error: 'accountId is required' }, 400)
    }

    let pool = c.get('pool')
    if (!pool) {
      pool = container.getDbPool()
      if (!pool) {
        return c.json({ error: 'Database not configured' }, 503)
      }
    }

    // Get time series data with specified interval
    const timeSeriesQuery = `
      WITH time_buckets AS (
        SELECT 
          generate_series(
            NOW() - ($2 * INTERVAL '1 hour'),
            NOW(),
            $3 * INTERVAL '1 minute'
          ) AS bucket_time
      )
      SELECT 
        tb.bucket_time,
        (
          SELECT COALESCE(SUM(output_tokens), 0)
          FROM api_requests
          WHERE account_id = $1
            AND timestamp > tb.bucket_time - ($2 * INTERVAL '1 hour')
            AND timestamp <= tb.bucket_time
        ) AS cumulative_output_tokens
      FROM time_buckets tb
      ORDER BY tb.bucket_time ASC
    `

    const result = await pool.query(timeSeriesQuery, [accountId, windowHours, intervalMinutes])

    // Calculate tokens remaining from limit
    const tokenLimit = 140000 // 5-hour limit

    const timeSeries = result.rows.map(row => {
      const cumulativeUsage = parseInt(row.cumulative_output_tokens) || 0
      const remaining = tokenLimit - cumulativeUsage

      return {
        time: row.bucket_time,
        outputTokens: cumulativeUsage,
        cumulativeUsage,
        remaining: Math.max(0, remaining),
        percentageUsed: (cumulativeUsage / tokenLimit) * 100,
      }
    })

    return c.json({
      accountId,
      windowHours,
      intervalMinutes,
      tokenLimit,
      timeSeries,
    })
  } catch (error) {
    logger.error('Failed to get token usage time series', { error: getErrorMessage(error) })
    return c.json({ error: 'Failed to retrieve time series data' }, 500)
  }
})

/**
 * GET /api/token-usage/accounts - Get all accounts with their current token usage
 */
apiRoutes.get('/token-usage/accounts', async c => {
  let pool = c.get('pool')

  if (!pool) {
    pool = container.getDbPool()
    if (!pool) {
      return c.json({ error: 'Database not configured' }, 503)
    }
  }

  try {
    // Get all accounts with usage in the last 5 hours
    const accountsQuery = `
      WITH account_usage AS (
        SELECT 
          account_id,
          SUM(output_tokens) as total_output_tokens,
          SUM(input_tokens) as total_input_tokens,
          COUNT(*) as request_count,
          MAX(timestamp) as last_request_time
        FROM api_requests
        WHERE account_id IS NOT NULL
          AND timestamp >= NOW() - INTERVAL '5 hours'
        GROUP BY account_id
      ),
      domain_usage AS (
        SELECT 
          account_id,
          domain,
          SUM(output_tokens) as domain_output_tokens,
          COUNT(*) as domain_requests
        FROM api_requests
        WHERE account_id IS NOT NULL
          AND timestamp >= NOW() - INTERVAL '5 hours'
        GROUP BY account_id, domain
      )
      SELECT 
        au.account_id,
        au.total_output_tokens,
        au.total_input_tokens,
        au.request_count,
        au.last_request_time,
        COALESCE(
          json_agg(
            json_build_object(
              'domain', du.domain,
              'outputTokens', du.domain_output_tokens,
              'requests', du.domain_requests
            ) ORDER BY du.domain_output_tokens DESC
          ) FILTER (WHERE du.domain IS NOT NULL),
          '[]'::json
        ) as domains
      FROM account_usage au
      LEFT JOIN domain_usage du ON au.account_id = du.account_id
      GROUP BY au.account_id, au.total_output_tokens, au.total_input_tokens, 
               au.request_count, au.last_request_time
      ORDER BY au.total_output_tokens DESC
    `

    const result = await pool.query(accountsQuery)

    const tokenLimit = 140000 // 5-hour limit

    const accounts = result.rows.map(row => ({
      accountId: row.account_id,
      outputTokens: parseInt(row.total_output_tokens) || 0,
      inputTokens: parseInt(row.total_input_tokens) || 0,
      requestCount: parseInt(row.request_count) || 0,
      lastRequestTime: row.last_request_time,
      remainingTokens: Math.max(0, tokenLimit - (parseInt(row.total_output_tokens) || 0)),
      percentageUsed: ((parseInt(row.total_output_tokens) || 0) / tokenLimit) * 100,
      domains: row.domains || [],
    }))

    // For each account, get mini time series (last 20 points)
    // TODO: Fix N+1 query pattern (MEDIUM)
    // This loops through each account and executes a separate query for time series data.
    // Should be refactored to fetch all time series data in a single query with window functions.
    // See: https://github.com/Moonsong-Labs/claude-nexus-proxy/pull/13#review
    const accountsWithSeries = await Promise.all(
      accounts.map(async account => {
        const miniSeriesQuery = `
          WITH time_buckets AS (
            SELECT 
              generate_series(
                NOW() - INTERVAL '5 hours',
                NOW(),
                INTERVAL '15 minutes'
              ) AS bucket_time
          )
          SELECT 
            tb.bucket_time,
            (
              SELECT COALESCE(SUM(output_tokens), 0)
              FROM api_requests
              WHERE account_id = $1
                AND timestamp > tb.bucket_time - INTERVAL '5 hours'
                AND timestamp <= tb.bucket_time
            ) AS cumulative_output_tokens
          FROM time_buckets tb
          ORDER BY tb.bucket_time ASC
        `

        const seriesResult = await pool.query(miniSeriesQuery, [account.accountId])

        const miniSeries = seriesResult.rows.map(row => ({
          time: row.bucket_time,
          remaining: Math.max(0, tokenLimit - (parseInt(row.cumulative_output_tokens) || 0)),
        }))

        return {
          ...account,
          miniSeries,
        }
      })
    )

    return c.json({
      accounts: accountsWithSeries,
      tokenLimit,
    })
  } catch (error) {
    logger.error('Failed to get accounts token usage', { error: getErrorMessage(error) })
    return c.json({ error: 'Failed to retrieve accounts data' }, 500)
  }
})
