/**
 * OAuth Utilities for Claude API Authentication
 * 
 * This module contains OAuth-specific functionality including:
 * - PKCE flow implementation
 * - Authorization code exchange
 * - API key creation from OAuth tokens
 * - OAuth login flow orchestration
 * 
 * These utilities are primarily used by CLI scripts for setting up OAuth credentials.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import * as process from 'process'
import { randomBytes, createHash } from 'crypto'
import { ClaudeCredentials, OAuthCredentials } from './credentials.js'

// OAuth configuration constants
const DEFAULT_OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'

// OAuth token response type
interface OAuthTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope?: string
  is_max?: boolean
}

export const OAUTH_CONFIG = {
  clientId: process.env.CLAUDE_OAUTH_CLIENT_ID || DEFAULT_OAUTH_CLIENT_ID,
  authorizationUrl: 'https://claude.ai/oauth/authorize',
  tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
  redirectUri: 'https://console.anthropic.com/oauth/code/callback',
  scopes: ['org:create_api_key', 'user:profile', 'user:inference'],
  apiKeyEndpoint: 'https://api.anthropic.com/api/oauth/claude_cli/create_api_key',
  profileEndpoint: 'https://api.anthropic.com/api/claude_cli_profile',
  betaHeader: 'oauth-2025-04-20',
}

// PKCE helper functions
function base64URLEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function generateCodeVerifier(): string {
  return base64URLEncode(randomBytes(32))
}

function generateCodeChallenge(verifier: string): string {
  return base64URLEncode(createHash('sha256').update(verifier).digest())
}

/**
 * Generate OAuth authorization URL with PKCE parameters
 * @returns Object containing the authorization URL and PKCE verifier
 */
export function generateAuthorizationUrl(): {
  url: string
  verifier: string
} {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)

  const authUrl = new URL(OAUTH_CONFIG.authorizationUrl)
  authUrl.searchParams.set('code', 'true')
  authUrl.searchParams.set('client_id', OAUTH_CONFIG.clientId)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', OAUTH_CONFIG.redirectUri)
  authUrl.searchParams.set('scope', OAUTH_CONFIG.scopes.join(' '))
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state', codeVerifier) // Store verifier in state

  return {
    url: authUrl.toString(),
    verifier: codeVerifier,
  }
}

/**
 * Wait for user to complete OAuth flow and input authorization code
 * @returns Promise resolving to the authorization code
 */
export async function waitForAuthorizationCode(): Promise<string> {
  const readline = await import('readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve, reject) => {
    rl.question('\nEnter the authorization code: ', code => {
      rl.close()

      if (!code || code.trim().length === 0) {
        reject(new Error('No authorization code provided'))
        return
      }

      resolve(code.trim())
    })
  })
}

/**
 * Exchange authorization code for OAuth tokens
 *
 * Note: Anthropic's OAuth implementation returns the authorization code in a
 * non-standard format: "code#state" instead of separate query parameters.
 * This deviates from RFC 6749 but matches their actual implementation.
 * 
 * @param codeWithState - Authorization code in format "code#state"
 * @param codeVerifier - PKCE code verifier
 * @returns Promise resolving to OAuth credentials
 */
export async function exchangeCodeForTokens(
  codeWithState: string,
  codeVerifier: string
): Promise<OAuthCredentials> {
  try {
    // Split the code#state format (Anthropic-specific format)
    const [code, state] = codeWithState.split('#')

    if (!code || !state) {
      throw new Error('Invalid authorization code format. Expected format: code#state')
    }

    const response = await fetch(OAUTH_CONFIG.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        state,
        grant_type: 'authorization_code',
        client_id: OAUTH_CONFIG.clientId,
        redirect_uri: OAUTH_CONFIG.redirectUri,
        code_verifier: codeVerifier,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to exchange code for tokens:', response.status, errorText)
      throw new Error(`Failed to exchange code: ${response.status}`)
    }

    const data = (await response.json()) as OAuthTokenResponse

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || '',
      expiresAt: Date.now() + data.expires_in * 1000,
      scopes: data.scope ? data.scope.split(' ') : OAUTH_CONFIG.scopes,
      isMax: data.is_max || true,
    }
  } catch (err) {
    console.error('Failed to exchange code for tokens:', err instanceof Error ? err.message : String(err))
    throw err
  }
}

/**
 * Create API key using OAuth access token
 * @param accessToken - Valid OAuth access token
 * @returns Promise resolving to the API key string
 */
export async function createApiKey(accessToken: string): Promise<string> {
  try {
    const response = await fetch(OAUTH_CONFIG.apiKeyEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'anthropic-beta': OAUTH_CONFIG.betaHeader,
      },
      body: JSON.stringify({
        expiresAt: null,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to create API key:', response.status, errorText)
      throw new Error(`Failed to create API key: ${response.status}`)
    }

    const data = (await response.json()) as { key: string }
    return data.key
  } catch (err) {
    console.error('Failed to create API key:', err instanceof Error ? err.message : String(err))
    throw err
  }
}

/**
 * Save OAuth credentials to file
 * @param filePath - Path to save credentials
 * @param credentials - Credentials object to save
 */
async function saveOAuthCredentials(filePath: string, credentials: ClaudeCredentials) {
  if (filePath.startsWith('memory:') || credentials.type !== 'oauth') {
    return
  }

  try {

    // Resolve full path
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

    // Load existing file to preserve non-OAuth fields
    let existingData: Partial<ClaudeCredentials> = {}
    try {
      if (existsSync(fullPath)) {
        const content = readFileSync(fullPath, 'utf-8')
        existingData = JSON.parse(content)
      }
    } catch (err) {
      console.warn(`Could not read existing credential file for merging: ${err}`)
    }

    // Merge the OAuth data with existing data
    const mergedData = {
      ...existingData,
      ...credentials,
      // Preserve fields that might exist but aren't in ClaudeCredentials type
      accountId: existingData.accountId || credentials.accountId,
      client_api_key: existingData.client_api_key || credentials.client_api_key,
      slack: existingData.slack || credentials.slack,
    }

    writeFileSync(fullPath, JSON.stringify(mergedData, null, 2))
  } catch (err) {
    console.error(`Failed to save OAuth credentials to ${filePath}:`, err)
  }
}

/**
 * Perform complete OAuth login flow for a specific credential file
 * This allows setting up OAuth credentials for different domains
 * 
 * @param credentialPath - Path where credentials will be saved
 * @param createApiKeyFile - Whether to create a separate API key file
 */
export async function performOAuthLogin(
  credentialPath: string,
  createApiKeyFile: boolean = true
): Promise<void> {
  try {
    console.log('Starting OAuth login flow...')

    // Generate authorization URL
    const { url, verifier } = generateAuthorizationUrl()

    console.log('\nPlease visit the following URL to authorize:')
    console.log(url)
    console.log('\nAfter authorizing, you will see an authorization code.')
    console.log('Copy the entire code (it should contain a # character).')

    // Wait for user to complete authorization
    const code = await waitForAuthorizationCode()

    // Exchange code for tokens
    console.log('Exchanging authorization code for tokens...')
    const oauthCreds = await exchangeCodeForTokens(code, verifier)

    // Create credentials object
    const credentials: ClaudeCredentials = {
      type: 'oauth',
      oauth: oauthCreds,
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
        api_key: apiKey,
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

      console.log(`API key saved to: ${apiKeyPath}`)
    }
  } catch (err) {
    console.error('OAuth login failed:', err)
    throw err
  }
}