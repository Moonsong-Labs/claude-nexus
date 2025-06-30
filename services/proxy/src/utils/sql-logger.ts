import { Pool } from 'pg'
import { logger } from '../middleware/logger.js'

/**
 * Wraps a pg Pool to add SQL query logging
 * @param pool The pool to wrap
 * @param options Logging options
 * @returns The wrapped pool with logging enabled
 */
export function enableSqlLogging(
  pool: Pool,
  options: {
    logQueries?: boolean
    logSlowQueries?: boolean
    slowQueryThreshold?: number
    logStackTrace?: boolean
  } = {}
): Pool {
  const {
    logQueries = true,
    logSlowQueries = true,
    slowQueryThreshold = 5000,
    logStackTrace = false,
  } = options

  // Check if DEBUG or DEBUG_SQL is enabled
  const debugEnabled = process.env.DEBUG === 'true' || process.env.DEBUG_SQL === 'true'

  if (!debugEnabled && !logQueries) {
    return pool
  }

  // Store original query method
  const originalQuery = pool.query.bind(pool)

  // Override query method with proper typing
  const wrappedPool = Object.create(pool)
  wrappedPool.query = function (...args: any[]) {
    const start = Date.now()
    const stack = logStackTrace ? new Error().stack : undefined

    // Extract query text and values
    let queryText: string
    let values: any[] = []

    if (typeof args[0] === 'string') {
      queryText = args[0]
      values = args[1] || []
    } else if (args[0] && typeof args[0] === 'object' && 'text' in args[0]) {
      queryText = args[0].text
      values = args[0].values || []
    } else {
      queryText = 'Unknown query format'
    }

    // Log query start if enabled
    if (logQueries && debugEnabled) {
      // Convert Date objects to ISO strings for logging
      const loggableValues =
        values.length > 0 ? values.map(v => (v instanceof Date ? v.toISOString() : v)) : undefined

      logger.debug('SQL Query', {
        metadata: {
          query: queryText,
          values: loggableValues,
          caller: stack?.split('\n')[3]?.trim(),
        },
      })
    }

    // Execute query and log duration
    const result = originalQuery.apply(pool, args)

    // Handle both promise and callback patterns
    if (result && typeof result.then === 'function') {
      return result
        .then((res: any) => {
          const duration = Date.now() - start

          if (logQueries && debugEnabled) {
            logger.debug('SQL Query completed', {
              metadata: {
                query: queryText.substring(0, 100),
                duration,
                rowCount: res.rowCount,
              },
            })
          }

          // Log slow queries
          if (logSlowQueries && duration > slowQueryThreshold) {
            const loggableValues =
              values.length > 0
                ? values.map(v => (v instanceof Date ? v.toISOString() : v))
                : undefined

            logger.warn('Slow SQL query detected', {
              metadata: {
                query: queryText,
                duration,
                values: loggableValues,
                caller: stack?.split('\n')[3]?.trim(),
              },
            })
          }

          return res
        })
        .catch((err: any) => {
          const duration = Date.now() - start
          const loggableValues =
            values.length > 0
              ? values.map(v => (v instanceof Date ? v.toISOString() : v))
              : undefined

          logger.error('SQL Query failed', {
            metadata: {
              query: queryText,
              duration,
              error: err.message,
              values: loggableValues,
            },
          })
          throw err
        })
    }

    return result
  }

  // Copy all other properties and methods
  for (const key in pool) {
    if (key !== 'query' && !(key in wrappedPool)) {
      ;(wrappedPool as any)[key] = (pool as any)[key]
    }
  }

  logger.info('SQL query logging enabled', {
    metadata: {
      logQueries: logQueries && debugEnabled,
      logSlowQueries,
      slowQueryThreshold,
    },
  })

  return wrappedPool as Pool
}
