import { MiddlewareHandler } from 'hono'
import { isReadOnly } from '../config.js'

/**
 * Middleware to protect against write operations in read-only mode
 * Blocks all non-GET/HEAD/OPTIONS requests when DASHBOARD_API_KEY is not set
 */
export const readOnlyProtection: MiddlewareHandler = async (c, next) => {
  // Only apply protection in read-only mode
  // Use function call to allow dynamic checking in tests
  if (!isReadOnly()) {
    return next()
  }

  // Allow safe HTTP methods
  const method = c.req.method.toUpperCase()
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return next()
  }

  // Block all write operations (POST, PUT, DELETE, PATCH)
  const isHtmxRequest = c.req.header('HX-Request') === 'true'

  if (isHtmxRequest) {
    // Return user-friendly HTML for HTMX requests
    return c.html(
      `<div class="alert alert-warning">
        <strong>Read-Only Mode:</strong> This dashboard is running in read-only mode. 
        Write operations are disabled for security.
      </div>`,
      403
    )
  }

  // Return JSON error for API requests
  return c.json(
    {
      error: 'Forbidden',
      message: 'Dashboard is running in read-only mode. Write operations are disabled.',
    },
    403
  )
}
