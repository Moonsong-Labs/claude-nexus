import { Context, Next, MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { isReadOnly, dashboardApiKey } from '../config.js'

export type AuthContext = {
  isAuthenticated: boolean
  isReadOnly: boolean
}

/**
 * Dashboard authentication middleware
 * Protects dashboard routes with API key authentication
 * Supports read-only mode when DASHBOARD_API_KEY is not set
 */
export const dashboardAuth: MiddlewareHandler<{ Variables: { auth: AuthContext } }> = async (
  c,
  next
) => {
  // Skip auth for login page
  if (
    c.req.path === '/dashboard/login' ||
    c.req.path === '/dashboard/login/' ||
    c.req.path === '/login' ||
    c.req.path === '/login/'
  ) {
    return next()
  }

  // Set read-only mode in context
  c.set('auth', {
    isAuthenticated: false,
    isReadOnly: isReadOnly,
  })

  // If in read-only mode, allow access without authentication
  if (isReadOnly) {
    return next()
  }

  // Check for dashboard API key in environment
  if (!dashboardApiKey) {
    // This should not happen given the isReadOnly check above, but keep for safety
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
  const authCookie = getCookie(c, 'dashboard_auth')
  if (authCookie === dashboardApiKey) {
    c.set('auth', {
      isAuthenticated: true,
      isReadOnly: false,
    })
    return next()
  }

  // Check header authentication (for API calls)
  const headerKey = c.req.header('X-Dashboard-Key')
  if (headerKey === dashboardApiKey) {
    c.set('auth', {
      isAuthenticated: true,
      isReadOnly: false,
    })
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
 * Middleware to protect write routes in read-only mode
 * This should be applied globally to POST, PUT, DELETE, PATCH methods
 */
export const protectWriteRoutes: MiddlewareHandler<{ Variables: { auth: AuthContext } }> = async (
  c,
  next
) => {
  const auth = c.get('auth')

  // If in read-only mode, block ALL write operations regardless of authentication
  if (auth?.isReadOnly) {
    // Return user-friendly error for HTMX requests
    const hxRequest = c.req.header('HX-Request')
    if (hxRequest) {
      // Prevent HTMX from swapping the main content
      c.header('HX-Reswap', 'none')
      c.header('HX-Retarget', '#toast-container')

      return c.html(
        `<div id="toast-container" class="toast toast-error" hx-swap-oob="true">
          <div class="toast-message">This action is not available in read-only mode.</div>
        </div>`,
        403
      )
    }

    // Return JSON error for API requests
    return c.json(
      {
        error: 'Forbidden',
        message: 'The dashboard is in read-only mode. Write operations are not allowed.',
      },
      403
    )
  }

  return next()
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
