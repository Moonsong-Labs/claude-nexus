import { Context, Next } from 'hono'
import { ValidationError } from '../types/errors'
import { validateClaudeRequest, ClaudeMessagesRequest } from '../types/claude'
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
    let body: any
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

    // Additional validation
    const validationErrors = validateClaudeRequestDetails(body)
    if (validationErrors.length > 0) {
      logger.warn('Request validation failed', { errors: validationErrors })
      throw new ValidationError(`Request validation failed: ${validationErrors.join(', ')}`)
    }

    // Attach validated body to context
    c.set('validatedBody', body)

    logger.debug('Request validation passed')
    await next()
  }
}

// Detailed validation
function validateClaudeRequestDetails(_request: ClaudeMessagesRequest): string[] {
  const errors: string[] = []

  // Model validation removed - allow any model name
  // This allows for new models to be used immediately without proxy updates

  // Validate messages
  // let totalLength = request.system?.length || 0
  // for (let i = 0; i < request.messages.length; i++) {
  //   const message = request.messages[i]

  //   // Check message content length
  //   const messageLength = typeof message.content === 'string'
  //     ? message.content.length
  //     : JSON.stringify(message.content).length
  //   totalLength += messageLength

  //   // Validate message structure
  //   if (message.role === 'system' && i > 0) {
  //     errors.push('System messages must be at the beginning')
  //   }

  //   // Check for empty content
  //   if (!message.content || (typeof message.content === 'string' && message.content.trim() === '')) {
  //     errors.push(`Message ${i} has empty content`)
  //   }
  // }

  // max_tokens validation removed - Claude API will handle any model-specific limits
  // This allows the proxy to work with all current and future models without updates

  return errors
}

// Helper to sanitize error messages for client
export function sanitizeErrorMessage(message: string): string {
  // Remove any potential sensitive information
  return message
    .replace(/sk-ant-[a-zA-Z0-9-]+/g, 'sk-ant-****')
    .replace(/Bearer [a-zA-Z0-9-._~+/]+/g, 'Bearer ****')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '****@****.com')
}
