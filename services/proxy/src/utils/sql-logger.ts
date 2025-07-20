import { Pool, QueryResult, QueryResultRow, QueryConfig } from 'pg'
import { logger } from '../middleware/logger.js'

/**
 * Options for SQL query logging
 */
export interface SqlLoggerOptions {
  /** Enable query logging (requires DEBUG or DEBUG_SQL env var) */
  logQueries?: boolean
  /** Enable slow query logging */
  logSlowQueries?: boolean
  /** Threshold in milliseconds for slow queries */
  slowQueryThreshold?: number
  /** Include stack trace in logs */
  logStackTrace?: boolean
  /** Custom value redaction function */
  redactValue?: (value: unknown) => unknown
  /** Advanced redaction options */
  redaction?: RedactionOptions
}

/**
 * Advanced redaction options
 */
export interface RedactionOptions {
  /** Custom patterns to redact (string literals or regex) */
  patterns?: (string | RegExp)[]
  /** Redact email addresses */
  redactEmail?: boolean
  /** Redact IP addresses */
  redactIP?: boolean
}

// Common redaction patterns
const REDACTION_PATTERNS = {
  apiKeys: [/^sk-ant-/, /^Bearer /, /^cnp_live_/],
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  ipv6: /(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}/g,
  dbUrl: /(?:postgres(?:ql)?|mysql|mongodb):\/\/[^@]+@[^/]+(?:\/[^?]+)?/gi,
}

/**
 * Default value redaction function to prevent logging sensitive data
 */
function defaultRedactValue(value: unknown, options?: RedactionOptions): unknown {
  if (value instanceof Buffer) {
    return '<Buffer>'
  }

  if (typeof value === 'string') {
    // Check common API key patterns
    for (const pattern of REDACTION_PATTERNS.apiKeys) {
      if (pattern.test(value)) {
        return '<REDACTED>'
      }
    }

    // Database URLs
    if (REDACTION_PATTERNS.dbUrl.test(value)) {
      return '<DATABASE_URL>'
    }

    // Custom patterns
    if (options?.patterns) {
      for (const pattern of options.patterns) {
        const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern
        if (regex.test(value)) {
          return '<REDACTED>'
        }
      }
    }

    // Optional email redaction
    if (options?.redactEmail && REDACTION_PATTERNS.email.test(value)) {
      return '<EMAIL>'
    }

    // Optional IP redaction
    if (options?.redactIP) {
      if (REDACTION_PATTERNS.ipv4.test(value) || REDACTION_PATTERNS.ipv6.test(value)) {
        return '<IP_ADDRESS>'
      }
    }

    // Redact very long strings
    if (value.length > 200) {
      return `<String[${value.length}]>`
    }
  }

  return value
}

/**
 * Extracts query information from various pg query argument formats
 */
function extractQueryInfo(args: unknown[]): {
  queryText: string
  values: unknown[]
  hasCallback: boolean
} {
  let queryText: string = 'Unknown query format'
  let values: unknown[] = []
  let hasCallback = false

  if (typeof args[0] === 'string') {
    queryText = args[0]
    if (Array.isArray(args[1])) {
      values = args[1]
      hasCallback = typeof args[2] === 'function'
    } else if (typeof args[1] === 'function') {
      hasCallback = true
    } else if (args[1] !== undefined) {
      values = args[1]
    }
  } else if (args[0] && typeof args[0] === 'object' && 'text' in args[0]) {
    const config = args[0] as QueryConfig
    queryText = config.text
    values = config.values || []
    hasCallback = typeof args[1] === 'function'
  }

  return { queryText, values, hasCallback }
}

/**
 * Prepares values for logging by applying redaction
 */
function getLoggableValues(
  values: readonly unknown[] | undefined,
  redactValue: (value: unknown) => unknown
): unknown[] | undefined {
  if (!values || values.length === 0) {
    return undefined
  }

  return values.map(v => {
    // Convert dates to ISO strings for consistent logging
    const normalizedValue = v instanceof Date ? v.toISOString() : v
    return redactValue(normalizedValue)
  })
}

/**
 * Logs query start if enabled
 */
function logQueryStart(
  queryText: string,
  values: unknown[],
  options: {
    debugEnabled: boolean
    logQueries: boolean
    logStackTrace: boolean
    redactValue: (value: unknown) => unknown
  }
) {
  if (!options.logQueries || !options.debugEnabled) {
    return
  }

  const loggableValues = getLoggableValues(values, options.redactValue)
  const caller = options.logStackTrace ? new Error().stack?.split('\n')[3]?.trim() : undefined

  logger.debug('SQL Query', {
    metadata: {
      query: queryText,
      values: loggableValues,
      caller,
    },
  })
}

