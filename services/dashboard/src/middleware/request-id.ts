import { Context, Next } from 'hono'
import { customAlphabet } from 'nanoid'

// Generate short request IDs
const generateRequestId = customAlphabet(
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
  12
)

/**
 * Middleware to generate and attach a unique request ID to each request
 * This is separate from logging to maintain single responsibility
 */
export function requestIdMiddleware() {
  return async (c: Context, next: Next) => {
    const requestId = generateRequestId()

    // Attach request ID to context for use throughout the request lifecycle
    c.set('requestId', requestId)

    // Optionally set it as a response header for debugging
    c.header('X-Request-ID', requestId)

    await next()
  }
}
