import { logger } from '../middleware/logger'
import { TimeoutError, UpstreamError, RateLimitError } from '@claude-nexus/shared'

/**
 * Generic retry utility with exponential backoff.
 *
 * For application-specific retry logic (e.g., Claude API specific errors),
 * compose your own retry condition:
 *
 * ```typescript
 * function isMyAppRetryableError(error: unknown): boolean {
 *   return isRetryableError(error) ||
 *     (error instanceof Error && error.message.includes('my_specific_error'))
 * }
 *
 * await retryWithBackoff(myApiCall, { retryCondition: isMyAppRetryableError })
 * ```
 */

// Error type with HTTP details
export interface HttpError extends Error {
  statusCode?: number
  response?: {
    headers?: Record<string, string | string[] | undefined>
  }
}

// Type guard for HTTP errors
export function isHttpError(error: unknown): error is HttpError {
  return (
    error instanceof Error &&
    (('statusCode' in error && typeof error.statusCode === 'number') ||
      ('response' in error && typeof error.response === 'object' && error.response !== null))
  )
}

// Retry configuration
export interface RetryConfig {
  maxAttempts: number
  initialDelay: number
  maxDelay: number
  factor: number
  jitter: boolean
  timeout?: number
  retryCondition?: (error: unknown) => boolean
}

// Default retry configuration
export const defaultRetryConfig: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  factor: 2, // Exponential backoff factor
  jitter: true, // Add randomness to prevent thundering herd
  timeout: 60000, // 60 seconds total timeout
  retryCondition: isRetryableError,
}

// Retryable error constants
const RETRYABLE_NETWORK_ERRORS = [
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ENETUNREACH',
  'ECONNRESET',
  'EPIPE',
]

const RETRYABLE_STATUS_CODES = [429, 502, 503, 504]

// Check if error is a network error
export function isNetworkError(error: Error): boolean {
  return RETRYABLE_NETWORK_ERRORS.some(errCode => error.message.includes(errCode))
}

// Check if error has retryable HTTP status
export function isRetryableHttpError(error: unknown): boolean {
  if (isHttpError(error) && error.statusCode) {
    return RETRYABLE_STATUS_CODES.includes(error.statusCode)
  }
  return false
}

// Check if error is retryable (generic implementation)
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  return (
    error instanceof TimeoutError ||
    error instanceof UpstreamError ||
    error instanceof RateLimitError ||
    isNetworkError(error) ||
    isRetryableHttpError(error)
  )
}

// Calculate delay with exponential backoff
export function calculateDelay(attempt: number, config: RetryConfig): number {
  // Calculate base delay with exponential backoff
  let delay = Math.min(config.initialDelay * Math.pow(config.factor, attempt - 1), config.maxDelay)

  // Add jitter to prevent thundering herd
  if (config.jitter) {
    // Random jitter between 0% and 50% of the delay
    const jitter = delay * Math.random() * 0.5
    delay = delay + jitter
  }

  return Math.floor(delay)
}

// Sleep helper
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Retry with exponential backoff
// Helper to extract retry-after header
export function getRetryAfter(error: unknown): number | null {
  if (isHttpError(error) && error.response?.headers) {
    const retryAfter = error.response.headers['retry-after']
    if (typeof retryAfter === 'string') {
      // Parse as seconds
      const seconds = parseInt(retryAfter, 10)
      if (!isNaN(seconds)) {
        return seconds * 1000 // Convert to milliseconds
      }

      // Parse as HTTP date
      const date = new Date(retryAfter)
      if (!isNaN(date.getTime())) {
        return Math.max(0, date.getTime() - Date.now())
      }
    }
  }

  return null
}

// Retry with exponential backoff
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  context?: { requestId?: string; operation?: string }
): Promise<T> {
  const finalConfig = { ...defaultRetryConfig, ...config }
  const startTime = Date.now()
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      // Check total timeout
      if (finalConfig.timeout && Date.now() - startTime > finalConfig.timeout) {
        throw new TimeoutError('Retry timeout exceeded', {
          attempts: attempt - 1,
          elapsed: Date.now() - startTime,
        })
      }

      // Execute function
      const result = await fn()

      // Success - log if this was a retry
      if (attempt > 1) {
        logger.info('Retry succeeded', {
          requestId: context?.requestId,
          metadata: {
            operation: context?.operation,
            attempt,
            totalTime: Date.now() - startTime,
          },
        })
      }

      return result
    } catch (error) {
      lastError = error as Error

      // Check if we should retry
      const shouldRetry = finalConfig.retryCondition ? finalConfig.retryCondition(error) : false
      const isLastAttempt = attempt === finalConfig.maxAttempts

      if (!shouldRetry || isLastAttempt) {
        logger.warn('Retry failed - not retryable or max attempts reached', {
          requestId: context?.requestId,
          metadata: {
            operation: context?.operation,
            attempt,
            maxAttempts: finalConfig.maxAttempts,
            error: error instanceof Error ? error.message : String(error),
            retryable: shouldRetry,
          },
        })
        throw error
      }

      // Calculate delay, respecting retry-after header if present
      let delay = calculateDelay(attempt, finalConfig)
      const retryAfterMs = getRetryAfter(error)

      if (retryAfterMs !== null) {
        // Respect server's requested delay, but ensure minimum delay
        delay = Math.max(delay, retryAfterMs)
        logger.info('Using retry-after header delay', {
          requestId: context?.requestId,
          metadata: {
            operation: context?.operation,
            retryAfterMs,
            calculatedDelay: delay,
          },
        })
      }

      logger.info('Retrying after error', {
        requestId: context?.requestId,
        metadata: {
          operation: context?.operation,
          attempt,
          nextAttempt: attempt + 1,
          delay,
          error: error instanceof Error ? error.message : String(error),
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
      })

      // Wait before retry
      await sleep(delay)
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError || new Error('Retry failed')
}

// Retry configuration for different scenarios
export const retryConfigs = {
  // Fast retry for transient errors
  fast: {
    maxAttempts: 3,
    initialDelay: 100,
    maxDelay: 1000,
    factor: 2,
    jitter: true,
  },

  // Standard retry for most operations
  standard: defaultRetryConfig,

  // Aggressive retry for critical operations
  aggressive: {
    maxAttempts: 5,
    initialDelay: 500,
    maxDelay: 60000,
    factor: 2,
    jitter: true,
    timeout: 610000, // 10 minutes + 10 seconds (allows one full 10-minute attempt)
  },

  // Rate limit specific configuration
  rateLimit: {
    maxAttempts: 5,
    initialDelay: 5000, // Start with 5 seconds
    maxDelay: 60000, // Max 1 minute
    factor: 1.5, // Slower backoff
    jitter: true,
    retryCondition: (error: unknown) => {
      return error instanceof RateLimitError || (isHttpError(error) && error.statusCode === 429)
    },
  },
}
