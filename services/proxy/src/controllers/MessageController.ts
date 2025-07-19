import { Context } from 'hono'
import { ProxyService } from '../services/ProxyService'
import { RequestContext } from '../domain/value-objects/RequestContext'
import { getRequestLogger } from '../middleware/logger'
import { ClaudeMessagesRequest, ClaudeMessage } from '../types/claude'
import { HonoVariables, HonoBindings } from '@claude-nexus/shared'

/**
 * Controller for handling /v1/messages endpoint
 * Delegates all business logic to ProxyService
 */
export class MessageController {
  constructor(private proxyService: ProxyService) {}

  /**
   * Handle POST /v1/messages
   */
  async handle(c: Context<{ Variables: HonoVariables; Bindings: HonoBindings }>): Promise<Response> {
    const logger = getRequestLogger(c)
    const requestContext = RequestContext.fromHono(c)

    // Get validated body from middleware
    const body: ClaudeMessagesRequest = c.get('validatedBody') || (await c.req.json())

    logger.debug('Processing message request', {
      model: body.model,
      messageCount: body.messages.length,
      streaming: body.stream || false,
      hasSystemField: !!body.system,
      systemFieldType: Array.isArray(body.system) ? 'array' : typeof body.system,
      systemFieldLength: Array.isArray(body.system) ? body.system.length : body.system ? 1 : 0,
      messageRoles: body.messages.map((m: ClaudeMessage) => m.role),
    })

    // Delegate to service - errors bubble up to global handler
    return await this.proxyService.handleRequest(body, requestContext)
  }

  /**
   * Handle OPTIONS /v1/messages (CORS preflight)
   */
  async handleOptions(c: Context): Promise<Response> {
    return new Response('', {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
        'Access-Control-Max-Age': '86400',
      },
    })
  }
}
