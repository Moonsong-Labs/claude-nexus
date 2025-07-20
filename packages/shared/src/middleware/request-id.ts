import { Context, Next } from 'hono'
import { customAlphabet } from 'nanoid'

/**
 * Character set for generating request IDs.
 * Excludes ambiguous characters (0, O, I, l) for better readability.
 * Safe for URLs and logging systems.
 */
const REQUEST_ID_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/**
 * Length of generated request IDs.
 * 12 characters with our alphabet provides ~71 bits of entropy,
 * sufficient for high-volume distributed systems.
 */
const REQUEST_ID_LENGTH = 12

/**
 * Standard header name for request correlation in distributed systems.
 * Widely supported by logging and tracing tools.
 */
const REQUEST_ID_HEADER = 'X-Request-ID'

/**
 * Generate short, URL-safe request IDs using nanoid.
 * Provides better performance and shorter IDs compared to UUID.
 */
const generateRequestId = customAlphabet(REQUEST_ID_ALPHABET, REQUEST_ID_LENGTH)

/**
 * Request ID middleware for distributed tracing and debugging.
 * 
 * This middleware ensures every request has a unique identifier for:
 * - Distributed tracing across microservices
 * - Correlating logs across different services
 * - Debugging and troubleshooting request flows
 * 
 * Features:
 * - Checks for existing X-Request-ID header (supports distributed tracing)
 * - Generates new ID if none exists using nanoid (fast, URL-safe)
 * - Attaches ID to Hono context for use throughout request lifecycle
 * - Adds ID to response headers for client-side correlation
 * 
 * @example
 * ```typescript
 * import { requestIdMiddleware } from '@claude-nexus/shared/middleware'
 * 
 * app.use('*', requestIdMiddleware())
 * 
 * // Access request ID in handlers
 * app.get('/api/test', (c) => {
 *   const requestId = c.get('requestId')
 *   console.log(`Processing request ${requestId}`)
 *   return c.json({ requestId })
 * })
 * ```
 */
export const requestIdMiddleware = () => {
  return async (c: Context, next: Next) => {
    // Check for existing request ID from upstream services
    const existingId = c.req.header(REQUEST_ID_HEADER)
    
    // Use existing ID for distributed tracing, or generate new one
    const requestId = existingId && existingId.trim() ? existingId : generateRequestId()
    
    // Attach request ID to context for use throughout the request lifecycle
    c.set('requestId', requestId)
    
    // Set response header for debugging and client-side correlation
    c.header(REQUEST_ID_HEADER, requestId)
    
    await next()
  }
}