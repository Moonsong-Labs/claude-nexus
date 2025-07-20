/**
 * OAuth Credentials Manager
 *
 * IMPORTANT: This implementation uses in-memory state for refresh token management
 * and is designed for SINGLE-INSTANCE deployments only.
 *
 * For multi-instance deployments, the refresh token locking mechanism needs to be
 * replaced with a distributed lock using Redis or similar shared state store.
 *
 * Features:
 * - Concurrent refresh prevention (single-instance only)
 * - Negative caching for failed refreshes (5-second cooldown)
 * - Atomic credential saves (save before updating in-memory state)
 * - Automatic cleanup of stuck operations
 * - Metrics collection for observability
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import * as process from 'process'
import { container } from './container.js'
import type { RefreshMetrics } from './services/CredentialManager.js'

export interface OAuthCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scopes: string[]
  isMax: boolean
}

export interface SlackConfig {
  webhook_url?: string
  channel?: string
  username?: string
  icon_emoji?: string
  enabled?: boolean
}

export interface ClaudeCredentials {
  type: 'api_key' | 'oauth'
  accountId?: string // Unique identifier for the account (e.g., "acc_f9e1c2d3b4a5")
  api_key?: string
  oauth?: OAuthCredentials
  slack?: SlackConfig
  client_api_key?: string
}

export interface DomainCredentialMapping {
  [domain: string]: string // domain -> credential file path
}

// OAuth error response type
interface OAuthErrorResponse {
  error?: string
  error_description?: string
  error_uri?: string
}

// OAuth token response type
interface OAuthTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope?: string
  is_max?: boolean
}

// Error type with additional OAuth properties
interface OAuthError extends Error {
  status?: number
  errorCode?: string
  errorDescription?: string
}

// OAuth configuration constants
const DEFAULT_OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const OAUTH_BETA_HEADER = 'oauth-2025-04-20'
const TOKEN_REFRESH_BUFFER_MS = 60000 // Refresh 1 minute before expiry

// File system constants
const KEY_PREVIEW_LENGTH = 10
const DEFAULT_CREDENTIALS_DIR = 'credentials'

// Helper functions for cache management - delegate to the container's credential manager
function getCachedCredential(key: string): ClaudeCredentials | null {
  return container.getCredentialManager().getCachedCredential(key)
}

function setCachedCredential(key: string, credential: ClaudeCredentials): void {
  container.getCredentialManager().setCachedCredential(key, credential)
}

/**
 * Resolve a file path consistently across the codebase
 * @param filePath - The path to resolve
 * @returns The resolved absolute path
 */
function resolvePath(filePath: string): string {
  if (filePath.startsWith('~')) {
    return join(homedir(), filePath.slice(1))
  } else if (filePath.startsWith('/') || filePath.includes(':')) {
    return filePath
  } else {
    return join(process.cwd(), filePath)
  }
}


/**
 * Get credential file path for a domain
 * 
 * Resolves the credential file path for a given domain using the naming convention:
 * <domain>.credentials.json
 * 
 * @param domain - The domain to look up (e.g., 'example.com')
 * @param credentialsDir - Directory containing credential files (defaults to './credentials')
 * @returns Full path to the credential file if it exists, null otherwise
 * @example
 * getCredentialFileForDomain('api.example.com', './credentials')
 * // Returns: '/path/to/project/credentials/api.example.com.credentials.json'
 */
export function getCredentialFileForDomain(
  domain: string,
  credentialsDir: string | undefined
): string | null {
  if (!credentialsDir) {
    credentialsDir = DEFAULT_CREDENTIALS_DIR
  }

  // Construct the credential filename: <domain>.credentials.json
  const filename = `${domain}.credentials.json`

  // Resolve the credentials directory path
  const dirPath = resolvePath(credentialsDir)

  const filePath = join(dirPath, filename)

  // Check if the file exists
  if (existsSync(filePath)) {
    return filePath
  }

  return null
}

