/**
 * Spark Proxy Routes
 *
 * This module provides proxy endpoints for Spark API integration, allowing
 * the dashboard frontend to communicate with the Spark feedback service
 * through the proxy API without dealing with CORS or authentication issues.
 *
 * Security: CSRF protection is applied to all endpoints to prevent cross-site
 * request forgery attacks.
 */

import { Hono } from 'hono'
import { ProxyApiClient } from '../services/api-client.js'
import { csrfProtection } from '../middleware/csrf.js'
import { HttpError } from '../errors/HttpError.js'
import { logger } from '../middleware/logger.js'

// HTTP status codes for clarity
const HTTP_STATUS = {
  OK: 200,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const

export const sparkProxyRoutes = new Hono<{
  Variables: {
    apiClient?: ProxyApiClient
    csrfToken?: string
  }
}>()

// Apply CSRF protection to all routes
sparkProxyRoutes.use('*', csrfProtection())

/**
 * POST /spark/feedback
 *
 * Proxies feedback submission requests to the Spark API through the proxy service.
 *
 * Request Body:
 * - session_id: string - The Spark session identifier
 * - feedback: object - The feedback data (see Spark API documentation for structure)
 *
 * Response:
 * - Success: Returns the response from the Spark API
 * - Error: Returns error object with appropriate status code
 *
 * Security: Protected by CSRF token validation
 */
sparkProxyRoutes.post('/spark/feedback', async c => {
  const apiClient = c.get('apiClient')

  if (!apiClient) {
    logger.error('Spark proxy: API client not configured')
    return c.json(
      { error: 'Service temporarily unavailable', message: 'API client not configured' },
      HTTP_STATUS.SERVICE_UNAVAILABLE
    )
  }

  try {
    const body = await c.req.json()
    const response = await apiClient.post('/api/spark/feedback', body)
    return c.json(response, HTTP_STATUS.OK)
  } catch (error) {
    logger.error('Failed to submit Spark feedback:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Handle HttpError specifically
    if (HttpError.isHttpError(error)) {
      return c.json(error.data, error.status as any)
    }

    // Generic error response
    return c.json(
      {
        error: 'Failed to submit feedback',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    )
  }
})
