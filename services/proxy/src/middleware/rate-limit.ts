/**
 * Rate Limiting Middleware for Claude Nexus Proxy
 * 
 * This middleware provides proxy-level rate limiting to protect the service
 * and provide immediate feedback to clients. It operates independently of
 * Claude API's own rate limiting.
 * 
 * Features:
 * - Tracks requests and token usage per API key and domain
 * - Provides immediate feedback via rate limit headers
 * - Enforces configurable limits with blocking capability
 * - Supports both usage tracking (default) and enforcement modes
 * 
 * Note: This is proxy-level rate limiting. The Claude API has its own
 * rate limits that are enforced separately.
 */

import { Context, Next } from 'hono'
import { RateLimitError } from '@claude-nexus/shared'
import { getRequestLogger } from './logger'

// Time constants
const ONE_MINUTE_MS = 60 * 1000
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS
const CLEANUP_INTERVAL_MS = ONE_MINUTE_MS
const ENTRY_RETENTION_MULTIPLIER = 2 // Keep entries for 2x their window duration

// Rate limit configuration
interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Max requests per window
  maxTokens: number // Max tokens per window
  keyGenerator: (c: Context) => string // Function to generate rate limit key
  skipSuccessfulRequests?: boolean // Don't count successful requests
  skipFailedRequests?: boolean // Don't count failed requests
}

// Rate limit store entry
interface RateLimitEntry {
  requests: number
  tokens: number
  windowStart: number
  blocked: boolean
  blockExpiry?: number
  expiresAt: number // Absolute timestamp for cleanup
}

/**
 * In-memory rate limit store
 * TODO: For multi-instance deployments, implement RedisRateLimitStore
 * that implements the same interface but uses Redis for shared state
 */
class RateLimitStore {
  private store = new Map<string, RateLimitEntry>()
  private cleanupInterval: ReturnType<typeof setInterval>

  constructor() {
    // Clean up expired entries periodically
    this.cleanupInterval = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS)
  }

  get(key: string): RateLimitEntry | undefined {
    return this.store.get(key)
  }

  set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry)
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  cleanup(): void {
    try {
      const now = Date.now()
      for (const [key, entry] of this.store.entries()) {
        if (now > entry.expiresAt) {
          this.store.delete(key)
        }
      }
    } catch (error) {
      console.error('Error during rate limit store cleanup:', error)
    }
  }

  close(): void {
    clearInterval(this.cleanupInterval)
  }
}

// Global rate limit stores
const apiKeyStore = new RateLimitStore()
const domainStore = new RateLimitStore()

// Default configurations
const defaultApiKeyConfig: RateLimitConfig = {
  windowMs: ONE_HOUR_MS,
  maxRequests: 1000, // 1000 requests per hour
  maxTokens: 1000000, // 1M tokens per hour
  keyGenerator: c => {
    const apiKey =
      c.req.header('x-api-key') ||
      c.req.header('authorization')?.replace('Bearer ', '') ||
      'default'
    return `api:${apiKey.substring(0, 10)}`
  },
}

const defaultDomainConfig: RateLimitConfig = {
  windowMs: ONE_HOUR_MS,
  maxRequests: 5000, // 5000 requests per hour
  maxTokens: 5000000, // 5M tokens per hour
  keyGenerator: c => {
    const domain = c.req.header('host') || 'unknown'
    return `domain:${domain}`
  },
}

/**
 * Helper to set rate limit headers on the response
 */
function setRateLimitHeaders(
  c: Context,
  limit: number,
  remaining: number,
  reset: number,
  retryAfter?: number
): void {
  c.header('X-RateLimit-Limit', String(limit))
  c.header('X-RateLimit-Remaining', String(remaining))
  c.header('X-RateLimit-Reset', String(reset))
  if (retryAfter !== undefined) {
    c.header('Retry-After', String(retryAfter))
  }
}

/**
 * Creates a rate limiting middleware
 * @param store - The rate limit store to use
 * @param defaultConfig - Default configuration for this limiter
 * @param limiterName - Name for logging (e.g., 'API Key', 'Domain')
 * @param config - Override configuration
 */
