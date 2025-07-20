import { createMiddleware } from 'hono/factory'
import { HttpError } from '../errors/HttpError.js'
import type { ProxyApiClient } from '../services/api-client.js'

/**
 * Middleware that ensures the API client is available.
 * Throws an HttpError with 503 status if the API client is not configured.
 * This centralizes the repeated API client checks across route handlers.
 */
export const requireApiClient = createMiddleware<{
  Variables: {
    apiClient?: ProxyApiClient
  }
}>(async (c, next) => {
  const apiClient = c.get('apiClient')
  if (!apiClient) {
    throw new HttpError('API client not configured', 503)
  }
  await next()
})
