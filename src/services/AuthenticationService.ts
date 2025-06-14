import { getApiKey, getAuthorizationHeaderForDomain } from '../credentials'
import { AuthenticationError } from '../types/errors'
import { RequestContext } from '../domain/value-objects/RequestContext'
import { logger } from '../middleware/logger'

export interface AuthResult {
  type: 'api_key' | 'oauth'
  headers: Record<string, string>
  key: string
  betaHeader?: string
}

/**
 * Service responsible for authentication logic
 * Handles API keys, OAuth tokens, and credential resolution
 */
export class AuthenticationService {
  constructor(
    private defaultApiKey?: string,
    private credentialsDir: string = process.env.CREDENTIALS_DIR || 'credentials'
  ) {}
  
  /**
   * Authenticate a request and return auth headers
   */
  async authenticate(context: RequestContext): Promise<AuthResult> {
    try {
      // Get authorization header for the domain
      const authHeader = await getAuthorizationHeaderForDomain(
        context.host, 
        context.apiKey || this.defaultApiKey
      )
      
      if (!authHeader) {
        throw new AuthenticationError(
          'No valid credentials found',
          { domain: context.host, hasApiKey: !!context.apiKey }
        )
      }
      
      // Parse the authorization header to determine type
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '')
        return {
          type: 'oauth',
          headers: {
            'Authorization': authHeader,
            'anthropic-beta': 'oauth-2025-04-20'
          },
          key: token,
          betaHeader: 'oauth-2025-04-20'
        }
      } else {
        // API key
        return {
          type: 'api_key',
          headers: {
            'x-api-key': authHeader
          },
          key: authHeader
        }
      }
      
    } catch (error) {
      logger.error('Authentication failed', {
        requestId: context.requestId,
        domain: context.host,
        error: {
          message: error.message,
          code: error.code
        }
      })
      
      if (error instanceof AuthenticationError) {
        throw error
      }
      
      throw new AuthenticationError(
        'Authentication failed',
        { originalError: error.message }
      )
    }
  }
  
  /**
   * Check if a request has valid authentication
   */
  hasAuthentication(context: RequestContext): boolean {
    return !!(context.apiKey || this.defaultApiKey)
  }
  
  /**
   * Get masked credential info for logging
   */
  getMaskedCredentialInfo(auth: AuthResult): string {
    const maskedKey = auth.key.substring(0, 10) + '****'
    return `${auth.type}:${maskedKey}`
  }
}