import { Context, MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { isReadOnly } from '../config.js'

interface RateLimitData {
  count: number
  resetTime: number
}

// In-memory store for rate limiting (per IP)
const rateLimitStore = new Map<string, RateLimitData>()

/**
 * Rate limiting middleware for read-only mode
 * Only applies when dashboard is in read-only mode to prevent abuse
 */
export const rateLimitForReadOnly = (
  requests = 100, // 100 requests
  windowMs = 60000 // per minute
): MiddlewareHandler => {
  return async (c: Context, next) => {
    // Only apply rate limiting in read-only mode
    // Use function call to allow dynamic checking in tests
    if (!isReadOnly()) {
      return next()
    }

    // Get client IP - parse X-Forwarded-For carefully to avoid spoofing
    const xff = c.req.header('x-forwarded-for')
    // Take the first IP from the comma-separated list (original client)
    // Note: This can still be spoofed if not behind a trusted proxy
    const ip = xff ? xff.split(',')[0].trim() : c.req.header('x-real-ip') || 'unknown'

    const now = Date.now()
    const data = rateLimitStore.get(ip) || {
      count: 0,
      resetTime: now + windowMs,
    }

    // Reset if window has passed
    if (now > data.resetTime) {
      data.count = 0
      data.resetTime = now + windowMs
    }

    data.count++
    rateLimitStore.set(ip, data)

    // Add rate limit headers
    c.header('X-RateLimit-Limit', requests.toString())
    c.header('X-RateLimit-Remaining', Math.max(0, requests - data.count).toString())
    c.header('X-RateLimit-Reset', new Date(data.resetTime).toISOString())

    // Check if limit exceeded
    if (data.count > requests) {
      throw new HTTPException(429, {
        message: 'Too many requests. Please try again later.',
      })
    }

    await next()
  }
}

// Cleanup old entries periodically to prevent memory leaks
setInterval(() => {
  const now = Date.now()
  for (const [ip, data] of rateLimitStore.entries()) {
    if (now > data.resetTime + 300000) {
      // 5 minutes after reset
      rateLimitStore.delete(ip)
    }
  }
}, 300000) // Every 5 minutes
