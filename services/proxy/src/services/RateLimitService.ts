import { Pool } from 'pg'
import {
  parseRateLimitType,
  parseRateLimitEventType,
  type RateLimitType,
  type RateLimitEventType,
} from '@claude-nexus/shared'
import { logger } from '../middleware/logger'
import { enableSqlLogging } from '../utils/sql-logger'

export interface RateLimitEvent {
  accountId: string
  domain: string
  requestId: string
  errorMessage: string
  retryAfterSeconds: number | null
  timestamp: Date
  metadata?: Record<string, any>
}

/**
 * Service for tracking and managing rate limit events
 */
export class RateLimitService {
  private pool: Pool

  constructor(pool: Pool) {
    // Enable SQL logging if configured
    this.pool = enableSqlLogging(pool, {
      logQueries: process.env.DEBUG === 'true' || process.env.DEBUG_SQL === 'true',
      logSlowQueries: true,
      slowQueryThreshold: Number(process.env.SLOW_QUERY_THRESHOLD_MS) || 5000,
      logStackTrace: process.env.DEBUG === 'true',
    })
  }

  /**
   * Record a rate limit event for an account
   */
  async recordRateLimitEvent(event: RateLimitEvent): Promise<void> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      // Parse the limit type from error message
      const limitType = parseRateLimitType(event.errorMessage)
      const eventType = parseRateLimitEventType(event.errorMessage)

      // Calculate retry_until timestamp
      const retryUntil = event.retryAfterSeconds
        ? new Date(event.timestamp.getTime() + event.retryAfterSeconds * 1000)
        : null

      // Insert individual event into rate_limit_events table
      await client.query(
        `
        INSERT INTO rate_limit_events (
          request_id,
          account_id,
          domain,
          limit_type,
          triggered_at,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `,
        [
          event.requestId,
          event.accountId,
          event.domain,
          eventType,
          event.timestamp,
          JSON.stringify({
            ...event.metadata,
            retry_after_seconds: event.retryAfterSeconds,
            error_message: event.errorMessage,
            legacy_limit_type: limitType,
          }),
        ]
      )

      // Also update the summary table for backward compatibility (Phase 1)
      await client.query(
        `
        INSERT INTO account_rate_limit_summary (
          account_id,
          first_triggered_at,
          last_triggered_at,
          retry_until,
          total_hits,
          last_limit_type,
          last_error_message
        ) VALUES ($1, $2, $3, $4, 1, $5, $6)
        ON CONFLICT (account_id) DO UPDATE SET
          last_triggered_at = EXCLUDED.last_triggered_at,
          retry_until = EXCLUDED.retry_until,
          total_hits = account_rate_limit_summary.total_hits + 1,
          last_limit_type = EXCLUDED.last_limit_type,
          last_error_message = EXCLUDED.last_error_message,
          updated_at = NOW()
      `,
        [
          event.accountId,
          event.timestamp,
          event.timestamp,
          retryUntil,
          limitType,
          event.errorMessage,
        ]
      )

      await client.query('COMMIT')

