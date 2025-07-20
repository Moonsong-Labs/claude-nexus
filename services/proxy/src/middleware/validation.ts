/**
 * @module validation
 * @description Request validation middleware for the Claude API proxy.
 * 
 * This middleware performs minimal validation to protect the proxy infrastructure
 * while delegating detailed business logic validation to the upstream Claude API.
 */

import { Context, Next } from 'hono'
import { ValidationError, config } from '@claude-nexus/shared'
import { ClaudeMessagesRequestSchema } from '@claude-nexus/shared/validators'
import { getRequestLogger } from './logger'

/**
 * Creates a validation middleware that validates requests to Claude API endpoints.
 * 
 * @returns {Function} Hono middleware function
 * 
 * @example
 * ```typescript
 * app.use('/v1/*', validationMiddleware())
 * ```
 * 
 * @description
 * This middleware performs the following validations:
 * - Checks Content-Type is application/json
 * - Validates request size doesn't exceed configured limit
 * - Parses and validates JSON body
 * - Performs minimal schema validation on Claude API requests
 * 
 * The validated and typed request body is attached to the context for downstream use.
 */
export function validationMiddleware() {
  return async (c: Context, next: Next) => {
    const path = c.req.path
    const logger = getRequestLogger(c)

    // Only validate Claude API endpoints
    if (!path.startsWith('/v1/messages')) {
      return next()
    }

    // Check Content-Type
    const contentType = c.req.header('content-type')
    if (!contentType?.includes('application/json')) {
      logger.warn('Invalid content type', { 
        contentType,
        metadata: { component: 'validationMiddleware', validationStep: 'contentType' }
      })
      throw new ValidationError('Content-Type must be application/json')
    }

    // Check request size
    const contentLength = parseInt(c.req.header('content-length') || '0')
    const maxRequestSize = config.validation.maxRequestSize
    if (contentLength > maxRequestSize) {
      logger.warn('Request too large', { 
        contentLength, 
        limit: maxRequestSize,
        metadata: { component: 'validationMiddleware', validationStep: 'size' }
      })
      throw new ValidationError(`Request size exceeds limit of ${maxRequestSize} bytes`)
    }

    // Parse and validate request body
    let body: unknown
    try {
      body = await c.req.json()
    } catch (error) {
      logger.warn('Invalid JSON body', {
        error: error instanceof Error ? { message: error.message } : { message: String(error) },
        metadata: { component: 'validationMiddleware', validationStep: 'jsonParsing' }
      })
      throw new ValidationError('Invalid JSON in request body')
    }

    // Validate request against Claude Messages API schema
    const result = ClaudeMessagesRequestSchema.safeParse(body)
    
    if (!result.success) {
      // Log detailed validation errors for internal debugging
      logger.warn('Invalid Claude request format', {
        error: 'Zod validation failed',
        issues: result.error.flatten(),
        metadata: { component: 'validationMiddleware', validationStep: 'schema' }
      })
      // Return generic error to client
      throw new ValidationError('Invalid request format for Claude API')
    }

    // Claude API will handle detailed validation of content

    // Attach the fully-typed, validated body to context
    c.set('validatedBody', result.data)

    logger.debug('Request validation passed', {
      metadata: { component: 'validationMiddleware' }
    })
    await next()
  }
}
