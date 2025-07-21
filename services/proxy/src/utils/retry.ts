import { logger } from '../middleware/logger'
import {
  retryWithBackoff as sharedRetryWithBackoff,
  RetryConfig,
  RetryLogger,
  defaultRetryConfig,
  isRetryableError,
  calculateDelay,
  retryConfigs,
  getRetryAfter,
  createRateLimitAwareRetry as sharedCreateRateLimitAwareRetry,
} from '@claude-nexus/shared/utils/retry'

// Re-export all the types and functions
export {
  RetryConfig,
  defaultRetryConfig,
  isRetryableError,
  calculateDelay,
  retryConfigs,
  getRetryAfter,
}

// Create logger adapter for proxy
const proxyRetryLogger: RetryLogger = {
  info: (message: string, context?: any) => logger.info(message, context),
  warn: (message: string, context?: any) => logger.warn(message, context),
}

// Proxy-specific retry with logging
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  context?: { requestId?: string; operation?: string }
): Promise<T> {
  return sharedRetryWithBackoff(fn, { ...config, logger: proxyRetryLogger }, context)
}

// Proxy-specific rate limit aware retry
export function createRateLimitAwareRetry(
  baseConfig: Partial<RetryConfig> = {}
): <T>(fn: () => Promise<T>, context?: any) => Promise<T> {
  return sharedCreateRateLimitAwareRetry({ ...baseConfig, logger: proxyRetryLogger })
}
