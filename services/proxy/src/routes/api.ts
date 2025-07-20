import { Hono } from 'hono'
import { z } from 'zod'
import { logger } from '../middleware/logger.js'
import { getErrorStack } from '@claude-nexus/shared'
import { container } from '../container.js'
import { getDatabasePool, handleApiError, parseQueryParams } from './api-utils.js'
import { TOKEN_LIMITS, QUERY_DEFAULTS, TIME_INTERVALS } from './api-constants.js'
import { API_QUERIES } from './api-queries.js'
import type {
  StatsResponse,
  RequestSummary,
  RequestDetails,
  PaginationInfo,
  Domain,
  ConversationSummary,
  StatsQueryResult,
  ModelCountResult,
  RequestTypeCountResult,
  HourlyUsageData,
  TimeSeriesPoint,
  AccountTokenUsage,
} from './api-types.js'

// Query parameter schemas
const statsQuerySchema = z.object({
  domain: z.string().optional(),
  since: z.string().datetime().optional(),
})

const requestsQuerySchema = z.object({
  domain: z.string().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).default(String(QUERY_DEFAULTS.LIMIT)),
  offset: z.string().regex(/^\d+$/).transform(Number).default(String(QUERY_DEFAULTS.OFFSET)),
})

const conversationsQuerySchema = z.object({
  domain: z.string().optional(),
  accountId: z.string().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).default(String(QUERY_DEFAULTS.CONVERSATIONS_LIMIT)),
})

// Define Hono app type
import type { Pool } from 'pg'

type Variables = {
  pool?: Pool
}

export const apiRoutes = new Hono<{ Variables: Variables }>()

// ============================================================================
// STATISTICS ENDPOINTS
// ============================================================================

/**
 * GET /api/stats - Get aggregated statistics
 */
apiRoutes.get('/stats', async c => {

  try {
    const pool = await getDatabasePool(c)
    const params = parseQueryParams(c, statsQuerySchema)

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
      conditions.push(`timestamp > NOW() - INTERVAL '${TIME_INTERVALS.STATS_DEFAULT_HOURS} hours'`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Get base statistics
    const statsQuery = API_QUERIES.STATS_BASE + '\n' + whereClause

    const statsResult = await pool.query<StatsQueryResult>(statsQuery, values)
    const stats = statsResult.rows[0]

    // Get model breakdown
    const modelQuery = API_QUERIES.STATS_BY_MODEL.replace('FROM api_requests', `FROM api_requests\n${whereClause}`)
    const modelResult = await pool.query<ModelCountResult>(modelQuery, values)
    const requestsByModel = Object.fromEntries(
      modelResult.rows.map(row => [row.model, parseInt(row.count)])
    )

    // Get request type breakdown
    const typeQuery = API_QUERIES.STATS_BY_TYPE.replace('FROM api_requests', `FROM api_requests\n${whereClause}`)
    const typeResult = await pool.query<RequestTypeCountResult>(typeQuery, values)
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
    return handleApiError(c, error, 'Failed to retrieve statistics')
  }
})

// ============================================================================
// REQUEST ENDPOINTS
// ============================================================================

/**
 * GET /api/requests - Get recent requests
 */
apiRoutes.get('/requests', async c => {

  try {
    const pool = await getDatabasePool(c)
    const params = parseQueryParams(c, requestsQuerySchema)

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

    const requestsQuery = API_QUERIES.REQUESTS_LIST.replace(
      'FROM api_requests',
      `FROM api_requests\n${whereClause}`
    ).replace(
      'ORDER BY timestamp DESC',
      `ORDER BY timestamp DESC\nLIMIT $${values.length - 1}\nOFFSET $${values.length}`
    )

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

    const pagination: PaginationInfo = {
      total: totalCount,
      limit: params.limit,
      offset: params.offset,
      hasMore: params.offset + params.limit < totalCount,
    }

    return c.json({ requests, pagination })
  } catch (error) {
    return handleApiError(c, error, 'Failed to retrieve requests')
  }
})

/**
 * GET /api/requests/:id - Get request details
 */
apiRoutes.get('/requests/:id', async c => {

  const requestId = c.req.param('id')

  try {
    const pool = await getDatabasePool(c)
    // Get request details
    const requestQuery = API_QUERIES.REQUEST_DETAILS
    const requestResult = await pool.query(requestQuery, [requestId])

    if (requestResult.rows.length === 0) {
      return c.json({ error: 'Request not found' }, 404)
    }

    const row = requestResult.rows[0]

    // Get streaming chunks if any
    const chunksQuery = API_QUERIES.STREAMING_CHUNKS
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
      branchId: row.branch_id,
      parentRequestId: row.parent_request_id,
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
      requestId,
      metadata: {
        stack: getErrorStack(error),
      },
    })
    return handleApiError(c, error, 'Failed to retrieve request details')
  }
})

