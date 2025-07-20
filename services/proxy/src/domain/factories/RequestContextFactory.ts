import { Context } from 'hono'
import { RequestContext } from '../value-objects/RequestContext'

/**
 * Factory for creating RequestContext instances from various sources.
 * Handles the extraction and transformation of request data into
 * the domain-agnostic RequestContext value object.
 */
export class RequestContextFactory {
  /**
   * Default headers to extract from incoming requests
   */
  private static readonly DEFAULT_HEADERS = [
    'user-agent',
    'x-forwarded-for',
    'x-real-ip',
    'content-type',
    'accept',
  ] as const

  /**
   * Create RequestContext from Hono framework context
   *
   * @param c - Hono context object
   * @returns RequestContext instance
   * @throws Error if requestId is not found in context (middleware not applied)
   */
  static fromHono(c: Context): RequestContext {
    const requestId = c.get('requestId')
    if (!requestId) {
      throw new Error(
        'RequestContext: requestId not found in context. Ensure request-id middleware is applied.'
      )
    }

    const host = c.req.header('host') || 'unknown'
    const apiKey = c.req.header('authorization')

    // Extract relevant headers
    const headers: Record<string, string> = {}
    for (const header of this.DEFAULT_HEADERS) {
      const value = c.req.header(header)
      if (value) {
        headers[header] = value
      }
    }

    return new RequestContext(
      requestId,
      host,
      c.req.method,
      c.req.path,
      Date.now(),
      headers,
      apiKey
    )
  }

  /**
   * Create RequestContext for testing purposes
   *
   * @param partial - Partial request context data
   * @returns RequestContext instance with sensible defaults
   */
  static forTesting(
    partial: Partial<{
      requestId: string
      host: string
      method: string
      path: string
      startTime: number
      headers: Record<string, string>
      apiKey?: string
    }>
  ): RequestContext {
    return new RequestContext(
      partial.requestId || 'test-request-id',
      partial.host || 'test.example.com',
      partial.method || 'POST',
      partial.path || '/v1/messages',
      partial.startTime || Date.now(),
      partial.headers || {},
      partial.apiKey
    )
  }
}
