import { Context, Next } from 'hono'
import { getErrorMessage, getErrorStack, getErrorCode } from '@claude-nexus/shared'

/**
 * Available log levels for the logger
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Core structured log entry interface
 * Contains essential fields for all log entries
 */
export interface LogEntry {
  timestamp: string
  level: LogLevel
  requestId: string
  message: string
  domain?: string
  method?: string
  path?: string
  statusCode?: number
  duration?: number
  error?: any
  /**
   * Additional context-specific data
   * Use this for application-specific fields instead of extending LogEntry
   */
  metadata?: Record<string, any>
}

// Constants for sensitive data masking
const SENSITIVE_KEY_PATTERNS = [
  'api_key',
  'apiKey',
  'x-api-key',
  'authorization',
  'password',
  'secret',
  'refreshToken',
  'accessToken',
] as const

const API_KEY_PREFIX = 'sk-ant-'
const BEARER_PREFIX = 'Bearer '
const MASKED_SUFFIX = '****'

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Minimum log level to output */
  level: LogLevel
  /** Whether to format logs for human readability */
  prettyPrint: boolean
  /** Whether to mask sensitive data in logs */
  maskSensitiveData: boolean
  /** Additional keys to treat as sensitive (merged with defaults) */
  additionalSensitiveKeys?: string[]
}

/**
 * Logger class for structured logging with sensitive data masking
 * 
 * @example
 * ```ts
 * const logger = new Logger({ level: LogLevel.DEBUG })
 * logger.info('Request received', { domain: 'api.example.com', method: 'POST' })
 * ```
 */
class Logger {
  private config: LoggerConfig
  private sensitiveKeys: string[]

  constructor(config: Partial<LoggerConfig> = {}) {
    // Enable debug logging if DEBUG or DEBUG_SQL is set
    const defaultLevel =
      process.env.DEBUG === 'true' || process.env.DEBUG_SQL === 'true'
        ? LogLevel.DEBUG
        : (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO

    const isProduction = process.env.NODE_ENV === 'production'

    this.config = {
      level: defaultLevel,
      prettyPrint: !isProduction,
      maskSensitiveData: true,
      ...config,
    }

    // Combine default sensitive keys with additional ones
    this.sensitiveKeys = [
      ...SENSITIVE_KEY_PATTERNS,
      ...(config.additionalSensitiveKeys || [])
    ]
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]
    const currentLevelIndex = levels.indexOf(this.config.level)
    const messageLevelIndex = levels.indexOf(level)
    return messageLevelIndex >= currentLevelIndex
  }

  /**
   * Masks sensitive data in log entries
   * @param obj - Object to mask sensitive data from
   * @returns Object with sensitive data masked
   */
  private maskSensitive(obj: any): any {
    if (!this.config.maskSensitiveData) {
      return obj
    }

    if (typeof obj === 'string') {
      return this.maskSensitiveString(obj)
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.maskSensitive(item))
    }

    if (obj && typeof obj === 'object') {
      return this.maskSensitiveObject(obj)
    }

    return obj
  }

  /**
   * Masks sensitive patterns in strings
   */
  private maskSensitiveString(str: string): string {
    if (str.startsWith(API_KEY_PREFIX)) {
      return str.substring(0, 10) + MASKED_SUFFIX
    }
    if (str.startsWith(BEARER_PREFIX)) {
      return BEARER_PREFIX + MASKED_SUFFIX
    }
    return str
  }

  /**
   * Masks sensitive fields in objects
   */
  private maskSensitiveObject(obj: Record<string, any>): Record<string, any> {
    const masked: Record<string, any> = {}
    const tokenFields = new Set([
      'input_tokens', 'output_tokens', 'inputTokens', 
      'outputTokens', 'total_tokens', 'totalTokens'
    ])

    for (const [key, value] of Object.entries(obj)) {
      // Don't mask token count fields
      if (tokenFields.has(key)) {
        masked[key] = value
      } else if (this.isSensitiveKey(key)) {
        masked[key] = MASKED_SUFFIX
      } else {
        masked[key] = this.maskSensitive(value)
      }
    }
    return masked
  }

  /**
   * Checks if a key should be treated as sensitive
   */
  private isSensitiveKey(key: string): boolean {
    const lowerKey = key.toLowerCase()
    return this.sensitiveKeys.some(sk => lowerKey.includes(sk.toLowerCase()))
  }

  private formatLog(entry: LogEntry): string {
    const masked = this.maskSensitive(entry)

    if (this.config.prettyPrint) {
      const { timestamp, level, requestId, message, ...rest } = masked
      const prefix = `[${timestamp}] ${level.toUpperCase()} [${requestId}] ${message}`

      if (Object.keys(rest).length > 0) {
        return `${prefix}\n${JSON.stringify(rest, null, 2)}`
      }
      return prefix
    }

    return JSON.stringify(masked)
  }

  /**
   * Logs a message with the specified level and context
   * @param level - Log level
   * @param message - Log message
   * @param context - Additional context to include in the log entry
   */
  log(level: LogLevel, message: string, context: Partial<LogEntry> = {}) {
    if (!this.shouldLog(level)) {
      return
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      requestId: context.requestId || 'system',
      message,
      ...context,
    }

    const formatted = this.formatLog(entry)
    this.writeLog(level, formatted)
  }

  /**
   * Writes the formatted log to the appropriate output
   */
  private writeLog(level: LogLevel, formatted: string): void {
    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(formatted)
        break
      case LogLevel.WARN:
        console.warn(formatted)
        break
      case LogLevel.ERROR:
        console.error(formatted)
        break
    }
  }

  debug(message: string, context?: Partial<LogEntry>) {
    this.log(LogLevel.DEBUG, message, context)
  }

  info(message: string, context?: Partial<LogEntry>) {
    this.log(LogLevel.INFO, message, context)
  }

  warn(message: string, context?: Partial<LogEntry>) {
    this.log(LogLevel.WARN, message, context)
  }

  error(message: string, context?: Partial<LogEntry>) {
    this.log(LogLevel.ERROR, message, context)
  }
}