// ============================================================================
// DOMAIN ENDPOINTS
// ============================================================================

/**
 * GET /api/domains - Get list of active domains
 */
apiRoutes.get('/domains', async c => {

  try {
    const pool = await getDatabasePool(c).catch(() => null)
    
    if (!pool) {
      // Return empty domains list when database is not configured
      logger.debug('Domains API called but database not configured')
      return c.json({ domains: [] })
    }

    const query = API_QUERIES.ACTIVE_DOMAINS(TIME_INTERVALS.DOMAINS_DAYS)

    const result = await pool.query<{ domain: string; request_count: string }>(query)
    const domains: Domain[] = result.rows.map(row => ({
      domain: row.domain,
      requestCount: parseInt(row.request_count),
    }))

    return c.json({ domains })
  } catch (error) {
    return handleApiError(c, error, 'Failed to retrieve domains')
  }
})

// ============================================================================
// CONVERSATION ENDPOINTS
// ============================================================================

/**
 * GET /api/conversations - Get conversations with account information
 */
apiRoutes.get('/conversations', async c => {

  try {
    const pool = await getDatabasePool(c)
    const params = parseQueryParams(c, conversationsQuerySchema)

    const conditions: string[] = []
    const values: unknown[] = []
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
    const conversationsQuery = API_QUERIES.CONVERSATIONS_WITH_STATS
      .replace('WHERE conversation_id IS NOT NULL', `${whereClause}\n${whereClause ? 'AND' : 'WHERE'} conversation_id IS NOT NULL`)
      .replace('ORDER BY last_message_time DESC', `ORDER BY last_message_time DESC\nLIMIT $${++paramCount}`)

    values.push(params.limit)

    const result = await pool.query(conversationsQuery, values)

    const conversations: ConversationSummary[] = result.rows.map(row => {
      // Calculate context tokens from the latest response
      let latestContextTokens = 0
      if (row.latest_response_body?.usage) {
        const usage = row.latest_response_body.usage
        latestContextTokens =
          (usage.input_tokens || 0) +
          (usage.cache_read_input_tokens || 0) +
          (usage.cache_creation_input_tokens || 0)
      }

      return {
        conversationId: row.conversation_id,
        domain: row.domain,
        accountId: row.account_id,
        firstMessageTime: row.first_message_time,
        lastMessageTime: row.last_message_time,
        messageCount: parseInt(row.message_count),
        totalTokens: parseInt(row.total_tokens),
        branchCount: parseInt(row.branch_count),
        // Add new branch type counts
        subtaskBranchCount: parseInt(row.subtask_branch_count || 0),
        compactBranchCount: parseInt(row.compact_branch_count || 0),
        userBranchCount: parseInt(row.user_branch_count || 0),
        modelsUsed: row.models_used,
        latestRequestId: row.latest_request_id,
        latestModel: row.latest_model,
        latestContextTokens,
        isSubtask: row.is_subtask,
        parentTaskRequestId: row.parent_task_request_id,
        parentConversationId: row.parent_conversation_id,
        subtaskMessageCount: parseInt(row.subtask_message_count || 0),
      }
    })

    return c.json({ conversations })
  } catch (error) {
    return handleApiError(c, error, 'Failed to retrieve conversations')
  }
})

// ============================================================================
// TOKEN USAGE ENDPOINTS
// ============================================================================

// Token usage query schemas
const tokenUsageWindowSchema = z.object({
  accountId: z.string(),
  domain: z.string().optional(),
  model: z.string().optional(),
  window: z.string().regex(/^\d+$/).transform(Number).default(String(QUERY_DEFAULTS.TOKEN_WINDOW_MINUTES)),
})

