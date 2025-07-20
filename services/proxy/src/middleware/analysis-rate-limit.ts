import { Context, Next } from 'hono'
import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible'
import { logger } from './logger.js'
import { config } from '@claude-nexus/shared/config'

// Different rate limiters for different operations
let analysisCreationLimiter: RateLimiterMemory | RateLimiterRedis
let analysisRetrievalLimiter: RateLimiterMemory | RateLimiterRedis

/**
 * Initialize rate limiters for AI analysis endpoints.
 * Must be called once during application startup.
 */
export function initializeAnalysisRateLimiters() {
  // Analysis creation - expensive operation (15 per minute per user)
  analysisCreationLimiter = new RateLimiterMemory({
    keyPrefix: 'rate_limit_analysis_create',
    points: config.aiAnalysis?.rateLimits?.creation || 15,
    duration: 60, // 60 seconds
    blockDuration: 60, // Block for 60 seconds after limit exceeded
  })

  // Analysis retrieval - cheap operation (100 per minute per user)
  analysisRetrievalLimiter = new RateLimiterMemory({
    keyPrefix: 'rate_limit_analysis_retrieve',
    points: config.aiAnalysis?.rateLimits?.retrieval || 100,
    duration: 60, // 60 seconds
    blockDuration: 60, // Block for 60 seconds after limit exceeded
  })

  logger.info('Analysis rate limiters initialized', {
    metadata: {
      creationLimit: config.aiAnalysis?.rateLimits?.creation || 15,
      retrievalLimit: config.aiAnalysis?.rateLimits?.retrieval || 100,
    },
  })
}

/**
 * Factory function to create rate limiting middleware.
 * Reduces code duplication between creation and retrieval rate limiters.
 * 
 * @param limiter - The rate limiter instance to use
 * @param operation - The operation name for logging
 * @param errorMessage - The error message to return when rate limit is exceeded
 * @returns Hono middleware function
 */
function createRateLimitMiddleware(
  limiter: RateLimiterMemory | RateLimiterRedis,
  operation: string,
  errorMessage: string
) {
  return async (c: Context, next: Next) => {
    const requestId = c.get('requestId')
    const domain = c.get('domain')

    if (!limiter) {
      logger.error(`Rate limiter for ${operation} not initialized`, {
        requestId,
        domain,
      })
      return c.json(
        {
          error: {
            type: 'internal_error',
            message: 'Rate limiter not configured',
          },
        },
        500
      )
    }

    try {
      // Use domain as the key for rate limiting
      // This ensures rate limits are per-domain (tenant)
      const key = domain || 'unknown'

      await limiter.consume(key)

      logger.debug(`${operation} rate limit check passed`, {
        requestId,
        domain,
      })

      await next()
    } catch (rejRes) {
      // Rate limit exceeded
      const rateLimiterRes = rejRes as RateLimiterRes
      
      logger.warn(`${operation} rate limit exceeded`, {
        requestId,
        domain,
        metadata: {
          remainingPoints: rateLimiterRes.remainingPoints || 0,
          msBeforeNext: rateLimiterRes.msBeforeNext || 0,
        },
      })

      const retryAfter = Math.round((rateLimiterRes.msBeforeNext || 60000) / 1000)

      return c.json(
        {
          error: {
            type: 'rate_limit_error',
            message: errorMessage,
            retry_after: retryAfter,
          },
        },
        429,
        {
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': limiter.points.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(
            Date.now() + (rateLimiterRes.msBeforeNext || 60000)
          ).toISOString(),
        }
      )
    }
  }
}

/**
 * Middleware for rate limiting analysis creation.
 * Limits to 15 requests per minute per domain (configurable).
 * 
 * @returns Hono middleware function
 */
export function rateLimitAnalysisCreation() {
  return createRateLimitMiddleware(
    analysisCreationLimiter,
    'Analysis creation',
    'Too many analysis creation requests. Please try again later.'
  )
}

/**
 * Middleware for rate limiting analysis retrieval.
 * Limits to 100 requests per minute per domain (configurable).
 * 
 * @returns Hono middleware function
 */
export function rateLimitAnalysisRetrieval() {
  return createRateLimitMiddleware(
    analysisRetrievalLimiter,
    'Analysis retrieval',
    'Too many analysis retrieval requests. Please try again later.'
  )
}

/**
 * Get current rate limit status for a domain.
 * 
 * @param domain - The domain to check
 * @param limiterType - The type of limiter to check ('creation' or 'retrieval')
 * @returns Current rate limit status or null if limiter not initialized
 */
export async function getRateLimitStatus(domain: string, limiterType: 'creation' | 'retrieval') {
  const limiter = limiterType === 'creation' ? analysisCreationLimiter : analysisRetrievalLimiter

  if (!limiter) {
    return null
  }

  try {
    const res = await limiter.get(domain)
    return {
      remainingPoints: res ? limiter.points - res.consumedPoints : limiter.points,
      totalPoints: limiter.points,
      resetAt: res ? new Date(res.msBeforeNext + Date.now()) : null,
    }
  } catch (error) {
    logger.error('Error getting rate limit status', {
      error,
      metadata: { domain, limiterType },
    })
    return null
  }
}
