import { Pool } from 'pg'
import { logger } from '../middleware/logger.js'

export interface TokenUsageData {
  accountId: string
  domain: string
  model: string
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

export interface RateLimitConfig {
  id: number
  accountId?: string
  domain?: string
  model?: string
  windowMinutes: number
  tokenLimit: number
  requestLimit?: number
  fallbackModel?: string
  enabled: boolean
}

/**
 * Service for tracking and querying token usage
 * Provides persistent storage and efficient querying of token usage data
 */
export class TokenUsageService {
  constructor(private pool: Pool) {}

  /**
   * Record token usage for a request
   */
  async recordUsage(data: TokenUsageData): Promise<void> {
    try {
      const query = `
        INSERT INTO token_usage (
          account_id, domain, model, request_type, timestamp,
          input_tokens, output_tokens, total_tokens,
          cache_creation_input_tokens, cache_read_input_tokens,
          request_count
        ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10)
      `

      const values = [
        data.accountId,
        data.domain,
        data.model,
        'inference', // Default request type
        data.inputTokens,
        data.outputTokens,
        data.totalTokens,
        data.cacheCreationInputTokens,
        data.cacheReadInputTokens,
        data.requestCount,
      ]

      await this.pool.query(query, values)
    } catch (error) {
      logger.error('Failed to record token usage', {
        metadata: {
          accountId: data.accountId,
          domain: data.domain,
          error: error instanceof Error ? error.message : String(error),
        },
      })
    }
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
          COALESCE(domain, $2::varchar) as domain,
          COALESCE(model, $3::varchar) as model,
          NOW() - INTERVAL '${windowHours} hours' as window_start,
          NOW() as window_end,
          COALESCE(SUM(input_tokens), 0) as total_input_tokens,
          COALESCE(SUM(output_tokens), 0) as total_output_tokens,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COALESCE(SUM(request_count), 0) as total_requests,
          COALESCE(SUM(cache_creation_input_tokens), 0) as cache_creation_input_tokens,
          COALESCE(SUM(cache_read_input_tokens), 0) as cache_read_input_tokens
        FROM token_usage
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

      query += ` GROUP BY domain, model`

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
          SUM(total_tokens) as total_tokens,
          SUM(request_count) as total_requests
        FROM token_usage
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
          SUM(total_tokens) as total_tokens,
          SUM(request_count) as total_requests
        FROM token_usage
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
   * Get rate limit configuration
   */
  async getRateLimitConfig(
    accountId?: string,
    domain?: string,
    model?: string
  ): Promise<RateLimitConfig[]> {
    try {
      let query = `
        SELECT * FROM rate_limit_configs
        WHERE enabled = true
      `

      const values: any[] = []
      let paramCount = 0

      if (accountId) {
        paramCount++
        query += ` AND (account_id = $${paramCount} OR account_id IS NULL)`
        values.push(accountId)
      }

      if (domain) {
        paramCount++
        query += ` AND (domain = $${paramCount} OR domain IS NULL)`
        values.push(domain)
      }

      if (model) {
        paramCount++
        query += ` AND (model = $${paramCount} OR model IS NULL)`
        values.push(model)
      }

      query += ` ORDER BY 
        CASE 
          WHEN account_id IS NOT NULL AND domain IS NOT NULL AND model IS NOT NULL THEN 1
          WHEN account_id IS NOT NULL AND domain IS NOT NULL THEN 2
          WHEN account_id IS NOT NULL AND model IS NOT NULL THEN 3
          WHEN domain IS NOT NULL AND model IS NOT NULL THEN 4
          WHEN account_id IS NOT NULL THEN 5
          WHEN domain IS NOT NULL THEN 6
          WHEN model IS NOT NULL THEN 7
          ELSE 8
        END
      `

      const result = await this.pool.query(query, values)

      return result.rows.map(row => ({
        id: row.id,
        accountId: row.account_id,
        domain: row.domain,
        model: row.model,
        windowMinutes: row.window_minutes,
        tokenLimit: row.token_limit,
        requestLimit: row.request_limit,
        fallbackModel: row.fallback_model,
        enabled: row.enabled,
      }))
    } catch (error) {
      logger.error('Failed to get rate limit config', {
        metadata: {
          accountId,
          domain,
          model,
          error: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  }

  /**
   * Update rate limit configuration
   */
  async updateRateLimitConfig(
    id: number,
    updates: Partial<RateLimitConfig>
  ): Promise<RateLimitConfig | null> {
    try {
      const fields: string[] = []
      const values: any[] = []
      let paramCount = 0

      if (updates.tokenLimit !== undefined) {
        paramCount++
        fields.push(`token_limit = $${paramCount}`)
        values.push(updates.tokenLimit)
      }

      if (updates.requestLimit !== undefined) {
        paramCount++
        fields.push(`request_limit = $${paramCount}`)
        values.push(updates.requestLimit)
      }

      if (updates.fallbackModel !== undefined) {
        paramCount++
        fields.push(`fallback_model = $${paramCount}`)
        values.push(updates.fallbackModel)
      }

      if (updates.enabled !== undefined) {
        paramCount++
        fields.push(`enabled = $${paramCount}`)
        values.push(updates.enabled)
      }

      if (fields.length === 0) {
        return null
      }

      paramCount++
      fields.push(`updated_at = NOW()`)

      paramCount++
      values.push(id)

      const query = `
        UPDATE rate_limit_configs
        SET ${fields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `

      const result = await this.pool.query(query, values)

      if (result.rows.length === 0) {
        return null
      }

      const row = result.rows[0]
      return {
        id: row.id,
        accountId: row.account_id,
        domain: row.domain,
        model: row.model,
        windowMinutes: row.window_minutes,
        tokenLimit: row.token_limit,
        requestLimit: row.request_limit,
        fallbackModel: row.fallback_model,
        enabled: row.enabled,
      }
    } catch (error) {
      logger.error('Failed to update rate limit config', {
        metadata: {
          id,
          updates,
          error: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  }

  /**
   * Record a rate limit event
   */
  async recordRateLimitEvent(event: {
    accountId: string
    domain: string
    model: string
    eventType: 'limit_exceeded' | 'model_switched'
    originalModel?: string
    switchedToModel?: string
    tokenCount?: number
    tokenLimit?: number
    windowMinutes?: number
  }): Promise<void> {
    try {
      const query = `
        INSERT INTO rate_limit_events (
          account_id, domain, model, event_type,
          original_model, switched_to_model,
          token_count, token_limit, window_minutes,
          timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `

      const values = [
        event.accountId,
        event.domain,
        event.model,
        event.eventType,
        event.originalModel,
        event.switchedToModel,
        event.tokenCount,
        event.tokenLimit,
        event.windowMinutes,
      ]

      await this.pool.query(query, values)
    } catch (error) {
      logger.error('Failed to record rate limit event', {
        metadata: {
          event,
          error: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }

  /**
   * Initialize and ensure partitions exist
   */
  async ensurePartitions(): Promise<void> {
    try {
      // Create partitions for the next 3 months
      await this.pool.query('SELECT create_monthly_partitions(3)')
      logger.info('Token usage partitions created/verified')
    } catch (error) {
      logger.error('Failed to ensure partitions', {
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }
}