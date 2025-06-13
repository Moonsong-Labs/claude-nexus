import { createServer, IncomingMessage, ServerResponse } from 'http'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import * as process from 'process'
import { randomBytes, createHash } from 'crypto'

export interface OAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  isMax: boolean;
}

export interface ClaudeCredentials {
  type: 'api_key' | 'oauth'
  api_key?: string
  oauth?: OAuthCredentials
}

export interface DomainCredentialMapping {
  [domain: string]: string // domain -> credential file path
}

// OAuth configuration - matching Claude CLI
const OAUTH_CONFIG = {
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  authorizationUrl: 'https://claude.ai/oauth/authorize',
  tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
  redirectUri: 'http://localhost:54545/callback',
  scopes: ['org:create_api_key', 'user:profile', 'user:inference'],
  apiKeyEndpoint: 'https://api.anthropic.com/api/oauth/claude_cli/create_api_key',
  profileEndpoint: 'https://api.anthropic.com/api/claude_cli_profile',
  betaHeader: 'oauth-2025-04-20'
}

// Cache for loaded credentials
const credentialCache = new Map<string, ClaudeCredentials>()

// PKCE helper functions
function base64URLEncode(buffer: Buffer): string {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function generateCodeVerifier(): string {
  return base64URLEncode(randomBytes(32))
}

function generateCodeChallenge(verifier: string): string {
  return base64URLEncode(createHash('sha256').update(verifier).digest())
}

/**
 * Parse domain credential mapping from environment variable
 */
export function parseDomainCredentialMapping(mappingStr: string | undefined): DomainCredentialMapping {
  if (!mappingStr) return {}
  
  try {
    const parsed = JSON.parse(mappingStr)
    const result: DomainCredentialMapping = {}
    
    for (const [domain, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        result[domain] = value
      }
    }
    
    return result
  } catch (err) {
    console.error('Failed to parse DOMAIN_CREDENTIAL_MAPPING:', err)
    return {}
  }
}

/**
 * Load credentials from a JSON file
 */
export function loadCredentials(filePath: string): ClaudeCredentials | null {
  // Check cache first
  if (credentialCache.has(filePath)) {
    return credentialCache.get(filePath)!
  }
  
  // Handle in-memory credentials
  if (filePath.startsWith('memory:')) {
    return credentialCache.get(filePath) || null
  }
  
  try {
    // Resolve path:
    // - If starts with ~, expand to home directory
    // - If absolute path (starts with / or contains :), use as-is
    // - Otherwise, treat as relative to current working directory
    let fullPath: string
    
    if (filePath.startsWith('~')) {
      fullPath = join(homedir(), filePath.slice(1))
    } else if (filePath.startsWith('/') || filePath.includes(':')) {
      fullPath = filePath
    } else {
      fullPath = join(process.cwd(), filePath)
    }
    
    if (!existsSync(fullPath)) {
      console.error(`Credential file not found: ${fullPath}`)
      return null
    }
    
    const content = readFileSync(fullPath, 'utf-8')
    const credentials = JSON.parse(content) as ClaudeCredentials
    
    // Validate credentials
    if (!credentials.type) {
      console.error(`Invalid credential file (missing type): ${fullPath}`)
      return null
    }
    
    if (credentials.type === 'api_key' && !credentials.api_key) {
      console.error(`Invalid API key credential file: ${fullPath}`)
      return null
    }
    
    if (credentials.type === 'oauth' && !credentials.oauth) {
      console.error(`Invalid OAuth credential file: ${fullPath}`)
      return null
    }
    
    // Cache the credentials
    credentialCache.set(filePath, credentials)
    
    return credentials
  } catch (err) {
    console.error(`Failed to load credentials from ${filePath}:`, err)
    return null
  }
}

/**
 * Save updated OAuth credentials back to file
 */
async function saveOAuthCredentials(filePath: string, credentials: ClaudeCredentials) {
  if (filePath.startsWith('memory:') || credentials.type !== 'oauth') {
    return
  }
  
  try {
    // Update cache
    credentialCache.set(filePath, credentials)
    
    // Save to file using same path resolution logic
    let fullPath: string
    
    if (filePath.startsWith('~')) {
      fullPath = join(homedir(), filePath.slice(1))
    } else if (filePath.startsWith('/') || filePath.includes(':')) {
      fullPath = filePath
    } else {
      fullPath = join(process.cwd(), filePath)
    }
    
    // Ensure directory exists
    mkdirSync(dirname(fullPath), { recursive: true })
    
    writeFileSync(fullPath, JSON.stringify(credentials, null, 2))
  } catch (err) {
    console.error(`Failed to save OAuth credentials to ${filePath}:`, err)
  }
}

/**
 * Refresh OAuth access token
 */
export async function refreshToken(refreshToken: string): Promise<OAuthCredentials> {
  const TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
  const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
  
  const response = await fetch(TOKEN_URL, {
    headers: { "Content-Type": "application/json" },
    method: "POST",
    body: JSON.stringify({
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (response.ok) {
    const payload = await response.json() as any;
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token || refreshToken, // Keep old refresh token if not provided
      expiresAt: Date.now() + (payload.expires_in * 1000), // Convert to timestamp
      scopes: payload.scope ? payload.scope.split(' ') : OAUTH_CONFIG.scopes,
      isMax: payload.is_max || false
    };
  }
  
  console.error(`Failed to refresh token: ${response.status} ${response.statusText}`);
  const errorText = await response.text();
  if (errorText) {
    console.error('Error details:', errorText);
  }
  throw new Error("Failed to refresh token");
}

/**
 * Get API key or access token from credentials
 * Handles OAuth token refresh automatically
 */
export async function getApiKey(credentialPath: string | null, debug: boolean = false): Promise<string | null> {
  if (!credentialPath) return null
  
  const credentials = loadCredentials(credentialPath)
  if (!credentials) return null
  
  if (credentials.type === 'api_key') {
    return credentials.api_key || null
  }
  
  if (credentials.type === 'oauth' && credentials.oauth) {
    try {
      const oauth = credentials.oauth
      
      // Check if token needs refresh (refresh 1 minute before expiry)
      if (oauth.expiresAt && Date.now() >= oauth.expiresAt - 60000) {
        if (debug) {
          console.log(`OAuth token expired for ${credentialPath}, refreshing...`)
        }
        
        if (!oauth.refreshToken) {
          console.error('No refresh token available')
          return null
        }
        
        const newOAuth = await refreshToken(oauth.refreshToken)
        
        // Update credentials with new OAuth data
        credentials.oauth = newOAuth
        
        // Save updated credentials
        await saveOAuthCredentials(credentialPath, credentials)
        
        if (debug) {
          console.log(`OAuth token refreshed for ${credentialPath}`)
        }
        
        return newOAuth.accessToken
      }
      
      return oauth.accessToken || null
    } catch (err) {
      console.error(`Failed to refresh OAuth token for ${credentialPath}:`, err)
      return null
    }
  }
  
  return null
}

/**
 * Get masked credential info for logging
 */
export function getMaskedCredentialInfo(credentialPath: string | null): string {
  if (!credentialPath) return 'none'
  
  if (credentialPath.startsWith('memory:')) {
    return credentialPath
  }
  
  const credentials = loadCredentials(credentialPath)
  if (!credentials) return `invalid:${credentialPath}`
  
  if (credentials.type === 'api_key' && credentials.api_key) {
    const key = credentials.api_key
    if (key.length <= 10) return `api_key:${key}`
    return `api_key:...${key.slice(-10)}`
  }
  
  if (credentials.type === 'oauth' && credentials.oauth) {
    return `oauth:${OAUTH_CONFIG.clientId}`
  }
  
  return `unknown:${credentialPath}`
}

/**
 * Validate all credential files in the domain mapping
 * Returns an array of validation errors
 */
export function validateCredentialMapping(mapping: DomainCredentialMapping): string[] {
  const errors: string[] = []
  
  for (const [domain, credPath] of Object.entries(mapping)) {
    const credentials = loadCredentials(credPath)
    
    if (!credentials) {
      errors.push(`Missing or invalid credential file for domain '${domain}': ${credPath}`)
      continue
    }
    
    if (credentials.type === 'api_key') {
      if (!credentials.api_key) {
        errors.push(`Invalid API key credential for domain '${domain}': missing api_key field`)
      }
    } else if (credentials.type === 'oauth') {
      if (!credentials.oauth) {
        errors.push(`Invalid OAuth credential for domain '${domain}': missing oauth field`)
      } else {
        const oauth = credentials.oauth
        if (!oauth.accessToken && !oauth.refreshToken) {
          errors.push(`Invalid OAuth credential for domain '${domain}': missing accessToken and refreshToken`)
        }
      }
    } else {
      errors.push(`Invalid credential type for domain '${domain}': ${credentials.type}`)
    }
  }
  
  return errors
}

/**
 * Get the first available credential from the mapping
 */
export async function getFirstAvailableCredential(
  mapping: DomainCredentialMapping,
  debug: boolean = false
): Promise<{ domain: string, apiKey: string | null } | null> {
  for (const [domain, credPath] of Object.entries(mapping)) {
    const apiKey = await getApiKey(credPath, debug)
    if (apiKey) {
      return { domain, apiKey }
    }
  }
  return null
}

/**
 * Get authorization header for API requests for a specific domain
 */
export async function getAuthorizationHeaderForDomain(
  mapping: DomainCredentialMapping, 
  domain: string, 
  debug: boolean = false
): Promise<{ [key: string]: string } | null> {
  const credentialPath = mapping[domain]
  if (!credentialPath) {
    if (debug) {
      console.log(`No credential mapping found for domain: ${domain}`)
    }
    return null
  }
  
  const apiKey = await getApiKey(credentialPath, debug)
  if (!apiKey) return null
  
  const credentials = loadCredentials(credentialPath)
  if (!credentials) return null
  
  const headers: { [key: string]: string } = {
    'Authorization': credentials.type === 'oauth' ? `Bearer ${apiKey}` : apiKey
  }
  
  // Add beta header for OAuth requests
  if (credentials.type === 'oauth') {
    headers['anthropic-beta'] = OAUTH_CONFIG.betaHeader
  }
  
  return headers
}

/**
 * Start OAuth flow and get authorization code
 */
async function startOAuthFlow(): Promise<{ code: string, codeVerifier: string }> {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = base64URLEncode(randomBytes(16))
  
  return new Promise((resolve, reject) => {
    // Create local server to receive callback
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url!, `http://localhost:54545`)
      
      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code')
        const receivedState = url.searchParams.get('state')
        
        if (code && receivedState === state) {
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end('<html><body><h1>Authorization successful!</h1><p>You can close this window.</p></body></html>')
          
          server.close()
          resolve({ code, codeVerifier })
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end('<html><body><h1>Authorization failed!</h1></body></html>')
          
          server.close()
          reject(new Error('Invalid authorization response'))
        }
      } else {
        res.writeHead(404)
        res.end()
      }
    })
    
    server.listen(54545, () => {
      // Build authorization URL
      const authUrl = new URL(OAUTH_CONFIG.authorizationUrl)
      authUrl.searchParams.append('response_type', 'code')
      authUrl.searchParams.append('client_id', OAUTH_CONFIG.clientId)
      authUrl.searchParams.append('redirect_uri', OAUTH_CONFIG.redirectUri)
      authUrl.searchParams.append('scope', OAUTH_CONFIG.scopes.join(' '))
      authUrl.searchParams.append('state', state)
      authUrl.searchParams.append('code_challenge', codeChallenge)
      authUrl.searchParams.append('code_challenge_method', 'S256')
      
      console.log('\nPlease visit the following URL to authorize:')
      console.log(authUrl.toString())
      console.log('\nWaiting for authorization...')
    })
    
    // Timeout after 5 minutes
    setTimeout(() => {
      server.close()
      reject(new Error('Authorization timeout'))
    }, 5 * 60 * 1000)
  })
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<OAuthCredentials> {
  try {
    const response = await fetch(OAUTH_CONFIG.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-beta': OAUTH_CONFIG.betaHeader
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: OAUTH_CONFIG.redirectUri,
        client_id: OAUTH_CONFIG.clientId,
        code_verifier: codeVerifier,
        state: base64URLEncode(randomBytes(16))
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to exchange code for tokens:', response.status, errorText)
      throw new Error(`Failed to exchange code: ${response.status}`)
    }
    
    const data = await response.json() as any
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
      scopes: data.scope ? data.scope.split(' ') : OAUTH_CONFIG.scopes,
      isMax: data.is_max || false
    }
  } catch (err: any) {
    console.error('Failed to exchange code for tokens:', err.message)
    throw err
  }
}