function createRateLimitMiddleware(
  store: RateLimitStore,
  defaultConfig: RateLimitConfig,
  limiterName: string,
  config: Partial<RateLimitConfig> = {}
) {
  const finalConfig = { ...defaultConfig, ...config }

  return async (c: Context, next: Next) => {
    const logger = getRequestLogger(c)
    const key = finalConfig.keyGenerator(c)
    const now = Date.now()

    // Get or create rate limit entry
    let entry = store.get(key)

    if (!entry || now - entry.windowStart >= finalConfig.windowMs) {
      // Create new window
      entry = {
        requests: 0,
        tokens: 0,
        windowStart: now,
        blocked: false,
        expiresAt: now + (finalConfig.windowMs * ENTRY_RETENTION_MULTIPLIER),
      }
      store.set(key, entry)
    }

    // Check if currently blocked
    if (entry.blocked && entry.blockExpiry && now < entry.blockExpiry) {
      const retryAfter = Math.ceil((entry.blockExpiry - now) / 1000)
      logger.warn(`${limiterName} rate limit exceeded - blocked`, {
        key,
        retryAfter,
        requests: entry.requests,
        maxRequests: finalConfig.maxRequests,
      })

      setRateLimitHeaders(
        c,
        finalConfig.maxRequests,
        0,
        Math.ceil(entry.blockExpiry / 1000),
        retryAfter
      )

      throw new RateLimitError(`${limiterName} rate limit exceeded`, retryAfter)
    }

    // Check request count
    if (entry.requests >= finalConfig.maxRequests) {
      entry.blocked = true
      entry.blockExpiry = entry.windowStart + finalConfig.windowMs

      const retryAfter = Math.ceil((entry.blockExpiry - now) / 1000)
      logger.warn(`${limiterName} rate limit exceeded - request count`, {
        key,
        requests: entry.requests,
        maxRequests: finalConfig.maxRequests,
        retryAfter,
      })

      setRateLimitHeaders(
        c,
        finalConfig.maxRequests,
        0,
        Math.ceil(entry.blockExpiry / 1000),
        retryAfter
      )

      throw new RateLimitError(`${limiterName} rate limit exceeded`, retryAfter)
    }

    // Increment request count
    entry.requests++

    // Set rate limit headers
    const remaining = Math.max(0, finalConfig.maxRequests - entry.requests)
    const reset = Math.ceil((entry.windowStart + finalConfig.windowMs) / 1000)

    setRateLimitHeaders(c, finalConfig.maxRequests, remaining, reset)

    // Store entry reference for token counting
    c.set('rateLimitEntry', entry)
    c.set('rateLimitConfig', finalConfig)

    try {
      await next()

      // Update token count after successful request
      // Note: This is "soft" limiting - the request that exceeds the token
      // limit will complete successfully, but subsequent requests will be blocked
      const inputTokens = c.get('inputTokens') || 0
      const outputTokens = c.get('outputTokens') || 0
      entry.tokens += inputTokens + outputTokens

      // Check token limit
      if (entry.tokens > finalConfig.maxTokens) {
        logger.warn(`${limiterName} token limit exceeded`, {
          key,
          tokens: entry.tokens,
          maxTokens: finalConfig.maxTokens,
        })
        // Mark for blocking on next request
        entry.blocked = true
        entry.blockExpiry = entry.windowStart + finalConfig.windowMs
      }
    } catch (error) {
      // Handle based on skip configuration
      if (finalConfig.skipFailedRequests) {
        entry.requests--
      }
      throw error
    }
  }
}

// Export specialized rate limiters using the unified factory
export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  return createRateLimitMiddleware(apiKeyStore, defaultApiKeyConfig, 'API Key', config)
}

// Domain-based rate limiter
export function createDomainRateLimiter(config: Partial<RateLimitConfig> = {}) {
  return createRateLimitMiddleware(domainStore, defaultDomainConfig, 'Domain', config)
}

// Helper to get current rate limit status
export function getRateLimitStatus(c: Context): {
  limit: number
  remaining: number
  reset: number
  tokens: number
} | null {
  const entry = c.get('rateLimitEntry') as RateLimitEntry | undefined
  const config = c.get('rateLimitConfig') as RateLimitConfig | undefined

  if (!entry || !config) {
    return null
  }

  return {
    limit: config.maxRequests,
    remaining: Math.max(0, config.maxRequests - entry.requests),
    reset: Math.ceil((entry.windowStart + config.windowMs) / 1000),
    tokens: entry.tokens,
  }
}

// Cleanup function for graceful shutdown
export function closeRateLimitStores(): void {
  apiKeyStore.close()
  domainStore.close()
}
