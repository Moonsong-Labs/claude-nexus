import { Context } from 'hono'
import { ProxyService } from '../services/ProxyService'
import { RequestContext } from '../domain/value-objects/RequestContext'
import { validateClaudeRequest } from '../types/claude'
import { ValidationError, serializeError } from '../types/errors'
import { getRequestLogger } from '../middleware/logger'

/**
 * Controller for handling /v1/messages endpoint
 * Separates HTTP concerns from business logic
 */
export class MessageController {
  constructor(private proxyService: ProxyService) {}
  
  /**
   * Handle POST /v1/messages
   */
  async handle(c: Context): Promise<Response> {
    const logger = getRequestLogger(c)
    const requestContext = RequestContext.fromHono(c)
    
    try {
      // Get validated body (from validation middleware)
      const body = c.get('validatedBody') || await c.req.json()
      
      // Additional validation if not done by middleware
      if (!validateClaudeRequest(body)) {
        throw new ValidationError('Invalid Claude API request format')
      }
      
      logger.debug('Processing message request', {
        model: body.model,
        messageCount: body.messages.length,
        streaming: body.stream || false
      })
      
      // Delegate to service
      const response = await this.proxyService.handleRequest(
        body,
        requestContext
      )
      
      // Set request context for middleware
      c.set('inputTokens', c.get('inputTokens') || 0)
      c.set('outputTokens', c.get('outputTokens') || 0)
      
      return response
      
    } catch (error) {
      logger.error('Request failed', error, {
        model: body?.model,
        streaming: body?.stream
      })
      
      // Serialize error for response
      const errorResponse = serializeError(error)
      
      return c.json(
        errorResponse,
        error.statusCode || 500
      )
    }
  }
  
  /**
   * Handle OPTIONS /v1/messages (CORS preflight)
   */
  async handleOptions(c: Context): Promise<Response> {
    return c.text('', 204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
      'Access-Control-Max-Age': '86400'
    })
  }
}