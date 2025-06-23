import { Pool } from 'pg'
import { logger } from '../middleware/logger.js'

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
 * Service for tracking and querying token usage
 * Provides persistent storage and efficient querying of token usage data
 */
export class TokenUsageService {
  constructor(private pool: Pool) {}

  /**
   * Record token usage for a request
   * Note: Token usage is now tracked directly in api_requests table
   * This method is kept for backward compatibility but does nothing
   */
  async recordUsage(_data: TokenUsageData): Promise<void> {
    // Token usage is now tracked directly in api_requests table
    // No separate recording needed
  }

  /**
   * Get token usage for a sliding window (e.g., 5 hours)
   */
  async getUsageWindow(
    accountId: string,
    windowHours: number = 5,
    domain?: string,
    model?: string
  ): Promise<TokenUsageWindow> {
    try {
      let query = `
        SELECT 
          $1::varchar as account_id,
          COALESCE($2::varchar, 'all') as domain,
          COALESCE($3::varchar, 'all') as model,
          NOW() - INTERVAL '${windowHours} hours' as window_start,
          NOW() as window_end,
          COALESCE(SUM(input_tokens), 0) as total_input_tokens,
          COALESCE(SUM(output_tokens), 0) as total_output_tokens,
          COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
          COUNT(*) as total_requests,
          COALESCE(SUM(cache_creation_input_tokens), 0) as cache_creation_input_tokens,
          COALESCE(SUM(cache_read_input_tokens), 0) as cache_read_input_tokens
        FROM api_requests
        WHERE account_id = $1
          AND timestamp >= NOW() - INTERVAL '${windowHours} hours'
          AND timestamp < NOW()
      `

      const values: any[] = [accountId, domain || '', model || '']

      if (domain) {
        query += ` AND domain = $2`
      }

      if (model) {
        query += ` AND model = $3`
      }

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
   */
  async getDailyUsage(
    accountId: string,
    days: number = 30,
    domain?: string
  ): Promise<DailyUsage[]> {
    try {
      let query = `
        SELECT 
          DATE(timestamp AT TIME ZONE 'UTC') as date,
          account_id,
          domain,
          model,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(input_tokens + output_tokens) as total_tokens,
          COUNT(*) as total_requests
        FROM api_requests
        WHERE account_id = $1
          AND timestamp >= NOW() - INTERVAL '${days} days'
      `

      const values: any[] = [accountId]

      if (domain) {
        query += ` AND domain = $2`
        values.push(domain)
      }

      query += `
        GROUP BY date, account_id, domain, model
        ORDER BY date DESC, domain, model
      `

      const result = await this.pool.query(query, values)

      return result.rows.map(row => ({
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
   */
  async getAggregatedDailyUsage(
    accountId: string,
    days: number = 30,
    domain?: string
  ): Promise<DailyUsage[]> {
    try {
      let query = `
        SELECT 
          DATE(timestamp AT TIME ZONE 'UTC') as date,
          account_id,
          domain,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(input_tokens + output_tokens) as total_tokens,
          COUNT(*) as total_requests
        FROM api_requests
        WHERE account_id = $1
          AND timestamp >= NOW() - INTERVAL '${days} days'
      `

      const values: any[] = [accountId]

      if (domain) {
        query += ` AND domain = $2`
        values.push(domain)
      }

      query += `
        GROUP BY date, account_id, domain
        ORDER BY date DESC, domain
      `

      const result = await this.pool.query(query, values)

      return result.rows.map(row => ({
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
   * Initialize and ensure partitions exist
   * Note: No longer needed as we use api_requests table
   */
  async ensurePartitions(): Promise<void> {
    // No longer needed - using api_requests table
  }
}