/**
 * Load credentials from a JSON file
 * 
 * Supports both file-based and in-memory credentials:
 * - File paths: Loads from disk with caching
 * - memory:* paths: Returns from in-memory cache only
 * 
 * Validates credential structure and warns about missing accountId.
 * 
 * @param filePath - Path to credential file (supports ~, absolute, and relative paths)
 * @returns Parsed credentials or null if invalid/not found
 * @example
 * loadCredentials('~/credentials/domain.credentials.json')
 * loadCredentials('memory:test-creds')
 */
export function loadCredentials(filePath: string): ClaudeCredentials | null {
  // Check cache first
  const cached = getCachedCredential(filePath)
  if (cached) {
    return cached
  }

  // Handle in-memory credentials
  if (filePath.startsWith('memory:')) {
    return getCachedCredential(filePath)
  }

  try {
    const fullPath = resolvePath(filePath)

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

    // Validate accountId (warn but don't fail for backward compatibility)
    if (!credentials.accountId) {
      console.warn(`Warning: Credential file missing accountId: ${fullPath}`)
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
    setCachedCredential(filePath, credentials)

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
    setCachedCredential(filePath, credentials)

    // Save to file using same path resolution logic
    const fullPath = resolvePath(filePath)

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
      // If we can't read existing data, we'll just save the new data
      console.warn(`Could not read existing credential file for merging: ${err}`)
    }

    // Merge the OAuth data with existing data, preserving other fields
    const mergedData = {
      ...existingData,
      ...credentials,
      // Explicitly preserve fields that might exist but aren't in ClaudeCredentials type
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
 * Refresh OAuth access token
 * 
 * Exchanges a refresh token for a new access token following OAuth 2.0 spec.
 * Includes Anthropic-specific beta header for OAuth support.
 * 
 * @param refreshToken - The OAuth refresh token
 * @returns New OAuth credentials with updated access token
 * @throws OAuthError with status and error details on failure
 */
export async function refreshToken(refreshToken: string): Promise<OAuthCredentials> {
  const TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token'
  const CLIENT_ID = process.env.CLAUDE_OAUTH_CLIENT_ID || DEFAULT_OAUTH_CLIENT_ID

  try {
    const response = await fetch(TOKEN_URL, {
      headers: {
        'Content-Type': 'application/json',
        'anthropic-beta': OAUTH_BETA_HEADER,
      },
      method: 'POST',
      body: JSON.stringify({
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (response.ok) {
      const payload = (await response.json()) as OAuthTokenResponse
      return {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token || refreshToken, // Keep old refresh token if not provided
        expiresAt: Date.now() + payload.expires_in * 1000, // Convert to timestamp
        scopes: payload.scope ? payload.scope.split(' ') : ['org:create_api_key', 'user:profile', 'user:inference'],
        isMax: payload.is_max || true,
      }
    }

    const errorText = await response.text()
    let errorData: OAuthErrorResponse = {}
    try {
      errorData = JSON.parse(errorText)
    } catch {
      // Not JSON, use raw text
    }

    console.error(`Failed to refresh token: ${response.status} ${response.statusText}`)
    if (errorText) {
      console.error('Error details:', errorText)
    }

    // Throw more detailed error
    const error = new Error(
      errorData.error_description ||
        errorData.error ||
        `Failed to refresh token: ${response.status} ${response.statusText}`
    ) as OAuthError
    error.status = response.status
    error.errorCode = errorData.error
    error.errorDescription = errorData.error_description
    throw error
  } catch (error) {
    // Re-throw if already an Error with details
    if (error instanceof Error && (error as OAuthError).status) {
      throw error
    }
    // Wrap network errors
    console.error('Network error during token refresh:', error)
    throw new Error(
      `Network error during token refresh: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Get API key or access token from credentials
 * 
 * This function handles both API key and OAuth credential types:
 * - For API keys: Returns the key directly
 * - For OAuth: Checks token expiration and refreshes automatically if needed
 * 
 * The OAuth refresh mechanism includes:
 * - Automatic refresh 1 minute before token expiry
 * - Concurrent refresh prevention (single instance)
 * - Failed refresh cooldown (5 seconds)
 * - Atomic credential file updates
 * 
 * @param credentialPath - Path to the credential file (absolute or relative)
 * @param debug - Enable debug logging for OAuth operations
 * @returns The API key or access token, or null if unavailable
 * @throws Never throws - returns null on any error
 */
export async function getApiKey(
  credentialPath: string | null,
  debug: boolean = false
): Promise<string | null> {
  if (!credentialPath) {
    return null
  }

  const credentials = loadCredentials(credentialPath)
  if (!credentials) {
    return null
  }

  if (credentials.type === 'api_key') {
    return credentials.api_key || null
  }

  if (credentials.type === 'oauth' && credentials.oauth) {
    return handleOAuthCredentials(credentialPath, credentials, debug)
  }

  return null
}

/**
 * Handle OAuth credentials with automatic token refresh
 * @internal
 */
async function handleOAuthCredentials(
  credentialPath: string,
  credentials: ClaudeCredentials,
  debug: boolean
): Promise<string | null> {
  try {
    const oauth = credentials.oauth
    if (!oauth) {
      return null
    }

    // Check if token needs refresh (refresh 1 minute before expiry)
    if (oauth.expiresAt && Date.now() >= oauth.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
        if (debug) {
          console.log(`OAuth token expired for ${credentialPath}, checking refresh...`)
        }

        if (!oauth.refreshToken) {
          console.error('No refresh token available for', credentialPath)
          console.error('OAuth credentials may need to be re-authenticated')
          return null
        }

        // Check if this refresh recently failed (negative cache)
        const failureCheck = container.getCredentialManager().hasRecentFailure(credentialPath)
        if (failureCheck.failed) {
          if (debug) {
            console.log(
              `[COOLDOWN] Skipping refresh for ${credentialPath}, recent failure: ${failureCheck.error}`
            )
          }
          return null
        }

        // Check if a refresh is already in progress for this credential
        const existingRefresh = container.getCredentialManager().getActiveRefresh(credentialPath)
        if (existingRefresh) {
          container.getCredentialManager().updateMetrics('concurrent')
          if (debug) {
            console.log(`[CONCURRENT] Waiting for existing refresh for ${credentialPath}`)
          } else {
            console.log(`OAuth refresh already in progress for ${credentialPath}, waiting...`)
          }
          return existingRefresh
        }

        // Create a new refresh promise
        const refreshPromise = (async () => {
          const startTime = Date.now()
          container.getCredentialManager().updateMetrics('attempt')

          try {
            if (debug) {
              console.log(`Starting OAuth refresh for ${credentialPath}`)
            }

            const newOAuth = await refreshToken(oauth.refreshToken)

            // Create updated credentials object
            const updatedCredentials = { ...credentials, oauth: newOAuth }

            // ATOMIC SAVE: Save first, then update in-memory
            try {
              await saveOAuthCredentials(credentialPath, updatedCredentials)

              // Only update in-memory state after successful save
              credentials.oauth = newOAuth

              // Update metrics
              const duration = Date.now() - startTime
              container.getCredentialManager().updateMetrics('success', duration)

              if (debug) {
                console.log(`OAuth token refreshed for ${credentialPath} in ${duration}ms`)
              }

              return newOAuth.accessToken
            } catch (saveError) {
              console.error(
                `Failed to save refreshed OAuth credentials for ${credentialPath}:`,
                saveError
              )
              // Don't update in-memory state if save failed
              throw new Error(
                `Failed to save credentials: ${saveError instanceof Error ? saveError.message : String(saveError)}`
              )
            }
          } catch (refreshError) {
            container.getCredentialManager().updateMetrics('failure')

            console.error(
              `Failed to refresh OAuth token for ${credentialPath}:`,
              refreshError instanceof Error ? refreshError.message : String(refreshError)
            )

            // Cache the failure to prevent thundering herd
            container
              .getCredentialManager()
              .recordFailedRefresh(
                credentialPath,
                refreshError instanceof Error ? refreshError.message : 'Unknown error'
              )

            // Check for specific error codes
            const oauthError = refreshError as OAuthError
            if (oauthError.errorCode === 'invalid_grant' || oauthError.status === 400) {
              console.error('Refresh token is invalid or expired. Re-authentication required.')
              console.error(`Please run: bun run scripts/oauth-login.ts ${credentialPath}`)
            }

            return null
          } finally {
            // Clean up tracking
            container.getCredentialManager().removeActiveRefresh(credentialPath)
          }
        })()

        // Store the refresh promise
        container.getCredentialManager().setActiveRefresh(credentialPath, refreshPromise)

        return refreshPromise
      }

    return oauth.accessToken || null
  } catch (err) {
    console.error(`Failed to refresh OAuth token for ${credentialPath}:`, err)
    return null
  }
}

/**
 * Get masked credential info for logging
 * 
 * Returns a safe representation of credentials for logging purposes:
 * - API keys: Shows last 10 characters only
 * - OAuth: Shows client ID
 * - Invalid/missing: Shows status
 * 
 * @param credentialPath - Path to credential file
 * @returns Masked credential identifier safe for logs
 * @example
 * getMaskedCredentialInfo('/path/to/creds.json')
 * // Returns: 'api_key:...abc123def' or 'oauth:client-id-here'
 */
export function getMaskedCredentialInfo(credentialPath: string | null): string {
  if (!credentialPath) {
    return 'none'
  }

  if (credentialPath.startsWith('memory:')) {
    return credentialPath
  }

  const credentials = loadCredentials(credentialPath)
  if (!credentials) {
    return `invalid:${credentialPath}`
  }

  if (credentials.type === 'api_key' && credentials.api_key) {
    const key = credentials.api_key
    if (key.length <= KEY_PREVIEW_LENGTH) {
      return `api_key:${key}`
    }
    return `api_key:...${key.slice(-KEY_PREVIEW_LENGTH)}`
  }

  if (credentials.type === 'oauth' && credentials.oauth) {
    return `oauth:${process.env.CLAUDE_OAUTH_CLIENT_ID || DEFAULT_OAUTH_CLIENT_ID}`
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

    // Check for accountId (warning only for backward compatibility)
    if (!credentials.accountId) {
      errors.push(`Warning: Missing accountId for domain '${domain}' in ${credPath}`)
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
          errors.push(
            `Invalid OAuth credential for domain '${domain}': missing accessToken and refreshToken`
          )
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
): Promise<{ domain: string; apiKey: string | null } | null> {
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
  if (!apiKey) {
    return null
  }

  const credentials = loadCredentials(credentialPath)
  if (!credentials) {
    return null
  }

  const headers: { [key: string]: string } = {
    Authorization: credentials.type === 'oauth' ? `Bearer ${apiKey}` : apiKey,
  }

  // Add beta header for OAuth requests
  if (credentials.type === 'oauth') {
    headers['anthropic-beta'] = OAUTH_BETA_HEADER
  }

  return headers
}


/**
 * Add in-memory credentials for testing or temporary use
 */
export function addMemoryCredentials(id: string, credentials: ClaudeCredentials): void {
  const memoryPath = `memory:${id}`
  setCachedCredential(memoryPath, credentials)
}

/**
 * Clear credential cache
 */
export function clearCredentialCache(): void {
  container.getCredentialManager().clearCredentialCache()
}

/**
 * Get current OAuth refresh metrics
 */
export function getRefreshMetrics(): RefreshMetrics & {
  currentActiveRefreshes: number
  currentFailedRefreshes: number
} {
  return container.getCredentialManager().getRefreshMetrics()
}
