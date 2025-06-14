import { getCredentials, ClaudeCredentialResult } from '../credentials'
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
      // Get credentials for the domain
      const credentials = await getCredentials(context.host, context.apiKey)
      
      if (!credentials) {
        throw new AuthenticationError(
          'No valid credentials found',
          { domain: context.host, hasApiKey: !!context.apiKey }
        )
      }
      
      return this.createAuthResult(credentials)
      
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
   * Create auth result from credentials
   */
  private createAuthResult(credentials: ClaudeCredentialResult): AuthResult {
    const headers: Record<string, string> = {}
    
    if (credentials.type === 'api_key') {
      headers['x-api-key'] = credentials.key
      
      return {
        type: 'api_key',
        headers,
        key: credentials.key
      }
    } else {
      headers['Authorization'] = `Bearer ${credentials.key}`
      
      if (credentials.betaHeader) {
        headers['anthropic-beta'] = credentials.betaHeader
      }
      
      return {
        type: 'oauth',
        headers,
        key: credentials.key,
        betaHeader: credentials.betaHeader
      }
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