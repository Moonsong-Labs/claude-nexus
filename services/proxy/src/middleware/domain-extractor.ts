import { Context, Next } from 'hono'
import { logger } from './logger.js'
import { createErrorResponse } from '../utils/error-response.js'
import { HTTP_STATUS } from '../constants.js'

// Regular expressions for IP address detection
const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/
const IPV6_REGEX = /^\[?[0-9a-fA-F:]+\]?(:\d+)?$/ // Simplified IPv6 detection

/**
 * Domain Extractor Middleware
 * Extracts domain from request and sets it in context
 *
 * Port handling logic:
 * - Preserves port for localhost and IP addresses (needed for direct access)
 * - Strips port for domain names (standard ports are implicit)
 */
export function domainExtractorMiddleware() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const host = c.req.header('host')

    if (!host) {
      logger.warn('No host header in request', {
        path: c.req.path,
        metadata: {
          ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
        },
      })
      // Reject requests without Host header - HTTP/1.1 requires it
      return createErrorResponse(
        c,
        'Host header is required',
        HTTP_STATUS.BAD_REQUEST,
        'bad_request',
        'bad_request'
      )
    }

    // Validate Host header format for security
    if (!isValidHostHeader(host)) {
      logger.warn('Invalid host header format', {
        path: c.req.path,
        metadata: {
          host,
        },
      })
      return createErrorResponse(
        c,
        'Invalid host header format',
        HTTP_STATUS.BAD_REQUEST,
        'bad_request',
        'bad_request'
      )
    }

    // Extract domain based on host type
    const domain = extractDomain(host)
    c.set('domain', domain)

    await next()
  }
}

/**
 * Validates host header format to prevent injection attacks
 */
function isValidHostHeader(host: string): boolean {
  // Allow alphanumeric, dots, hyphens, colons, and brackets (for IPv6)
  // This prevents path injection and other malicious patterns
  return /^[a-zA-Z0-9.:[\]-]+$/.test(host)
}

/**
 * Extracts domain from host header
 * Preserves port for localhost and IP addresses
 * Strips port for regular domain names
 */
function extractDomain(host: string): string {
  const isLocalhost = host.startsWith('localhost')
  const isIPv4 = IPV4_REGEX.test(host)
  const isIPv6 = IPV6_REGEX.test(host)

  if (isLocalhost || isIPv4 || isIPv6) {
    // For localhost and IP addresses, keep the port
    return host
  }

  // For other domains, remove the port
  return host.split(':')[0]
}