/**
 * Create API key using OAuth token
 */
async function createApiKey(accessToken: string): Promise<string> {
  try {
    const response = await fetch(OAUTH_CONFIG.apiKeyEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'anthropic-beta': OAUTH_CONFIG.betaHeader
      },
      body: JSON.stringify({
        expiresAt: null
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to create API key:', response.status, errorText)
      throw new Error(`Failed to create API key: ${response.status}`)
    }
    
    const data = await response.json() as any
    return data.key
  } catch (err: any) {
    console.error('Failed to create API key:', err.message)
    throw err
  }
}

/**
 * Perform OAuth login flow for a specific credential file
 * This allows setting up OAuth credentials for different domains
 */
export async function performOAuthLogin(credentialPath: string, createApiKeyFile: boolean = true): Promise<void> {
  try {
    console.log('Starting OAuth login flow...')
    
    // Start OAuth flow
    const { code, codeVerifier } = await startOAuthFlow()
    
    // Exchange code for tokens
    console.log('Exchanging authorization code for tokens...')
    const oauthCreds = await exchangeCodeForTokens(code, codeVerifier)
    
    // Create credentials object
    const credentials: ClaudeCredentials = {
      type: 'oauth',
      oauth: oauthCreds
    }
    
    // Save OAuth credentials
    await saveOAuthCredentials(credentialPath, credentials)
    
    console.log(`OAuth credentials saved to: ${credentialPath}`)
    
    // Optionally create an API key
    if (createApiKeyFile) {
      console.log('Creating API key from OAuth token...')
      const apiKey = await createApiKey(oauthCreds.accessToken)
      
      // Save as API key credential
      const apiKeyCredentials: ClaudeCredentials = {
        type: 'api_key',
        api_key: apiKey
      }
      
      const apiKeyPath = credentialPath.replace('.json', '-apikey.json')
      
      // Resolve full path before saving
      let fullPath: string
      if (apiKeyPath.startsWith('~')) {
        fullPath = join(homedir(), apiKeyPath.slice(1))
      } else if (apiKeyPath.startsWith('/') || apiKeyPath.includes(':')) {
        fullPath = apiKeyPath
      } else {
        fullPath = join(process.cwd(), apiKeyPath)
      }
      
      mkdirSync(dirname(fullPath), { recursive: true })
      writeFileSync(fullPath, JSON.stringify(apiKeyCredentials, null, 2))
      credentialCache.set(apiKeyPath, apiKeyCredentials)
      
      console.log(`API key saved to: ${apiKeyPath}`)
    }
  } catch (err) {
    console.error('OAuth login failed:', err)
    throw err
  }
}

/**
 * Add in-memory credentials for testing or temporary use
 */
export function addMemoryCredentials(id: string, credentials: ClaudeCredentials): void {
  const memoryPath = `memory:${id}`
  credentialCache.set(memoryPath, credentials)
}

/**
 * Clear credential cache
 */
export function clearCredentialCache(): void {
  credentialCache.clear()
}