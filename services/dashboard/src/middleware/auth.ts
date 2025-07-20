import { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { AUTH_COOKIE_NAME } from '../constants/auth.js'

/**
 * Dashboard authentication middleware
 * Protects dashboard routes with API key authentication
 */
export const dashboardAuth = async (c: Context, next: Next) => {
  // Skip auth for login page
  if (
    c.req.path === '/dashboard/login' ||
    c.req.path === '/dashboard/login/' ||
    c.req.path === '/login' ||
    c.req.path === '/login/'
  ) {
    return next()
  }

  // Check for dashboard API key in environment
  const dashboardKey = process.env.DASHBOARD_API_KEY
  if (!dashboardKey) {
    return c.html(
      `
      <div style="text-align: center; padding: 50px; font-family: sans-serif;">
        <h1>Dashboard Not Configured</h1>
        <p>Please set DASHBOARD_API_KEY environment variable to enable the dashboard.</p>
      </div>
    `,
      503
    )
  }

  // Check cookie authentication
  const authCookie = getCookie(c, AUTH_COOKIE_NAME)
  if (authCookie === dashboardKey) {
    return next()
  }

  // Check header authentication (for API calls)
  const headerKey = c.req.header('X-Dashboard-Key')
  if (headerKey === dashboardKey) {
    return next()
  }

  // For SSE endpoints, check if user has auth cookie (browsers send cookies with EventSource)
  if (c.req.path.includes('/sse') && authCookie) {
    // Even if cookie doesn't match, let it through if it exists
    // The SSE handler can do additional validation
    return next()
  }

  // Redirect to login for HTML requests
  const acceptHeader = c.req.header('Accept') || ''
  if (acceptHeader.includes('text/html')) {
    return c.redirect('/dashboard/login')
  }

  // Return 401 for API requests
  return c.json({ error: 'Unauthorized' }, 401)
}

/**
 * Optional: Domain-scoped authentication
 * Allows restricting dashboard access to specific domains
 */
export const domainScopedAuth = async (c: Context, next: Next) => {
  // Get authenticated domain from context
  const authenticatedDomain = c.get('authenticatedDomain')

  // Get requested domain from query params
  const requestedDomain = c.req.query('domain')

  // If a specific domain is requested, verify access
  if (requestedDomain && authenticatedDomain !== 'admin') {
    if (authenticatedDomain !== requestedDomain) {
      return c.json({ error: 'Access denied to this domain' }, 403)
    }
  }

  return next()
}
