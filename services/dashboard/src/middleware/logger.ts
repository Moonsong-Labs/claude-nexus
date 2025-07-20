import { Context, Next } from 'hono'
import { getErrorMessage, getErrorStack, getErrorCode } from '@claude-nexus/shared'
import { IS_PRODUCTION } from '../constants/auth.js'

/**
 * Log levels for the application logger
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Structured log entry with all possible fields
 */
interface LogEntry {
  timestamp: string
  level: LogLevel
  requestId: string
  message: string
  domain?: string
  method?: string
  path?: string
  statusCode?: number
  duration?: number
  error?: unknown
  metadata?: Record<string, unknown>
  stack?: string
  proxyUrl?: string
  params?: Record<string, unknown>
}

/**
 * Logger configuration options
 */
interface LoggerConfig {
  level: LogLevel
  prettyPrint: boolean
  maskSensitiveData: boolean
}

/**
 * Logger class for structured logging with sensitive data masking
 */
class Logger {
  private config: LoggerConfig

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO,
      prettyPrint: !IS_PRODUCTION,
      maskSensitiveData: true,
      ...config,
    }
  }

  /**
   * Check if a message at the given level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]
    const currentLevelIndex = levels.indexOf(this.config.level)
    const messageLevelIndex = levels.indexOf(level)
    return messageLevelIndex >= currentLevelIndex
  }

  /**
   * Mask sensitive data in log entries
   */
  private maskSensitive(obj: unknown): unknown {
    if (!this.config.maskSensitiveData) {
      return obj
    }

    const sensitiveKeys = [
      'api_key',
      'apiKey',
      'x-api-key',
      'authorization',
      'password',
      'secret',
      'token',
      'refreshToken',
      'accessToken',
    ]

    if (typeof obj === 'string') {
      // Mask API keys
      if (obj.startsWith('sk-ant-')) {
        return obj.substring(0, 10) + '****'
      }
      if (obj.startsWith('Bearer ')) {
        return 'Bearer ****'
      }
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.maskSensitive(item))
    }

    if (obj && typeof obj === 'object') {
      const masked: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
          masked[key] = '****'
        } else {
          masked[key] = this.maskSensitive(value)
        }
      }
      return masked
    }

    return obj
  }

  /**
   * Format log entry for output
   */
  private formatLog(entry: LogEntry): string {
    const masked = this.maskSensitive(entry) as LogEntry

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
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.config.level
  }

  /**
   * Log a message at the specified level
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
 * Global logger instance for the dashboard service
 */
export const logger = new Logger()

/**
 * Express/Hono middleware for request/response logging
 * Automatically logs incoming requests and their responses with timing information
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
        headers: logger.getLevel() === LogLevel.DEBUG ? c.req.header() : undefined,
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
 * Get a logger instance with request-specific context
 * Automatically includes requestId and domain in all log entries
 *
 * @param c - Hono context object
 * @returns Logger methods with request context
 */
export function getRequestLogger(c: Context): {
  debug: (message: string, metadata?: Record<string, unknown>) => void
  info: (message: string, metadata?: Record<string, unknown>) => void
  warn: (message: string, metadata?: Record<string, unknown>) => void
  error: (message: string, error?: Error, metadata?: Record<string, unknown>) => void
} {
  const requestId = c.get('requestId') || 'unknown'
  const domain = c.req.header('host') || 'unknown'

  return {
    debug: (message: string, metadata?: Record<string, unknown>) => {
      logger.debug(message, { requestId, domain, metadata })
    },
    info: (message: string, metadata?: Record<string, unknown>) => {
      logger.info(message, { requestId, domain, metadata })
    },
    warn: (message: string, metadata?: Record<string, unknown>) => {
      logger.warn(message, { requestId, domain, metadata })
    },
    error: (
      message: string,
      errorOrMetadata?: Error | Record<string, unknown>,
      metadata?: Record<string, unknown>
    ) => {
      const isError = errorOrMetadata instanceof Error
      const actualError = isError ? errorOrMetadata : undefined
      const actualMetadata = isError ? metadata : errorOrMetadata

      logger.error(message, {
        requestId,
        domain,
        error: actualError
          ? {
              message: actualError.message,
              stack: actualError.stack,
              code: getErrorCode(actualError),
            }
          : undefined,
        metadata: actualMetadata,
      })
    },
  }
}
