import { Context, Next } from 'hono'
import { logger } from './logger.js'

/**
 * Domain Extractor Middleware
 * Extracts domain from request and sets it in context
 */
export function domainExtractorMiddleware() {
  return async (c: Context, next: Next) => {
    // Extract domain from Host header
    const host = c.req.header('host')

    if (!host) {
      logger.warn('No host header in request', {
        path: c.req.path,
        ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
      })
      // Reject requests without Host header - HTTP/1.1 requires it
      return c.json(
        {
          error: {
            code: 'bad_request',
            message: 'Host header is required',
          },
        },
        400
      )
    } else {
      // Remove port number if present
      const domain = host.split(':')[0]
      c.set('domain', domain)

      logger.debug('Domain extracted from request', {
        domain,
        path: c.req.path,
      })
    }

    await next()
  }
}
