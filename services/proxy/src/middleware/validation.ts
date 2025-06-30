import { Context, Next } from 'hono'
import { ValidationError } from '../types/errors'
import { validateClaudeRequest } from '../types/claude'
import { getRequestLogger } from './logger'

// Request size limits
const MAX_REQUEST_SIZE = 10 * 1024 * 1024 // 10MB
// Validation middleware
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
      logger.warn('Invalid content type', { contentType })
      throw new ValidationError('Content-Type must be application/json')
    }

    // Check request size
    const contentLength = parseInt(c.req.header('content-length') || '0')
    if (contentLength > MAX_REQUEST_SIZE) {
      logger.warn('Request too large', { contentLength, limit: MAX_REQUEST_SIZE })
      throw new ValidationError(`Request size exceeds limit of ${MAX_REQUEST_SIZE} bytes`)
    }

    // Parse and validate request body
    let body: unknown
    try {
      body = await c.req.json()
    } catch (error) {
      logger.warn('Invalid JSON body', {
        error: error instanceof Error ? { message: error.message } : { message: String(error) },
      })
      throw new ValidationError('Invalid JSON in request body')
    }

    // Basic Claude request validation
    if (!validateClaudeRequest(body)) {
      logger.warn('Invalid Claude request format', { body })
      throw new ValidationError('Invalid request format for Claude API')
    }

    // Claude API will handle detailed validation

    // Attach validated body to context
    c.set('validatedBody', body)

    logger.debug('Request validation passed')
    await next()
  }
}

// Helper to sanitize error messages for client
export function sanitizeErrorMessage(message: string): string {
  // Limit message length to prevent ReDoS
  const truncatedMessage = message.length > 1000 ? message.substring(0, 1000) + '...' : message

  // Remove any potential sensitive information with simpler, safer regex patterns
  return truncatedMessage
    .replace(/sk-ant-[\w-]{1,100}/g, 'sk-ant-****')
    .replace(/Bearer\s+[\w\-._~+/]{1,200}/g, 'Bearer ****')
    .replace(/[\w._%+-]{1,50}@[\w.-]{1,50}\.\w{2,10}/g, '****@****.com')
    .replace(/password["\s:=]+["']?[\w\S]{1,50}/gi, 'password: ****')
    .replace(/api[_-]?key["\s:=]+["']?[\w\S]{1,50}/gi, 'api_key: ****')
}
