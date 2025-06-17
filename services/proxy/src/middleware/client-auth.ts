import { Context, Next } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { timingSafeEqual as cryptoTimingSafeEqual } from 'crypto'
import { logger } from './logger.js'
import { container } from '../container.js'

/**
 * Client API Authentication Middleware
 * Validates domain-specific API keys for proxy access
 */
export function clientAuthMiddleware() {
  return bearerAuth({
    verifyToken: async (token: string, c: Context) => {
      const domain = c.get('domain')
      const requestId = c.get('requestId')
      
      if (!domain) {
        logger.error('Client auth middleware: Domain not found in context', {
          requestId,
          path: c.req.path,
        })
        return false
      }

      try {
        // Get the authentication service from container
        const authService = container.getAuthenticationService()
        const clientApiKey = await authService.getClientApiKey(domain)

        if (!clientApiKey) {
          logger.warn('Client auth middleware: No client API key configured', {
            requestId,
            domain,
            path: c.req.path,
            ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
          })
          return false
        }

        // Use timing-safe comparison with SHA-256 hashing to prevent timing attacks
        // This ensures both inputs are always the same length (32 bytes)
        const encoder = new TextEncoder()
        const tokenBuffer = encoder.encode(token)
        const keyBuffer = encoder.encode(clientApiKey)
        
        // Hash both values before comparison
        const tokenHash = await crypto.subtle.digest('SHA-256', tokenBuffer)
        const keyHash = await crypto.subtle.digest('SHA-256', keyBuffer)
        
        // Convert ArrayBuffer to Buffer for Node's timingSafeEqual
        const tokenHashBuffer = Buffer.from(tokenHash)
        const keyHashBuffer = Buffer.from(keyHash)
        
        const isValid = cryptoTimingSafeEqual(tokenHashBuffer, keyHashBuffer)
        
        if (!isValid) {
          logger.warn('Client auth middleware: Invalid API key', {
            requestId,
            domain,
            path: c.req.path,
            ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
          })
          return false
        }

        logger.debug('Client auth middleware: Authentication successful', {
          requestId,
          domain,
        })
        
        return true
      } catch (error) {
        logger.error('Client auth middleware: Error verifying token', {
          requestId,
          domain,
          error: error instanceof Error ? { message: error.message } : { message: String(error) },
        })
        return false
      }
    },
    realm: 'Claude Nexus Proxy',
  })
}