import { Pool } from 'pg'
import { enableSqlLogging } from '../../../services/proxy/src/utils/sql-logger.js'

/**
 * Create a database pool with optional SQL logging for scripts
 * @param connectionString Database connection string
 * @param options Pool options
 * @returns Pool with logging enabled if DEBUG_SQL is set
 */
export function createLoggingPool(connectionString: string, options?: any): Pool {
  const pool = new Pool({
    connectionString,
    ...options,
  })

  // Enable SQL logging if DEBUG_SQL is set
  if (process.env.DEBUG_SQL === 'true') {
    return enableSqlLogging(pool, {
      logQueries: true,
      logSlowQueries: true,
      slowQueryThreshold: Number(process.env.SLOW_QUERY_THRESHOLD_MS) || 5000,
      logStackTrace: process.env.DEBUG === 'true',
    })
  }

  return pool
}
