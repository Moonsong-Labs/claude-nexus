import { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { timingSafeEqual } from 'crypto'
import { AUTH_COOKIE_NAME } from '../constants/auth.js'
import { logger } from '../middleware/logger.js'

// Login paths that bypass authentication
const LOGIN_PATHS = new Set(['/dashboard/login', '/dashboard/login/', '/login', '/login/'])

/**
 * Performs a timing-safe string comparison to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/**
 * Dashboard authentication middleware
 * Protects dashboard routes with API key authentication
 */
export const dashboardAuth = async (c: Context, next: Next) => {
  const path = c.req.path

  // Skip auth for login pages
  if (LOGIN_PATHS.has(path)) {
    return next()
  }

  // Check for dashboard API key in environment
  const dashboardKey = process.env.DASHBOARD_API_KEY
  if (!dashboardKey) {
    logger.error('Dashboard API key not configured')
    return c.json(
      {
        error: 'Dashboard Not Configured',
        message: 'Please set DASHBOARD_API_KEY environment variable to enable the dashboard.',
      },
      503
    )
  }

  // Check cookie authentication
  const authCookie = getCookie(c, AUTH_COOKIE_NAME)
  if (authCookie && secureCompare(authCookie, dashboardKey)) {
    return next()
  }

  // Check header authentication (for API calls)
  const headerKey = c.req.header('X-Dashboard-Key')
  if (headerKey && secureCompare(headerKey, dashboardKey)) {
    return next()
  }

  // Log failed authentication attempts for security monitoring
  logger.warn('Authentication failed', {
    path,
    metadata: {
      hasAuthCookie: !!authCookie,
      hasHeaderKey: !!headerKey,
      userAgent: c.req.header('User-Agent'),
      ip: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP') || 'unknown',
    },
  })

  // Redirect to login for HTML requests
  const acceptHeader = c.req.header('Accept') || ''
  if (acceptHeader.includes('text/html')) {
    return c.redirect('/dashboard/login')
  }

  // Return 401 for API requests
  return c.json({ error: 'Unauthorized' }, 401)
}
