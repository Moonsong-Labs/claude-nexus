import { Context, Next } from 'hono'
import { logger } from './logger.js'

/**
 * API Authentication Middleware
 * Validates API key for dashboard API endpoints
 */
export function apiAuthMiddleware() {
  const apiKey = process.env.DASHBOARD_API_KEY || process.env.INTERNAL_API_KEY

  if (!apiKey) {
    logger.warn('API authentication disabled - no DASHBOARD_API_KEY or INTERNAL_API_KEY set')
    return async (c: Context, next: Next) => next()
  }

  return async (c: Context, next: Next) => {
    const providedKey =
      c.req.header('X-API-Key') || c.req.header('Authorization')?.replace('Bearer ', '')

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

    if (providedKey !== apiKey) {
      logger.warn('API request with invalid key', {
        path: c.req.path,
        ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      })
      return c.json(
        {
          error: {
            code: 'forbidden',
            message: 'Invalid API key',
          },
        },
        403
      )
    }

    await next()
  }
}
