import { getApiKey, getAuthorizationHeaderForDomain, DomainCredentialMapping, loadCredentials, SlackConfig } from '../credentials'
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
  private domainMapping: DomainCredentialMapping = {}
  private warnedDomains = new Set<string>()
  
  constructor(
    private defaultApiKey?: string,
    private credentialsDir: string = process.env.CREDENTIALS_DIR || 'credentials'
  ) {
    // Initialize domain mapping if needed
    // For now, we'll handle credentials dynamically
  }
  
  /**
   * Authenticate a request and return auth headers
   */
  async authenticate(context: RequestContext): Promise<AuthResult> {
    try {
      // Priority order:
      // 1. Domain-specific credentials from file
      // 2. API key from request header
      // 3. Default API key from environment
      
      // First, check if domain has a credential file
      const credentialPath = `${this.credentialsDir}/${context.host}.credentials.json`
      
      // Try to load credentials without accessing the file system first
      try {
        const credentials = loadCredentials(credentialPath)
        
        if (credentials) {
          logger.debug(`Found credentials file for domain`, {
            requestId: context.requestId,
            domain: context.host,
            credentialType: credentials.type
          })
          
          // Get API key from credentials
          const apiKey = await getApiKey(credentialPath)
          if (apiKey) {
            // Return auth result based on credential type
            if (credentials.type === 'oauth') {
              logger.debug(`Using OAuth credentials from file`, {
                requestId: context.requestId,
                domain: context.host,
                hasRefreshToken: !!credentials.oauth?.refreshToken
              })
              
              return {
                type: 'oauth',
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'anthropic-beta': 'oauth-2025-04-20'
                },
                key: apiKey,
                betaHeader: 'oauth-2025-04-20'
              }
            } else {
              logger.debug(`Using API key from credential file`, {
                requestId: context.requestId,
                domain: context.host,
                keyPreview: apiKey.substring(0, 20) + '****'
              })
              
              return {
                type: 'api_key',
                headers: {
                  'x-api-key': apiKey
                },
                key: apiKey
              }
            }
          }
        }
      } catch (e) {
        // Credential file doesn't exist or couldn't be loaded, continue to fallback options
        if (!this.warnedDomains.has(context.host)) {
          logger.debug(`No credential file found for domain: ${context.host}`, {
            expectedPath: credentialPath,
            credentialsDir: this.credentialsDir
          })
          this.warnedDomains.add(context.host)
        }
      }
      
      // Fallback to request API key or default
      if (context.apiKey || this.defaultApiKey) {
        const apiKey = context.apiKey || this.defaultApiKey || ''
        const source = context.apiKey ? 'request header' : 'default API key'
        
        logger.debug(`Using ${source} for authentication (no domain credentials found)`, {
          requestId: context.requestId,
          domain: context.host,
          authType: apiKey.startsWith('Bearer ') ? 'oauth' : 'api_key',
          keyPreview: apiKey.substring(0, 20) + '****'
        })
        
        // Check if it's Bearer token (OAuth) or API key
        if (apiKey.startsWith('Bearer ')) {
          return {
            type: 'oauth',
            headers: {
              'Authorization': apiKey,
              'anthropic-beta': 'oauth-2025-04-20'
            },
            key: apiKey.replace('Bearer ', ''),
            betaHeader: 'oauth-2025-04-20'
          }
        } else {
          return {
            type: 'api_key',
            headers: {
              'x-api-key': apiKey
            },
            key: apiKey
          }
        }
      }
      
      // No credentials found anywhere
      throw new AuthenticationError(
        'No valid credentials found',
        { 
          domain: context.host, 
          hasApiKey: false,
          credentialPath,
          hint: 'Create a credential file or pass API key in Authorization header'
        }
      )
      
    } catch (error) {
      logger.error('Authentication failed', {
        requestId: context.requestId,
        domain: context.host,
        error: error instanceof Error ? {
          message: error.message,
          code: (error as any).code
        } : { message: String(error) }
      })
      
      if (error instanceof AuthenticationError) {
        throw error
      }
      
      throw new AuthenticationError(
        'Authentication failed',
        { originalError: error instanceof Error ? error.message : String(error) }
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
  
  /**
   * Get Slack configuration for a domain
   */
  async getSlackConfig(domain: string): Promise<SlackConfig | null> {
    const credentialPath = `${this.credentialsDir}/${domain}.credentials.json`
    
    try {
      const credentials = loadCredentials(credentialPath)
      // Return slack config if it exists and is not explicitly disabled
      if (credentials?.slack && credentials.slack.enabled !== false) {
        return credentials.slack
      }
    } catch (error) {
      // Ignore errors - domain might not have credentials
    }
    
    return null
  }
}