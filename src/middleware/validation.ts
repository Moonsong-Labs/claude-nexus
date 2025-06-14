import { Context, Next } from 'hono'
import { ValidationError } from '../types/errors'
import { validateClaudeRequest, ClaudeMessagesRequest } from '../types/claude'
import { getRequestLogger } from './logger'

// Request size limits
const MAX_REQUEST_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_MESSAGE_COUNT = 100
const MAX_SYSTEM_LENGTH = 10000
const MAX_MESSAGE_LENGTH = 100000
const MAX_TOTAL_LENGTH = 500000

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
      logger.warn('Invalid JSON body', { error: error.message })
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
function validateClaudeRequestDetails(request: ClaudeMessagesRequest): string[] {
  const errors: string[] = []
  
  // Validate model
  const validModels = [
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
    'claude-2.1',
    'claude-2.0',
    'claude-instant-1.2'
  ]
  
  if (!validModels.includes(request.model)) {
    errors.push(`Invalid model: ${request.model}`)
  }
  
  // Validate message count
  if (request.messages.length > MAX_MESSAGE_COUNT) {
    errors.push(`Too many messages: ${request.messages.length} (max: ${MAX_MESSAGE_COUNT})`)
  }
  
  // Validate system prompt length
  if (request.system && request.system.length > MAX_SYSTEM_LENGTH) {
    errors.push(`System prompt too long: ${request.system.length} (max: ${MAX_SYSTEM_LENGTH})`)
  }
  
  // Validate messages
  let totalLength = request.system?.length || 0
  for (let i = 0; i < request.messages.length; i++) {
    const message = request.messages[i]
    
    // Check message content length
    const messageLength = typeof message.content === 'string' 
      ? message.content.length 
      : JSON.stringify(message.content).length
    
    if (messageLength > MAX_MESSAGE_LENGTH) {
      errors.push(`Message ${i} too long: ${messageLength} (max: ${MAX_MESSAGE_LENGTH})`)
    }
    
    totalLength += messageLength
    
    // Validate message structure
    if (message.role === 'system' && i > 0) {
      errors.push('System messages must be at the beginning')
    }
    
    // Check for empty content
    if (!message.content || (typeof message.content === 'string' && message.content.trim() === '')) {
      errors.push(`Message ${i} has empty content`)
    }
  }
  
  // Check total content length
  if (totalLength > MAX_TOTAL_LENGTH) {
    errors.push(`Total content too long: ${totalLength} (max: ${MAX_TOTAL_LENGTH})`)
  }
  
  // Validate max_tokens
  if (request.max_tokens <= 0 || request.max_tokens > 4096) {
    errors.push(`Invalid max_tokens: ${request.max_tokens} (must be 1-4096)`)
  }
  
  // Validate temperature
  if (request.temperature !== undefined) {
    if (request.temperature < 0 || request.temperature > 1) {
      errors.push(`Invalid temperature: ${request.temperature} (must be 0-1)`)
    }
  }
  
  // Validate top_p
  if (request.top_p !== undefined) {
    if (request.top_p < 0 || request.top_p > 1) {
      errors.push(`Invalid top_p: ${request.top_p} (must be 0-1)`)
    }
  }
  
  // Validate top_k
  if (request.top_k !== undefined) {
    if (request.top_k < 1) {
      errors.push(`Invalid top_k: ${request.top_k} (must be >= 1)`)
    }
  }
  
  // Validate tools
  if (request.tools && request.tools.length > 0) {
    for (let i = 0; i < request.tools.length; i++) {
      const tool = request.tools[i]
      if (!tool.name || typeof tool.name !== 'string') {
        errors.push(`Tool ${i} missing name`)
      }
      if (!tool.description || typeof tool.description !== 'string') {
        errors.push(`Tool ${i} missing description`)
      }
      if (!tool.input_schema || tool.input_schema.type !== 'object') {
        errors.push(`Tool ${i} has invalid input_schema`)
      }
    }
  }
  
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