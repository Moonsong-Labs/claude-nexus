import { Context, Next } from 'hono'
import { timingSafeEqual } from 'crypto'
import { logger } from './logger.js'

/**
 * API Authentication Middleware
 * 
 * Validates API key for dashboard API endpoints using timing-safe comparison
 * to prevent timing attacks. Supports multiple header formats for backward
 * compatibility.
 * 
 * Configuration:
 * - Set DASHBOARD_API_KEY environment variable to enable authentication
 * - Without this variable, authentication is bypassed (development mode)
 * 
 * Supported headers:
 * - X-Dashboard-Key: <key> (preferred)
 * - X-API-Key: <key> (legacy)
 * - Authorization: Bearer <key> (OAuth-style)
 */
// Header names for API key authentication
const AUTH_HEADERS = {
  DASHBOARD_KEY: 'X-Dashboard-Key',
  API_KEY: 'X-API-Key',
  AUTHORIZATION: 'Authorization',
} as const

// Bearer token prefix
const BEARER_PREFIX = 'Bearer '

export function apiAuthMiddleware() {
  const apiKey = process.env.DASHBOARD_API_KEY

  if (!apiKey) {
    logger.warn('API authentication disabled - no DASHBOARD_API_KEY set')
    return async (c: Context, next: Next) => next()
  }

  return async (c: Context, next: Next) => {
    // Check headers in order of preference
    const providedKey =
      c.req.header(AUTH_HEADERS.DASHBOARD_KEY) ||
      c.req.header(AUTH_HEADERS.API_KEY) ||
      c.req.header(AUTH_HEADERS.AUTHORIZATION)?.replace(BEARER_PREFIX, '')

    if (!providedKey) {
      logger.warn('API request without authentication', {
        path: c.req.path,
        ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      })
      return c.json(
        {
          error: {
            code: 'unauthorized',
            message: 'API key required',
          },
        },
        401
      )
    }

    // Use timing-safe comparison to prevent timing attacks
    const expectedKeyBuffer = Buffer.from(apiKey)
    const providedKeyBuffer = Buffer.from(providedKey)
    
    // Buffers must be same length for timingSafeEqual
    const keysMatch = expectedKeyBuffer.length === providedKeyBuffer.length &&
                      timingSafeEqual(expectedKeyBuffer, providedKeyBuffer)
    
    if (!keysMatch) {
      logger.warn('API request with invalid key', {
        path: c.req.path,
        ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      })
      return c.json(
        {
          error: {
            code: 'unauthorized',
            message: 'Invalid API key',
          },
        },
        401
      )
    }

    await next()
  }
}