const tokenUsageDailySchema = z.object({
  accountId: z.string(),
  domain: z.string().optional(),
  days: z.string().regex(/^\d+$/).transform(Number).default(String(QUERY_DEFAULTS.DAILY_USAGE_DAYS)),
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
    const params = parseQueryParams(c, tokenUsageWindowSchema)

    const windowHours = params.window / 60 // Convert minutes to hours
    const usage = await tokenUsageService.getUsageWindow(
      params.accountId,
      windowHours,
      params.domain,
      params.model
    )

    return c.json(usage)
  } catch (error) {
    return handleApiError(c, error, 'Failed to retrieve token usage')
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
    const params = parseQueryParams(c, tokenUsageDailySchema)

    const usage = params.aggregate
      ? await tokenUsageService.getAggregatedDailyUsage(
          params.accountId,
          params.days,
          params.domain
        )
      : await tokenUsageService.getDailyUsage(params.accountId, params.days, params.domain)

    return c.json({ usage })
  } catch (error) {
    return handleApiError(c, error, 'Failed to retrieve daily usage')
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
    const windowHours = parseInt(query.window || String(QUERY_DEFAULTS.TIME_SERIES_WINDOW_HOURS))
    const intervalMinutes = parseInt(query.interval || String(QUERY_DEFAULTS.TIME_SERIES_INTERVAL_MINUTES))

    if (!accountId) {
      return c.json({ error: 'accountId is required' }, 400)
    }

    const pool = await getDatabasePool(c)

    // Get time series data with specified interval
    const timeSeriesQuery = API_QUERIES.TOKEN_USAGE_TIME_SERIES

    const result = await pool.query(timeSeriesQuery, [accountId, windowHours, intervalMinutes])

    // Calculate tokens remaining from limit
    const tokenLimit = TOKEN_LIMITS.FIVE_HOUR_WINDOW

    const timeSeries: TimeSeriesPoint[] = result.rows.map(row => {
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
    return handleApiError(c, error, 'Failed to retrieve time series data')
  }
})

/**
 * GET /api/token-usage/accounts - Get all accounts with their current token usage
 */
apiRoutes.get('/token-usage/accounts', async c => {
  try {
    const pool = await getDatabasePool(c)
    
    // Get all accounts with usage in the last 5 hours
    const accountsQuery = API_QUERIES.TOKEN_USAGE_ACCOUNTS

    const result = await pool.query(accountsQuery)

    const tokenLimit = TOKEN_LIMITS.FIVE_HOUR_WINDOW

    const accounts: Omit<AccountTokenUsage, 'miniSeries'>[] = result.rows.map(row => ({
      accountId: row.account_id,
      outputTokens: parseInt(row.total_output_tokens) || 0,
      inputTokens: parseInt(row.total_input_tokens) || 0,
      requestCount: parseInt(row.request_count) || 0,
      lastRequestTime: row.last_request_time,
      remainingTokens: Math.max(0, tokenLimit - (parseInt(row.total_output_tokens) || 0)),
      percentageUsed: ((parseInt(row.total_output_tokens) || 0) / tokenLimit) * 100,
      domains: row.domains || [],
    }))

    // Fetch time series data for all accounts in a single query
    const accountIds = accounts.map(acc => acc.accountId)

    const timeSeriesQuery = API_QUERIES.TOKEN_USAGE_ACCOUNTS_TIME_SERIES(QUERY_DEFAULTS.ACCOUNTS_INTERVAL_MINUTES)

    const seriesResult = await pool.query(timeSeriesQuery, [accountIds])

    // Group time series data by account
    const seriesByAccount = new Map<string, Array<{ time: Date; remaining: number }>>()

    for (const row of seriesResult.rows) {
      const accountId = row.account_id
      const remaining = Math.max(0, tokenLimit - (parseInt(row.cumulative_output_tokens) || 0))

      if (!seriesByAccount.has(accountId)) {
        seriesByAccount.set(accountId, [])
      }

      const series = seriesByAccount.get(accountId)
      if (series) {
        series.push({
          time: row.bucket_time,
          remaining: remaining,
        })
      }
    }

    // Merge mini series data with accounts
    const accountsWithSeries: AccountTokenUsage[] = accounts.map(account => ({
      ...account,
      miniSeries: seriesByAccount.get(account.accountId) || [],
    }))

    return c.json({
      accounts: accountsWithSeries,
      tokenLimit,
    })
  } catch (error) {
    return handleApiError(c, error, 'Failed to retrieve accounts data')
  }
})

// ============================================================================
// USAGE ANALYTICS ENDPOINTS
// ============================================================================

/**
 * GET /api/usage/requests/hourly - Get hourly request counts by domain
 */
apiRoutes.get('/usage/requests/hourly', async c => {
  try {
    const pool = await getDatabasePool(c)
    const query = c.req.query()
    const domain = query.domain
    const days = parseInt(query.days || String(QUERY_DEFAULTS.HOURLY_USAGE_DAYS))

    // Validate days parameter
    if (days < 1 || days > 30) {
      return c.json({ error: 'Days parameter must be between 1 and 30' }, 400)
    }

    const conditions = []
    const values = []
    let paramCount = 0

    // Base condition for time range - using parameterized query for security
    conditions.push(`timestamp >= NOW() - ($${++paramCount} * INTERVAL '1 day')`)
    values.push(days)

    // Optional domain filter
    if (domain) {
      conditions.push(`domain = $${++paramCount}`)
      values.push(domain)
    }

    const whereClause = conditions.join(' AND ')

    // Query to get hourly request counts grouped by domain
    const hourlyQuery = API_QUERIES.HOURLY_REQUESTS.replace(
      'FROM\n      api_requests',
      `FROM\n      api_requests\n    WHERE\n      ${whereClause}`
    )

    const result = await pool.query(hourlyQuery, values)

    // Transform the flat result into nested structure by domain
    const data: Record<string, HourlyUsageData[]> = {}

    result.rows.forEach(row => {
      const domainKey = row.domain || 'unknown'
      if (!data[domainKey]) {
        data[domainKey] = []
      }
      data[domainKey].push({
        hour: row.hour,
        count: parseInt(row.request_count),
      })
    })

    return c.json({
      data,
      query: {
        domain: domain || null,
        days,
      },
    })
  } catch (error) {
    logger.error('Failed to get hourly usage data', {
      metadata: {
        stack: getErrorStack(error),
      },
    })
    return handleApiError(c, error, 'Failed to retrieve hourly usage data')
  }
})

/**
 * GET /api/usage/tokens/hourly - Get hourly token counts by domain (output tokens only)
 */
apiRoutes.get('/usage/tokens/hourly', async c => {
  try {
    const pool = await getDatabasePool(c)
    const query = c.req.query()
    const domain = query.domain
    const days = parseInt(query.days || String(QUERY_DEFAULTS.HOURLY_USAGE_DAYS))

    // Validate days parameter
    if (days < 1 || days > 30) {
      return c.json({ error: 'Days parameter must be between 1 and 30' }, 400)
    }

    const conditions = []
    const values = []
    let paramCount = 0

    // Base condition for time range
    conditions.push(`timestamp >= NOW() - ($${++paramCount} * INTERVAL '1 day')`)
    values.push(days)

    // Optional domain filter
    if (domain) {
      conditions.push(`domain = $${++paramCount}`)
      values.push(domain)
    }

    const whereClause = conditions.join(' AND ')

    // Query to get hourly token sums grouped by domain (output tokens only)
    const hourlyQuery = API_QUERIES.HOURLY_TOKENS.replace(
      'FROM\n      api_requests',
      `FROM\n      api_requests\n    WHERE\n      ${whereClause}`
    )

    const { rows } = await pool.query(hourlyQuery, values)

    // Group results by domain
    const data: Record<string, HourlyUsageData[]> = {}

    for (const row of rows) {
      const domainName = row.domain || 'unknown'
      if (!data[domainName]) {
        data[domainName] = []
      }

      data[domainName].push({
        hour: row.hour.toISOString(),
        count: parseInt(row.token_count),
      })
    }

    return c.json({
      data,
      query: {
        domain: domain || null,
        days,
      },
    })
  } catch (error) {
    return handleApiError(c, error, 'Failed to retrieve hourly token usage data')
  }
})
