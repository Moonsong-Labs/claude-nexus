#!/usr/bin/env bun
import { loadCredentials } from '../../services/proxy/src/credentials'
import type { ClaudeCredentials } from '../../services/proxy/src/credentials'
import { resolve } from 'path'
import { existsSync } from 'fs'

// Constants
const EXIT_SUCCESS = 0
const EXIT_ERROR = 1
const TOKEN_PREVIEW_LENGTH = 20
const HOUR_IN_MS = 1000 * 60 * 60
const MINUTE_IN_MS = 1000 * 60

// ANSI color codes for better readability
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
} as const

// Error messages
const ERRORS = {
  NO_PATH: 'Error: No credential path provided',
  FILE_NOT_FOUND: 'Error: Credential file not found',
  LOAD_FAILED: 'Error: Failed to load credentials',
  INVALID_JSON: 'Error: Invalid JSON in credential file',
} as const

/**
 * Formats a token for display by showing only the first part
 * @param token - The token to format
 * @param length - Number of characters to show (default: 20)
 * @returns Formatted token string
 */
function formatToken(token: string | undefined, length: number = TOKEN_PREVIEW_LENGTH): string {
  if (!token) return 'missing'
  return token.substring(0, length) + '...'
}

/**
 * Formats duration in milliseconds to human-readable format
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 */
function formatDuration(ms: number): string {
  const hours = Math.floor(ms / HOUR_IN_MS)
  const minutes = Math.floor((ms % HOUR_IN_MS) / MINUTE_IN_MS)
  return `${hours}h ${minutes}m`
}

/**
 * Prints usage information to stderr
 */
function printUsage(): void {
  console.error('Usage: bun run scripts/check-oauth-status.ts <credential-path>')
  console.error(
    'Example: bun run scripts/check-oauth-status.ts credentials/example.com.credentials.json'
  )
}

/**
 * Checks and displays OAuth status for a credential file
 * @param credentialPath - Path to the credential file
 * @returns Exit code (0 for success, 1 for error)
 */
async function checkOAuthStatus(): Promise<number> {
  const credentialPath = process.argv[2]

  if (!credentialPath) {
    console.error(`${colors.red}${ERRORS.NO_PATH}${colors.reset}`)
    printUsage()
    return EXIT_ERROR
  }

  try {
    const fullPath = resolve(credentialPath)

    // Check if file exists
    if (!existsSync(fullPath)) {
      console.error(`${colors.red}${ERRORS.FILE_NOT_FOUND}: ${fullPath}${colors.reset}`)
      return EXIT_ERROR
    }

    const credentials = loadCredentials(fullPath)

    if (!credentials) {
      console.error(`${colors.red}${ERRORS.LOAD_FAILED}: ${fullPath}${colors.reset}`)
      return EXIT_ERROR
    }

    // Display general credential information
    console.log(`${colors.blue}Credential file:${colors.reset} ${fullPath}`)
    console.log(`${colors.blue}Type:${colors.reset} ${credentials.type}`)

    if (credentials.accountId) {
      console.log(`${colors.blue}Account ID:${colors.reset} ${credentials.accountId}`)
    }

    if (credentials.type === 'oauth' && credentials.oauth) {
      const oauth = credentials.oauth
      const now = Date.now()
      const expiresAt = oauth.expiresAt || 0
      const isExpired = now >= expiresAt
      const expiresIn = Math.max(0, expiresAt - now)

      console.log(`\n${colors.blue}OAuth Details:${colors.reset}`)
      console.log(`- Access Token: ${formatToken(oauth.accessToken)}`)
      console.log(`- Refresh Token: ${formatToken(oauth.refreshToken)}`)
      console.log(`- Expires At: ${expiresAt ? new Date(expiresAt).toISOString() : 'unknown'}`)

      // Color-coded status
      const statusColor = isExpired ? colors.red : colors.green
      console.log(`- Status: ${statusColor}${isExpired ? 'EXPIRED' : 'Valid'}${colors.reset}`)

      if (!isExpired) {
        console.log(`- Expires In: ${formatDuration(expiresIn)}`)
      } else {
        const expiredDuration = now - expiresAt
        console.log(`- Expired: ${formatDuration(expiredDuration)} ago`)
      }

      console.log(`- Scopes: ${oauth.scopes ? oauth.scopes.join(', ') : 'none'}`)
      console.log(`- Is Max: ${oauth.isMax || false}`)

      // Warnings and recommendations
      if (!oauth.refreshToken) {
        console.warn(
          `\n${colors.yellow}⚠️  WARNING: No refresh token available. Re-authentication will be required when access token expires.${colors.reset}`
        )
      }

      if (isExpired && oauth.refreshToken) {
        console.log(
          `\n${colors.yellow}ℹ️  Token is expired but has refresh token. The proxy should automatically refresh it.${colors.reset}`
        )
      } else if (isExpired && !oauth.refreshToken) {
        console.error(
          `\n${colors.red}❌ ERROR: Token is expired and no refresh token available. Re-authentication required!${colors.reset}`
        )
        console.log(
          `${colors.gray}Run: bun run scripts/oauth-login.ts ${credentialPath}${colors.reset}`
        )
        return EXIT_ERROR
      }
    } else if (credentials.type === 'api_key') {
      console.log(`\n${colors.blue}API Key:${colors.reset} ${formatToken(credentials.api_key)}`)
    }

    // Additional credential information
    if (credentials.client_api_key) {
      console.log(
        `\n${colors.blue}Client API Key (for proxy auth):${colors.reset} ${formatToken(credentials.client_api_key)}`
      )
    }

    if (credentials.slack) {
      console.log(
        `\n${colors.blue}Slack integration:${colors.reset} ${colors.green}✓ configured${colors.reset}`
      )
    }

    return EXIT_SUCCESS
  } catch (error) {
    console.error(`${colors.red}Error checking OAuth status:${colors.reset}`, error)
    return EXIT_ERROR
  }
}

// Main execution
checkOAuthStatus().then(process.exit)