      logger.info('Recorded rate limit event', {
        metadata: {
          requestId: event.requestId,
          accountId: event.accountId,
          domain: event.domain,
          eventType,
          limitType,
          retryAfterSeconds: event.retryAfterSeconds,
          retryUntil: retryUntil?.toISOString(),
        },
      })
    } catch (error) {
      await client.query('ROLLBACK')
      logger.error('Failed to record rate limit event', {
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          requestId: event.requestId,
          accountId: event.accountId,
          domain: event.domain,
        },
      })
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * Get rate limit summary for an account
   */
  async getRateLimitSummary(accountId: string): Promise<{
    firstTriggeredAt: Date | null
    lastTriggeredAt: Date | null
    retryUntil: Date | null
    totalHits: number
    lastLimitType: RateLimitType | null
    isCurrentlyRateLimited: boolean
  } | null> {
    const result = await this.pool.query(
      `
      SELECT 
        first_triggered_at,
        last_triggered_at,
        retry_until,
        total_hits,
        last_limit_type
      FROM account_rate_limit_summary
      WHERE account_id = $1
    `,
      [accountId]
    )

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    const now = new Date()

    return {
      firstTriggeredAt: row.first_triggered_at,
      lastTriggeredAt: row.last_triggered_at,
      retryUntil: row.retry_until,
      totalHits: row.total_hits,
      lastLimitType: row.last_limit_type,
      isCurrentlyRateLimited: row.retry_until && row.retry_until > now,
    }
  }

  /**
   * Get rate limit summaries for multiple accounts
   */
  async getRateLimitSummaries(accountIds: string[]): Promise<
    Map<
      string,
      {
        firstTriggeredAt: Date
        lastTriggeredAt: Date
        retryUntil: Date | null
        totalHits: number
        lastLimitType: RateLimitType | null
        isCurrentlyRateLimited: boolean
      }
    >
  > {
    if (accountIds.length === 0) {
      return new Map()
    }

    const result = await this.pool.query(
      `
      SELECT 
        account_id,
        first_triggered_at,
        last_triggered_at,
        retry_until,
        total_hits,
        last_limit_type
      FROM account_rate_limit_summary
      WHERE account_id = ANY($1)
    `,
      [accountIds]
    )

    const now = new Date()
    const summaries = new Map()

    for (const row of result.rows) {
      summaries.set(row.account_id, {
        firstTriggeredAt: row.first_triggered_at,
        lastTriggeredAt: row.last_triggered_at,
        retryUntil: row.retry_until,
        totalHits: row.total_hits,
        lastLimitType: row.last_limit_type,
        isCurrentlyRateLimited: row.retry_until && row.retry_until > now,
      })
    }

    return summaries
  }

  /**
   * Calculate tokens used in the 5 hours before a rate limit was triggered
   */
  async getTokensInWindowBeforeLimit(accountId: string, lastTriggeredAt: Date): Promise<number> {
    const windowStart = new Date(lastTriggeredAt.getTime() - 5 * 60 * 60 * 1000) // 5 hours before

    const result = await this.pool.query(
      `
      SELECT 
        COALESCE(SUM(total_tokens), 0) as tokens_used
      FROM api_requests
      WHERE 
        account_id = $1
        AND timestamp >= $2
        AND timestamp < $3
    `,
      [accountId, windowStart, lastTriggeredAt]
    )

    return Number(result.rows[0].tokens_used)
  }

  /**
   * Get accounts that are currently rate limited
   */
  async getCurrentlyRateLimitedAccounts(): Promise<string[]> {
    const result = await this.pool.query(`
      SELECT account_id
      FROM account_rate_limit_summary
      WHERE retry_until > NOW()
      ORDER BY retry_until DESC
    `)

    return result.rows.map(row => row.account_id)
  }

  /**
   * Get rate limit events for an account within a time range
   */
  async getRateLimitEvents(
    accountId: string,
    startTime: Date,
    endTime: Date
  ): Promise<Array<{ triggered_at: Date; limit_type: RateLimitEventType; metadata: any }>> {
    const result = await this.pool.query(
      `
      SELECT 
        triggered_at,
        limit_type,
        metadata
      FROM rate_limit_events
      WHERE 
        account_id = $1
        AND triggered_at >= $2
        AND triggered_at <= $3
      ORDER BY triggered_at DESC
    `,
      [accountId, startTime, endTime]
    )

    return result.rows
  }

  /**
   * Check if there were any rate limit events in a specific hour
   */
  async hasRateLimitInHour(accountId: string, hourStart: Date): Promise<boolean> {
    const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000) // 1 hour later

    const result = await this.pool.query(
      `
      SELECT EXISTS (
        SELECT 1
        FROM rate_limit_events
        WHERE 
          account_id = $1
          AND triggered_at >= $2
          AND triggered_at < $3
        LIMIT 1
      ) as has_rate_limit
    `,
      [accountId, hourStart, hourEnd]
    )

    return result.rows[0].has_rate_limit
  }

  /**
   * Clean up old rate limit records (optional maintenance)
   */
  async cleanupOldRecords(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

    const result = await this.pool.query(
      `
      DELETE FROM account_rate_limit_summary
      WHERE last_triggered_at < $1
        AND (retry_until IS NULL OR retry_until < NOW())
    `,
      [cutoffDate]
    )

    logger.info('Cleaned up old rate limit records', {
      metadata: {
        deletedCount: result.rowCount,
        cutoffDate: cutoffDate.toISOString(),
      },
    })

    return result.rowCount || 0
  }
}