/**
 * Global logger instance
 * @example
 * ```ts
 * import { logger } from './middleware/logger'
 * logger.info('Server started', { port: 3000 })
 * ```
 */
export const logger = new Logger()

/**
 * Hono middleware for request/response logging
 * Automatically logs incoming requests and their responses with timing information
 * 
 * @example
 * ```ts
 * app.use(loggingMiddleware())
 * ```
 */
export function loggingMiddleware() {
  return async (c: Context, next: Next) => {
    // Get request ID from context (set by request-id middleware)
    const requestId = c.get('requestId') || 'system'
    const startTime = Date.now()

    // Extract request info
    const domain = c.req.header('host') || 'unknown'
    const method = c.req.method
    const path = c.req.path
    const userAgent = c.req.header('user-agent')

    // Log incoming request
    logger.info('Incoming request', {
      requestId,
      domain,
      method,
      path,
      metadata: {
        userAgent,
        ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
        headers: logger['config'].level === LogLevel.DEBUG ? c.req.header() : undefined,
      },
    })

    try {
      await next()

      // Log successful response
      const duration = Date.now() - startTime
      logger.info('Request completed', {
        requestId,
        domain,
        method,
        path,
        statusCode: c.res.status,
        duration,
        metadata: {
          contentLength: c.res.headers.get('content-length'),
        },
      })
    } catch (error) {
      // Log error
      const duration = Date.now() - startTime
      logger.error('Request failed', {
        requestId,
        domain,
        method,
        path,
        statusCode: c.res.status || 500,
        duration,
        error: {
          message: getErrorMessage(error),
          stack: getErrorStack(error),
          code: getErrorCode(error),
        },
      })

      throw error
    }
  }
}

/**
 * Creates a logger instance with request context automatically included
 * @param c - Hono context object
 * @returns Logger functions with request context
 * 
 * @example
 * ```ts
 * const log = getRequestLogger(c)
 * log.info('Processing payment', { amount: 100 })
 * ```
 */
export function getRequestLogger(c: Context): {
  debug: (message: string, metadata?: Record<string, any>) => void
  info: (message: string, metadata?: Record<string, any>) => void
  warn: (message: string, metadata?: Record<string, any>) => void
  error: (message: string, error?: Error, metadata?: Record<string, any>) => void
} {
  const requestId = c.get('requestId') || 'unknown'
  const domain = c.req.header('host') || 'unknown'

  return {
    debug: (message: string, metadata?: Record<string, any>) => {
      logger.debug(message, { requestId, domain, metadata })
    },
    info: (message: string, metadata?: Record<string, any>) => {
      logger.info(message, { requestId, domain, metadata })
    },
    warn: (message: string, metadata?: Record<string, any>) => {
      logger.warn(message, { requestId, domain, metadata })
    },
    error: (message: string, error?: Error, metadata?: Record<string, any>) => {
      logger.error(message, {
        requestId,
        domain,
        error: error
          ? {
              message: error.message,
              stack: error.stack,
              code: (error as any).code,
            }
          : undefined,
        metadata,
      })
    },
  }
}
