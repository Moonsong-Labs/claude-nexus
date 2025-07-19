/**
 * Shared logger configuration and factory
 * Provides consistent logging across all services
 *
 * TODO(#logger-consolidation): Consolidate the proxy and dashboard loggers into this shared module.
 * The current implementation is minimal. A unified logger should be feature-rich,
 * configurable, and provide a consistent log format across all services.
 * See: https://github.com/yourusername/claude-nexus-proxy/issues (create issue for tracking)
 *
 * Current duplicate implementations:
 * - services/proxy/src/middleware/logger.ts
 * - services/dashboard/src/middleware/logger.ts
 */

export interface LoggerOptions {
  level?: string
  service: string
  prettyPrint?: boolean
  /** Optional list of additional sensitive keys to mask (defaults include common patterns) */
  sensitiveKeys?: string[]
}

/**
 * Context that can be passed with each log entry
 * Includes common fields used across the application
 */
export interface LogContext {
  requestId?: string
  domain?: string
  metadata?: Record<string, any>
  error?: {
    message: string
    stack?: string
    code?: string
  }
  // Additional fields commonly used in the codebase
  method?: string
  path?: string
  statusCode?: number
  duration?: number
  ip?: string
  userAgent?: string
}

/**
 * Create a logger instance for a service
 * This factory pattern allows each service to have its own logger
 * while maintaining consistent configuration
 *
 * @param options - Logger configuration options
 * @returns Logger instance with debug, info, warn, and error methods
 */
export function createLogger(options: LoggerOptions) {
  const level = options.level || process.env.LOG_LEVEL || 'info'
  const prettyPrint = options.prettyPrint ?? process.env.NODE_ENV !== 'production'
  const sensitiveKeys = options.sensitiveKeys || []

  return {
    debug: (message: string, context?: LogContext) => {
      if (!shouldLog('debug', level)) {
        return
      }
      log('debug', options.service, message, context, prettyPrint, sensitiveKeys)
    },
    info: (message: string, context?: LogContext) => {
      if (!shouldLog('info', level)) {
        return
      }
      log('info', options.service, message, context, prettyPrint, sensitiveKeys)
    },
    warn: (message: string, context?: LogContext) => {
      if (!shouldLog('warn', level)) {
        return
      }
      log('warn', options.service, message, context, prettyPrint, sensitiveKeys)
    },
    error: (message: string, context?: LogContext) => {
      if (!shouldLog('error', level)) {
        return
      }
      log('error', options.service, message, context, prettyPrint, sensitiveKeys)
    },
  }
}

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
type LogLevel = (typeof LOG_LEVELS)[number]

/**
 * Logger instance returned by createLogger
 */
export type Logger = ReturnType<typeof createLogger>

// Default sensitive keys that are always masked
const DEFAULT_SENSITIVE_KEYS = [
  'api_key',
  'apiKey',
  'x-api-key',
  'authorization',
  'password',
  'secret',
  'token',
  'refreshToken',
  'accessToken',
  'client_api_key',
  'clientApiKey',
]

// Token fields that should NOT be masked (they contain counts, not sensitive data)
const TOKEN_COUNT_FIELDS = [
  'input_tokens',
  'output_tokens',
  'inputTokens',
  'outputTokens',
  'total_tokens',
  'totalTokens',
]

function shouldLog(messageLevel: LogLevel, configuredLevel: string): boolean {
  const messageLevelIndex = LOG_LEVELS.indexOf(messageLevel)
  const configuredLevelIndex = LOG_LEVELS.indexOf(configuredLevel as LogLevel)
  return messageLevelIndex >= configuredLevelIndex
}

/**
 * Masks sensitive data in objects before logging
 * Recursively traverses objects and arrays
 */
function maskSensitiveData(obj: any, additionalSensitiveKeys: string[] = []): any {
  const allSensitiveKeys = [...DEFAULT_SENSITIVE_KEYS, ...additionalSensitiveKeys]

  if (typeof obj === 'string') {
    // Mask API keys and bearer tokens
    if (obj.startsWith('sk-ant-')) {
      return obj.substring(0, 10) + '****'
    }
    if (obj.startsWith('cnp_')) {
      return obj.substring(0, 8) + '****'
    }
    if (obj.startsWith('Bearer ')) {
      return 'Bearer ****'
    }
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(item => maskSensitiveData(item, additionalSensitiveKeys))
  }

  if (obj && typeof obj === 'object') {
    const masked: any = {}
    for (const [key, value] of Object.entries(obj)) {
      // Skip masking for token count fields
      if (TOKEN_COUNT_FIELDS.includes(key)) {
        masked[key] = value
      } else if (allSensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
        masked[key] = '****'
      } else {
        masked[key] = maskSensitiveData(value, additionalSensitiveKeys)
      }
    }
    return masked
  }

  return obj
}

function log(
  level: LogLevel,
  service: string,
  message: string,
  context?: LogContext,
  prettyPrint?: boolean,
  additionalSensitiveKeys?: string[]
) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service,
    message,
    ...context,
  }

  // Mask sensitive data before logging
  const maskedEntry = maskSensitiveData(entry, additionalSensitiveKeys)

  const output = prettyPrint ? formatPretty(maskedEntry) : JSON.stringify(maskedEntry)

  switch (level) {
    case 'debug':
    case 'info':
      console.log(output)
      break
    case 'warn':
      console.warn(output)
      break
    case 'error':
      console.error(output)
      break
  }
}

function formatPretty(entry: any): string {
  const { timestamp, level, service, message, ...rest } = entry
  const prefix = `[${timestamp}] ${level.toUpperCase()} [${service}] ${message}`

  if (Object.keys(rest).length > 0) {
    return `${prefix}\n${JSON.stringify(rest, null, 2)}`
  }
  return prefix
}
