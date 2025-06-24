import { Context } from 'hono'
import { ProxyService } from '../services/ProxyService'
import { RequestContext } from '../domain/value-objects/RequestContext'
import { getRequestLogger } from '../middleware/logger'
import { serializeError } from '../types/errors'

/**
 * Controller for handling /api/.env endpoint
 * 
 * NOTE: This endpoint is not documented in the official Anthropic API.
 * Implementation is provided for compatibility but may need adjustment
 * based on actual API behavior.
 */
export class EnvController {
  constructor(private proxyService: ProxyService) {}

  /**
   * Handle all methods for /api/.env
   */
  async handle(c: Context): Promise<Response> {
    const logger = getRequestLogger(c)
    const requestContext = RequestContext.fromHono(c)

    try {
      logger.info('Handling /api/.env request', {
        method: c.req.method,
        path: c.req.path,
      })

      // For GET requests, we can forward directly without a body
      const body = c.req.method === 'GET' ? undefined : await c.req.json().catch(() => ({}))

      // Delegate to service with a special request format
      const response = await this.proxyService.handleEnvRequest(
        body,
        requestContext,
        c.req.method
      )

      return response
    } catch (error) {
      logger.error('Env request failed', error instanceof Error ? error : undefined, {
        method: c.req.method,
      })

      const errorObj = error instanceof Error ? error : new Error(String(error))
      const errorResponse = serializeError(errorObj)

      let statusCode = 500
      if ((error as any).statusCode) {
        statusCode = (error as any).statusCode
      } else if ((error as any).upstreamStatus) {
        statusCode = (error as any).upstreamStatus
      }

      return c.json(errorResponse, statusCode as any)
    }
  }
}