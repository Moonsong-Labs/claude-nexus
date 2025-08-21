import { MiddlewareHandler } from 'hono'
import { isReadOnly, isAiAnalysisEnabledInReadOnly } from '../config.js'

/**
 * Middleware to protect against write operations in read-only mode
 * Blocks all non-GET/HEAD/OPTIONS requests when DASHBOARD_API_KEY is not set
 * Exception: AI Analysis endpoints when explicitly enabled via feature flag
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

  // Check if this is an AI Analysis endpoint and if it's allowed
  // Only POST requests to specific AI Analysis endpoints are allowed
  const path = c.req.path
  const isPost = method === 'POST'

  const isAllowedAiAnalysisEndpoint =
    isPost &&
    (path === '/api/analyses' || // Create new analysis
      /^\/api\/analyses\/[^/]+\/[^/]+\/regenerate$/.test(path)) // Regenerate: /api/analyses/:conversationId/:branchId/regenerate

  if (isAllowedAiAnalysisEndpoint && isAiAnalysisEnabledInReadOnly()) {
    // Allow AI Analysis operations when feature is enabled
    return next()
  }

  // Block all other write operations (POST, PUT, DELETE, PATCH)
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
      hint: 'Set DASHBOARD_API_KEY environment variable to enable write operations.',
    },
    403
  )
}
