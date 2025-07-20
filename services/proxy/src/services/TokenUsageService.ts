import { Pool, QueryResult } from 'pg'
import { logger } from '../middleware/logger.js'

// Constants
const DEFAULT_WINDOW_HOURS = 5
const DEFAULT_DAYS = 30
const MAX_DAYS = 365
const MAX_WINDOW_HOURS = 720 // 30 days

export interface TokenUsageData {
  accountId: string
  domain: string
  model: string
  requestType?: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  requestCount: number
}

export interface TokenUsageWindow {
  accountId: string
  domain: string
  model: string
  windowStart: Date
  windowEnd: Date
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalRequests: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
}

export interface DailyUsage {
  date: string
  accountId: string
  domain: string
  model?: string
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalRequests: number
}

/**
 * Service for querying token usage from api_requests table
 * Provides read-only access to aggregated token usage data
 */
export class TokenUsageService {
  constructor(private pool: Pool) {}

  /**
   * Get token usage for a sliding window (e.g., 5 hours)
   * @param accountId - The account ID to query usage for
   * @param windowHours - Number of hours to look back (default: 5, max: 720)
   * @param domain - Optional domain filter
   * @param model - Optional model filter
   * @returns Token usage data for the specified window
   */
  async getUsageWindow(
    accountId: string,
    windowHours: number = DEFAULT_WINDOW_HOURS,
    domain?: string,
    model?: string
  ): Promise<TokenUsageWindow> {
    // Validate inputs
    if (!accountId || typeof accountId !== 'string') {
      throw new Error('Invalid accountId')
    }
    if (windowHours <= 0 || windowHours > MAX_WINDOW_HOURS) {
      throw new Error(`windowHours must be between 1 and ${MAX_WINDOW_HOURS}`)
    }

    try {
      // Build query with proper parameterization
      const conditions: string[] = [
        'account_id = $1',
        "timestamp >= NOW() - ($2 * INTERVAL '1 hour')",
        'timestamp < NOW()',
      ]
      const values: (string | number)[] = [accountId, windowHours]
      let paramIndex = 3

      if (domain) {
        conditions.push(`domain = $${paramIndex}`)
        values.push(domain)
        paramIndex++
      }

      if (model) {
        conditions.push(`model = $${paramIndex}`)
        values.push(model)
      }

      const query = `
        SELECT 
          $1::varchar as account_id,
          COALESCE(${domain ? `$${values.indexOf(domain) + 1}` : "'all'"}::varchar, 'all') as domain,
          COALESCE(${model ? `$${values.indexOf(model) + 1}` : "'all'"}::varchar, 'all') as model,
          NOW() - ($2 * INTERVAL '1 hour') as window_start,
          NOW() as window_end,
          COALESCE(SUM(input_tokens), 0) as total_input_tokens,
          COALESCE(SUM(output_tokens), 0) as total_output_tokens,
          COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
          COUNT(*) as total_requests,
          COALESCE(SUM(cache_creation_input_tokens), 0) as cache_creation_input_tokens,
          COALESCE(SUM(cache_read_input_tokens), 0) as cache_read_input_tokens
        FROM api_requests
        WHERE ${conditions.join(' AND ')}
      `

      const result = await this.pool.query(query, values)

      if (result.rows.length === 0) {
        // Return empty usage
        return {
          accountId,
          domain: domain || 'all',
          model: model || 'all',
          windowStart: new Date(Date.now() - windowHours * 60 * 60 * 1000),
          windowEnd: new Date(),
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalTokens: 0,
          totalRequests: 0,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
        }
      }

      const row = result.rows[0]
      return {
        accountId: row.account_id,
        domain: row.domain || 'all',
        model: row.model || 'all',
        windowStart: row.window_start,
        windowEnd: row.window_end,
        totalInputTokens: parseInt(row.total_input_tokens),
        totalOutputTokens: parseInt(row.total_output_tokens),
        totalTokens: parseInt(row.total_tokens),
        totalRequests: parseInt(row.total_requests),
        cacheCreationInputTokens: parseInt(row.cache_creation_input_tokens),
        cacheReadInputTokens: parseInt(row.cache_read_input_tokens),
      }
    } catch (error) {
      logger.error('Failed to get usage window', {
        metadata: {
          accountId,
          windowHours,
          error: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  }

  /**
   * Get daily usage statistics
   * @param accountId - The account ID to query usage for
   * @param days - Number of days to look back (default: 30, max: 365)
   * @param domain - Optional domain filter
   * @returns Array of daily usage statistics
   */
  async getDailyUsage(
    accountId: string,
    days: number = DEFAULT_DAYS,
    domain?: string
  ): Promise<DailyUsage[]> {
    // Validate inputs
    if (!accountId || typeof accountId !== 'string') {
      throw new Error('Invalid accountId')
    }
    if (days <= 0 || days > MAX_DAYS) {
      throw new Error(`days must be between 1 and ${MAX_DAYS}`)
    }

    try {
      const result = await this.getDailyUsageQuery(
        accountId,
        days,
        domain,
        false // include model in grouping
      )

      return result.rows.map((row: any) => ({
        date: row.date.toISOString().split('T')[0],
        accountId: row.account_id,
        domain: row.domain,
        model: row.model,
        totalInputTokens: parseInt(row.total_input_tokens),
        totalOutputTokens: parseInt(row.total_output_tokens),
        totalTokens: parseInt(row.total_tokens),
        totalRequests: parseInt(row.total_requests),
      }))
    } catch (error) {
      logger.error('Failed to get daily usage', {
        metadata: {
          accountId,
          days,
          error: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  }

  /**
   * Get aggregated daily usage (across all models)
   * @param accountId - The account ID to query usage for
   * @param days - Number of days to look back (default: 30, max: 365)
   * @param domain - Optional domain filter
   * @returns Array of aggregated daily usage statistics
   */
  async getAggregatedDailyUsage(
    accountId: string,
    days: number = DEFAULT_DAYS,
    domain?: string
  ): Promise<DailyUsage[]> {
    // Validate inputs
    if (!accountId || typeof accountId !== 'string') {
      throw new Error('Invalid accountId')
    }
    if (days <= 0 || days > MAX_DAYS) {
      throw new Error(`days must be between 1 and ${MAX_DAYS}`)
    }

    try {
      const result = await this.getDailyUsageQuery(
        accountId,
        days,
        domain,
        true // aggregate across models
      )

      return result.rows.map((row: any) => ({
        date: row.date.toISOString().split('T')[0],
        accountId: row.account_id,
        domain: row.domain,
        totalInputTokens: parseInt(row.total_input_tokens),
        totalOutputTokens: parseInt(row.total_output_tokens),
        totalTokens: parseInt(row.total_tokens),
        totalRequests: parseInt(row.total_requests),
      }))
    } catch (error) {
      logger.error('Failed to get aggregated daily usage', {
        metadata: {
          accountId,
          days,
          error: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  }

  /**
   * Shared query logic for daily usage statistics
   * @private
   */
  private async getDailyUsageQuery(
    accountId: string,
    days: number,
    domain: string | undefined,
    aggregateModels: boolean
  ): Promise<QueryResult> {
    const conditions: string[] = ['account_id = $1', "timestamp >= NOW() - ($2 * INTERVAL '1 day')"]
    const values: (string | number)[] = [accountId, days]

    if (domain) {
      conditions.push('domain = $3')
      values.push(domain)
    }

    const groupBy = aggregateModels ? 'date, account_id, domain' : 'date, account_id, domain, model'

    const selectModel = aggregateModels ? '' : 'model,'
    const orderBy = aggregateModels ? 'date DESC, domain' : 'date DESC, domain, model'

    const query = `
      SELECT 
        DATE(timestamp AT TIME ZONE 'UTC') as date,
        account_id,
        domain,
        ${selectModel}
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(input_tokens + output_tokens) as total_tokens,
        COUNT(*) as total_requests
      FROM api_requests
      WHERE ${conditions.join(' AND ')}
      GROUP BY ${groupBy}
      ORDER BY ${orderBy}
    `

    return this.pool.query(query, values)
  }
}