/**
 * Logs query completion if enabled
 */
function logQueryComplete(
  queryText: string,
  duration: number,
  rowCount: number | null,
  options: {
    debugEnabled: boolean
    logQueries: boolean
  }
) {
  if (!options.logQueries || !options.debugEnabled) {
    return
  }

  logger.debug('SQL Query completed', {
    metadata: {
      query: queryText.substring(0, 100),
      duration,
      rowCount,
    },
  })
}

/**
 * Logs slow queries
 */
function logSlowQuery(
  queryText: string,
  values: unknown[],
  duration: number,
  options: {
    logSlowQueries: boolean
    slowQueryThreshold: number
    logStackTrace: boolean
    redactValue: (value: unknown) => unknown
  }
) {
  if (!options.logSlowQueries || duration <= options.slowQueryThreshold) {
    return
  }

  const loggableValues = getLoggableValues(values, options.redactValue)
  const caller = options.logStackTrace ? new Error().stack?.split('\n')[3]?.trim() : undefined

  logger.warn('Slow SQL query detected', {
    metadata: {
      query: queryText,
      duration,
      values: loggableValues,
      caller,
    },
  })
}

/**
 * Logs query errors
 */
function logQueryError(
  queryText: string,
  values: unknown[],
  duration: number,
  error: Error,
  redactValue: (value: unknown) => unknown
) {
  const loggableValues = getLoggableValues(values, redactValue)

  logger.error('SQL Query failed', {
    metadata: {
      query: queryText,
      duration,
      error: error.message,
      values: loggableValues,
    },
  })
}

/**
 * Wraps a pg Pool to add SQL query logging
 * @param pool The pool to wrap
 * @param options Logging options
 * @returns The wrapped pool with logging enabled
 */
export function enableSqlLogging(pool: Pool, options: SqlLoggerOptions = {}): Pool {
  const {
    logQueries = true,
    logSlowQueries = true,
    slowQueryThreshold = 5000,
    logStackTrace = false,
    redaction,
  } = options

  // Create redaction function with options
  const redactValue =
    options.redactValue || ((value: unknown) => defaultRedactValue(value, redaction))

  // Check if DEBUG or DEBUG_SQL is enabled
  const debugEnabled = process.env.DEBUG === 'true' || process.env.DEBUG_SQL === 'true'

  if (!debugEnabled && !logQueries) {
    return pool
  }

  // Create a proxy that intercepts the query method
  const handler: ProxyHandler<Pool> = {
    get(target, prop, receiver) {
      if (prop === 'query') {
        // Return a wrapped query function that preserves all overloads
        return function query<R extends QueryResultRow = QueryResultRow>(
          ...args: unknown[]
        ): unknown {
          const start = Date.now()
          const { queryText, values } = extractQueryInfo(args)

          // Log query start
          logQueryStart(queryText, values, {
            debugEnabled,
            logQueries,
            logStackTrace,
            redactValue,
          })

          // Call the original query method
          const result = target.query(...args) as Promise<QueryResult<R>> | void | undefined

          // Handle promise-based queries
          if (
            result &&
            typeof result === 'object' &&
            'then' in result &&
            typeof result.then === 'function'
          ) {
            return (result as Promise<QueryResult<R>>)
              .then((res: QueryResult<R>) => {
                const duration = Date.now() - start

                // Log completion
                logQueryComplete(queryText, duration, res.rowCount, {
                  debugEnabled,
                  logQueries,
                })

                // Log slow queries
                logSlowQuery(queryText, values, duration, {
                  logSlowQueries,
                  slowQueryThreshold,
                  logStackTrace,
                  redactValue,
                })

                return res
              })
              .catch((err: Error) => {
                const duration = Date.now() - start
                logQueryError(queryText, values, duration, err, redactValue)
                throw err
              })
          }

          // For callback-based queries, the result is undefined
          return result
        }
      }

      // For all other properties, delegate to the original pool
      return Reflect.get(target, prop, receiver)
    },
  }

  logger.info('SQL query logging enabled', {
    metadata: {
      logQueries: logQueries && debugEnabled,
      logSlowQueries,
      slowQueryThreshold,
      redactionOptions: redaction,
    },
  })

  return new Proxy(pool, handler)
}
