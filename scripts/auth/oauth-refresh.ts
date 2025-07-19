#!/usr/bin/env bun
import {
  loadCredentials,
  refreshToken,
  type OAuthCredentials,
} from '../../services/proxy/src/credentials'
import { resolve, dirname } from 'path'
import { writeFileSync, mkdirSync, readFileSync } from 'fs'

// Constants
const TOKEN_PREVIEW_LENGTH = 20
const EXPIRY_WARNING_THRESHOLD_MS = 60000 // 1 minute

// Types
interface CliArguments {
  credentialPath: string
  forceRefresh: boolean
}

type TokenStatus = 'EXPIRED' | 'EXPIRING_SOON' | 'VALID'

interface RefreshError extends Error {
  status?: number
  errorCode?: string
  errorDescription?: string
}

// Helper functions
function parseCliArguments(): CliArguments {
  const credentialPath = process.argv[2]
  const forceRefresh = process.argv[3] === '--force'

  if (!credentialPath) {
    console.error('Usage: bun run scripts/oauth-refresh.ts <credential-path> [--force]')
    console.error(
      'Example: bun run scripts/oauth-refresh.ts credentials/example.com.credentials.json'
    )
    console.error('\nOptions:')
    console.error('  --force    Force refresh even if token is not expired')
    process.exit(1)
  }

  return { credentialPath, forceRefresh }
}

function getTokenStatus(expiresAt: number): TokenStatus {
  const now = Date.now()
  if (now >= expiresAt) return 'EXPIRED'
  if (now >= expiresAt - EXPIRY_WARNING_THRESHOLD_MS) return 'EXPIRING_SOON'
  return 'VALID'
}

function formatTokenExpiryTime(expiresIn: number): string {
  const hours = Math.floor(expiresIn / (1000 * 60 * 60))
  const minutes = Math.floor((expiresIn % (1000 * 60 * 60)) / (1000 * 60))
  return `${hours}h ${minutes}m`
}

function truncateToken(token: string | undefined): string {
  if (!token) return 'missing'
  return token.substring(0, TOKEN_PREVIEW_LENGTH) + '...'
}

function displayOAuthStatus(oauth: OAuthCredentials, label: string): void {
  const status = getTokenStatus(oauth.expiresAt || 0)
  const expiresIn = oauth.expiresAt - Date.now()

  console.log(`\n${label}:`)
  console.log(`- Access Token: ${truncateToken(oauth.accessToken)}`)
  console.log(`- Refresh Token: ${truncateToken(oauth.refreshToken)}`)
  console.log(
    `- Expires At: ${oauth.expiresAt ? new Date(oauth.expiresAt).toISOString() : 'unknown'}`
  )
  console.log(`- Status: ${status}`)

  if (status === 'VALID' && expiresIn > 0) {
    console.log(`- Expires In: ${formatTokenExpiryTime(expiresIn)}`)
  }

  if (oauth.scopes) {
    console.log(`- Scopes: ${oauth.scopes.join(', ')}`)
  }

  if ('isMax' in oauth) {
    console.log(`- Is Max: ${oauth.isMax}`)
  }
}

async function refreshOAuthToken() {
  const { credentialPath, forceRefresh } = parseCliArguments()

  try {
    const fullPath = resolve(credentialPath)
    console.log(`Loading credentials from: ${fullPath}`)

    // Load the credentials
    const credentials = loadCredentials(fullPath)

    if (!credentials) {
      console.error(`Failed to load credentials from: ${fullPath}`)
      process.exit(1)
    }

    if (credentials.type !== 'oauth' || !credentials.oauth) {
      console.error('This script only works with OAuth credentials')
      console.error(`Found credential type: ${credentials.type}`)
      process.exit(1)
    }

    const oauth = credentials.oauth
    const status = getTokenStatus(oauth.expiresAt || 0)

    displayOAuthStatus(oauth, 'Current OAuth status')

    if (status === 'VALID' && !forceRefresh) {
      console.log('\nToken is still valid. Use --force to refresh anyway.')
      process.exit(0)
    }

    if (!oauth.refreshToken) {
      console.error('\nERROR: No refresh token available. Re-authentication required.')
      console.error(`Run: bun run scripts/oauth-login.ts ${credentialPath}`)
      process.exit(1)
    }

    // Perform the refresh
    console.log('\nRefreshing OAuth token...')
    const startTime = Date.now()

    try {
      const newOAuth = await refreshToken(oauth.refreshToken)

      // Update credentials with new OAuth data
      credentials.oauth = newOAuth

      // Load existing file to preserve non-OAuth fields
      let existingData: any = {}
      try {
        const content = readFileSync(fullPath, 'utf-8')
        existingData = JSON.parse(content)
      } catch (err) {
        // If we can't read existing data, we'll just save the new data
      }

      // Merge the OAuth data with existing data, preserving other fields
      const mergedCredentials = {
        ...existingData,
        ...credentials,
        // Explicitly preserve fields that might exist
        client_api_key: existingData.client_api_key,
        slack: existingData.slack,
      }

      // Save updated credentials
      mkdirSync(dirname(fullPath), { recursive: true })
      writeFileSync(fullPath, JSON.stringify(mergedCredentials, null, 2))

      const refreshTime = Date.now() - startTime

      console.log(`\n✅ Token refreshed successfully in ${refreshTime}ms`)
      displayOAuthStatus(newOAuth, 'New OAuth status')
      console.log(`\nCredentials saved to: ${fullPath}`)
    } catch (error) {
      handleRefreshError(error as RefreshError, credentialPath)
    }
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

function handleRefreshError(error: RefreshError, credentialPath: string): never {
  console.error('\n❌ Failed to refresh token:', error.message)

  if (error.errorCode === 'invalid_grant' || error.status === 400) {
    console.error('\nThe refresh token is invalid or has been revoked.')
    console.error('You need to re-authenticate to get new credentials.')
    console.error(`\nRun: bun run scripts/oauth-login.ts ${credentialPath}`)
  } else if (error.status) {
    console.error(`\nHTTP Status: ${error.status}`)
    console.error(`Error Code: ${error.errorCode || 'unknown'}`)
    console.error(`Description: ${error.errorDescription || 'No description provided'}`)
  }

  process.exit(1)
}

refreshOAuthToken()
