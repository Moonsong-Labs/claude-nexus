import { Context, Next } from 'hono'
import { timingSafeEqual } from 'crypto'
import { logger } from './logger.js'
import { container } from '../container.js'

// Constants
const AUTH_ERRORS = {
  MISSING_HEADER: 'Missing Authorization header. Please provide a Bearer token.',
  INVALID_FORMAT: 'Invalid Authorization header format. Expected: Bearer <token>',
  NO_CLIENT_KEY: (domain: string) =>
    `No client API key configured for domain "${domain}". Please add "client_api_key" to your credential file or disable client authentication.`,
  INVALID_KEY: 'Invalid client API key. Please check your Bearer token.',
  INTERNAL_ERROR: 'An error occurred while verifying authentication. Please try again.',
  DOMAIN_NOT_FOUND: 'Domain context not found. This is an internal proxy error.',
} as const

const BEARER_REGEX = /^Bearer\s+(.+)$/i
const WWW_AUTHENTICATE_HEADER = { 'WWW-Authenticate': 'Bearer realm="Claude Nexus Proxy"' }

/**
 * Extracts bearer token from Authorization header
 */
function extractBearerToken(authorization: string): string | null {
  const match = authorization.match(BEARER_REGEX)
  return match?.[1] ?? null
}

/**
 * Gets request metadata for logging
 */
function getRequestMetadata(c: Context): Record<string, unknown> {
  return {
    ip:
      c.req.header('x-forwarded-for') ||
      c.req.header('x-real-ip') ||
      c.req.header('cf-connecting-ip'),
    userAgent: c.req.header('user-agent'),
    path: c.req.path,
  }
}

/**
 * Creates standardized error response
 */
function createAuthError(c: Context, message: string, statusCode = 401): Response {
  const headers = statusCode === 401 ? WWW_AUTHENTICATE_HEADER : undefined

  return c.json(
    {
      error: {
        type: statusCode === 401 ? 'authentication_error' : 'internal_error',
        message,
      },
    },
    statusCode as any,
    headers
  )
}

/**
 * Performs timing-safe string comparison
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)

  // timingSafeEqual returns false for different lengths without timing leak
  if (aBuffer.length !== bBuffer.length) {
    return false
  }

  return timingSafeEqual(aBuffer, bBuffer)
}

/**
 * Client API Authentication Middleware
 *
 * Validates domain-specific API keys for proxy access.
 * Runs before rate limiting to protect against unauthenticated requests.
 *
 * @returns Hono middleware function
 */
export function clientAuthMiddleware() {
  return async (c: Context, next: Next) => {
    const requestId = c.get('requestId')
    const domain = c.get('domain')
    const metadata = getRequestMetadata(c)

    // Validate domain context
    if (!domain) {
      logger.error('Client auth middleware: Domain not found in context', {
        requestId,
        ...metadata,
      })
      return createAuthError(c, AUTH_ERRORS.DOMAIN_NOT_FOUND, 500)
    }

    // Check Authorization header
    const authorization = c.req.header('Authorization')
    if (!authorization) {
      logger.debug('Client auth middleware: Missing authorization header', {
        requestId,
        domain,
        ...metadata,
      })
      return createAuthError(c, AUTH_ERRORS.MISSING_HEADER)
    }

    // Extract bearer token
    const token = extractBearerToken(authorization)
    if (!token) {
      logger.debug('Client auth middleware: Invalid authorization format', {
        requestId,
        domain,
        ...metadata,
      })
      return createAuthError(c, AUTH_ERRORS.INVALID_FORMAT)
    }

    try {
      // Get client API key from authentication service
      const authService = container.getAuthenticationService()
      const clientApiKey = await authService.getClientApiKey(domain)

      if (!clientApiKey) {
        logger.warn('Client auth middleware: No client API key configured', {
          requestId,
          domain,
          ...metadata,
        })
        return createAuthError(c, AUTH_ERRORS.NO_CLIENT_KEY(domain))
      }

      // Perform timing-safe comparison
      const isValid = timingSafeStringEqual(token, clientApiKey)

      if (!isValid) {
        logger.warn('Client auth middleware: Invalid API key', {
          requestId,
          domain,
          ...metadata,
        })
        return createAuthError(c, AUTH_ERRORS.INVALID_KEY)
      }

      logger.debug('Client auth middleware: Authentication successful', {
        requestId,
        domain,
      })

      await next()
    } catch (error) {
      logger.error('Client auth middleware: Error verifying token', {
        requestId,
        domain,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
        ...metadata,
      })
      return createAuthError(c, AUTH_ERRORS.INTERNAL_ERROR, 500)
    }
  }
}
