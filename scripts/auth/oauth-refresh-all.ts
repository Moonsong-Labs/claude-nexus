#!/usr/bin/env bun
/**
 * OAuth Token Refresh Utility for All Credentials
 *
 * This script refreshes all OAuth tokens in the credentials directory that are
 * expired or about to expire. It provides a dry-run mode for safe testing.
 *
 * Usage:
 *   bun run scripts/auth/oauth-refresh-all.ts [credentials-dir] [--dry-run]
 *
 * Example:
 *   bun run scripts/auth/oauth-refresh-all.ts credentials
 *   bun run scripts/auth/oauth-refresh-all.ts credentials --dry-run
 *
 * Options:
 *   credentials-dir  Directory containing credential files (default: 'credentials')
 *   --dry-run       Preview changes without modifying files
 */

import { readdirSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { resolve, join, dirname } from 'path'
import {
  loadCredentials,
  refreshToken,
  type ClaudeCredentials,
  type OAuthCredentials,
} from '../../services/proxy/src/credentials'

// Constants
const TOKEN_EXPIRY_BUFFER_MS = 300000 // 5 minutes before expiry
const EXIT_CODE_SUCCESS = 0
const EXIT_CODE_FAILURE = 1

// Types
interface RefreshResults {
  total: number
  oauth: number
  apiKey: number
  refreshed: number
  failed: number
  skipped: number
  errors: Array<{ file: string; error: string }>
}

interface CliArguments {
  credentialsDir: string
  dryRun: boolean
  help: boolean
}

type TokenStatus = 'EXPIRED' | 'EXPIRING_SOON' | 'VALID'

// Helper Functions
function parseCliArguments(): CliArguments {
  const args = process.argv.slice(2)
  const help = args.includes('--help') || args.includes('-h')
  const dryRun = args.includes('--dry-run')
  const credentialsDir = args.find(arg => !arg.startsWith('--')) || 'credentials'

  return { credentialsDir, dryRun, help }
}

function showUsage(): void {
  console.log('OAuth Token Refresh Utility for All Credentials\n')
  console.log('Usage:')
  console.log('  bun run scripts/auth/oauth-refresh-all.ts [credentials-dir] [options]\n')
  console.log('Options:')
  console.log('  --dry-run    Preview changes without modifying files')
  console.log('  --help, -h   Show this help message\n')
  console.log('Examples:')
  console.log('  bun run scripts/auth/oauth-refresh-all.ts credentials')
  console.log('  bun run scripts/auth/oauth-refresh-all.ts credentials --dry-run')
}

function validateCredentialsDirectory(dir: string): void {
  const fullPath = resolve(dir)
  if (!existsSync(fullPath)) {
    console.error(`Error: Credentials directory does not exist: ${fullPath}`)
    process.exit(EXIT_CODE_FAILURE)
  }
}

function getTokenStatus(expiresAt: number): TokenStatus {
  const now = Date.now()
  if (now >= expiresAt) return 'EXPIRED'
  if (now >= expiresAt - TOKEN_EXPIRY_BUFFER_MS) return 'EXPIRING_SOON'
  return 'VALID'
}

function formatTimeRemaining(expiresAt: number): string {
  const expiresIn = expiresAt - Date.now()
  const hours = Math.floor(expiresIn / (1000 * 60 * 60))
  const minutes = Math.floor((expiresIn % (1000 * 60 * 60)) / (1000 * 60))
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

function printResults(results: RefreshResults, dryRun: boolean): void {
  console.log('\n\nSummary')
  console.log('=======')
  console.log(`Total files: ${results.total}`)
  console.log(`- OAuth: ${results.oauth}`)
  console.log(`- API Key: ${results.apiKey}`)
  console.log(`\nProcessed OAuth credentials:`)
  console.log(`- Refreshed: ${results.refreshed}`)
  console.log(`- Skipped (valid): ${results.skipped - results.apiKey}`)
  console.log(`- Failed: ${results.failed}`)

  if (results.errors.length > 0) {
    console.log('\nErrors:')
    results.errors.forEach(({ file, error }) => {
      console.log(`- ${file}: ${error}`)
    })
  }

  if (dryRun) {
    console.log('\n⚠️  This was a dry run. No changes were made.')
    console.log('Remove --dry-run to actually refresh tokens.')
  }
}

async function processCredentialFile(
  filePath: string,
  fileName: string,
  dryRun: boolean,
  results: RefreshResults
): Promise<void> {
  const domain = fileName.replace('.credentials.json', '')
  console.log(`\n[${domain}]`)

  try {
    const credentials = loadCredentials(filePath)

    if (!credentials) {
      console.log('  ❌ Failed to load credentials')
      results.failed++
      results.errors.push({ file: fileName, error: 'Failed to load' })
      return
    }

    if (credentials.type === 'api_key') {
      console.log('  ℹ️  API key credential (skipping)')
      results.apiKey++
      results.skipped++
      return
    }

    if (credentials.type === 'oauth' && credentials.oauth) {
      await processOAuthCredential(filePath, credentials, dryRun, results, fileName)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.log(`  ❌ Error: ${errorMessage}`)
    results.failed++
    results.errors.push({ file: fileName, error: errorMessage })
  }
}

async function processOAuthCredential(
  filePath: string,
  credentials: ClaudeCredentials,
  dryRun: boolean,
  results: RefreshResults,
  fileName: string
): Promise<void> {
  results.oauth++
  const oauth = credentials.oauth!
  const tokenStatus = getTokenStatus(oauth.expiresAt || 0)

  if (tokenStatus === 'VALID') {
    const timeRemaining = formatTimeRemaining(oauth.expiresAt || 0)
    console.log(`  ✓ Token valid for ${timeRemaining} (skipping)`)
    results.skipped++
    return
  }

  if (!oauth.refreshToken) {
    console.log('  ⚠️  No refresh token available')
    results.failed++
    results.errors.push({ file: fileName, error: 'No refresh token' })
    return
  }

  console.log(`  🔄 Refreshing ${tokenStatus === 'EXPIRED' ? 'expired' : 'expiring'} token...`)

  if (dryRun) {
    console.log('  📝 Would refresh token (dry run)')
    results.refreshed++
    return
  }

  try {
    const newOAuth = await refreshToken(oauth.refreshToken)
    await saveRefreshedCredentials(filePath, credentials, newOAuth)

    const timeRemaining = formatTimeRemaining(newOAuth.expiresAt)
    console.log(`  ✅ Refreshed! Valid for ${timeRemaining}`)
    results.refreshed++
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.log(`  ❌ Refresh failed: ${errorMessage}`)
    results.failed++
    results.errors.push({ file: fileName, error: errorMessage })
  }
}

async function saveRefreshedCredentials(
  filePath: string,
  credentials: ClaudeCredentials,
  newOAuth: OAuthCredentials
): Promise<void> {
  credentials.oauth = newOAuth

  // Load existing file to preserve non-OAuth fields
  let existingData: Record<string, unknown> = {}
  try {
    const content = readFileSync(filePath, 'utf-8')
    existingData = JSON.parse(content)
  } catch {
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
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(mergedCredentials, null, 2))
}

// Main Function
async function refreshAllOAuthTokens(): Promise<void> {
  const { credentialsDir, dryRun, help } = parseCliArguments()

  if (help) {
    showUsage()
    process.exit(EXIT_CODE_SUCCESS)
  }

  console.log('OAuth Refresh All Tool')
  console.log('=====================')
  console.log(`Credentials directory: ${credentialsDir}`)
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}\n`)

  validateCredentialsDirectory(credentialsDir)

  try {
    const fullDir = resolve(credentialsDir)

    // Get all credential files
    const files = readdirSync(fullDir)
      .filter(file => file.endsWith('.credentials.json'))
      .sort()

    if (files.length === 0) {
      console.log('No credential files found.')
      process.exit(EXIT_CODE_SUCCESS)
    }

    console.log(`Found ${files.length} credential files\n`)

    const results: RefreshResults = {
      total: files.length,
      oauth: 0,
      apiKey: 0,
      refreshed: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    }

    // Process each credential file
    for (const file of files) {
      const filePath = join(fullDir, file)
      await processCredentialFile(filePath, file, dryRun, results)
    }

    // Display results
    printResults(results, dryRun)

    process.exit(results.failed > 0 ? EXIT_CODE_FAILURE : EXIT_CODE_SUCCESS)
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error')
    process.exit(EXIT_CODE_FAILURE)
  }
}

// Entry point
refreshAllOAuthTokens().catch(error => {
  console.error('Unhandled error:', error instanceof Error ? error.message : 'Unknown error')
  process.exit(EXIT_CODE_FAILURE)
})
