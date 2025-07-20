import { createMiddleware } from 'hono/factory'
import { customAlphabet } from 'nanoid'

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Character set for generating request IDs.
 * Excludes ambiguous characters (0, O, I, l) for better readability.
 * Safe for URLs and logging systems.
 */
const DEFAULT_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/**
 * Length of generated request IDs.
 * 12 characters with our alphabet provides ~71 bits of entropy,
 * sufficient for high-volume distributed systems.
 */
const DEFAULT_LENGTH = 12

/**
 * Standard header name for request correlation in distributed systems.
 * Widely supported by logging and tracing tools.
 */
const DEFAULT_HEADER = 'X-Request-ID'

/**
 * Default validation pattern for incoming request IDs.
 * Allows alphanumeric characters and hyphens, up to 100 characters.
 */
const DEFAULT_VALIDATION_REGEX = /^[a-zA-Z0-9-]{1,100}$/

/**
 * Default request ID generator using nanoid.
 * Provides better performance and shorter IDs compared to UUID.
 */
const defaultGenerator = customAlphabet(DEFAULT_ALPHABET, DEFAULT_LENGTH)

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for the request ID middleware.
 */
export interface RequestIdOptions {
  /**
   * The name of the header to check for an existing request ID.
   * @default 'X-Request-ID'
   */
  headerName?: string

  /**
   * A function to generate a new request ID.
   * @default nanoid with 12 chars from a custom alphabet
   */
  generator?: () => string

  /**
   * A regex or function to validate the incoming request ID.
   * If validation fails, a new ID will be generated.
   * @default /^[a-zA-Z0-9-]{1,100}$/
   */
  validate?: RegExp | ((id: string) => boolean)

  /**
   * The key to use when setting the request ID on the context.
   * @default 'requestId'
   */
  contextKey?: string
}

/**
 * Type augmentation for Hono context variables.
 * This ensures type safety when accessing the request ID.
 */
export type RequestIdVariables = {
  requestId: string
}

// ============================================================================
// Middleware Implementation
// ============================================================================

/**
 * Request ID middleware for distributed tracing and debugging.
 *
 * This middleware ensures every request has a unique identifier for:
 * - Distributed tracing across microservices
 * - Correlating logs across different services
 * - Debugging and troubleshooting request flows
 *
 * Features:
 * - Checks for existing request ID header (supports distributed tracing)
 * - Validates incoming IDs for security
 * - Generates new ID if none exists or validation fails
 * - Attaches ID to Hono context for use throughout request lifecycle
 * - Adds ID to response headers for client-side correlation
 * - Fully configurable with sensible defaults
 *
 * @example
 * ```typescript
 * import { requestIdMiddleware } from '@claude-nexus/shared/middleware'
 *
 * // Basic usage with defaults
 * app.use('*', requestIdMiddleware())
 *
 * // Custom configuration
 * app.use('*', requestIdMiddleware({
 *   headerName: 'X-Trace-ID',
 *   generator: () => crypto.randomUUID(),
 *   validate: /^[0-9a-f-]{36}$/i
 * }))
 *
 * // Access request ID in handlers
 * app.get('/api/test', (c) => {
 *   const requestId = c.get('requestId')
 *   console.log(`Processing request ${requestId}`)
 *   return c.json({ requestId })
 * })
 * ```
 */
export const requestIdMiddleware = (options: RequestIdOptions = {}) => {
  const {
    headerName = DEFAULT_HEADER,
    generator = defaultGenerator,
    validate = DEFAULT_VALIDATION_REGEX,
    contextKey = 'requestId',
  } = options

  // Convert validation to function if regex provided
  const validator = typeof validate === 'function' ? validate : (id: string) => validate.test(id)

  return createMiddleware<{
    Variables: Record<string, string>
  }>(async (c, next) => {
    // Get and trim the incoming request ID
    const incomingId = c.req.header(headerName)?.trim()

    // Use incoming ID if valid, otherwise generate new one
    const requestId = incomingId && validator(incomingId) ? incomingId : generator()

    // Attach request ID to context for use throughout the request lifecycle
    c.set(contextKey, requestId)

    // Set response header for debugging and client-side correlation
    c.header(headerName, requestId)

    await next()
  })
}
