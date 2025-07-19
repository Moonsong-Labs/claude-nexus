#!/usr/bin/env bun
import { performOAuthLogin } from '../../services/proxy/src/credentials'
import { resolve, dirname } from 'path'
import { mkdirSync } from 'fs'

// Constants
const EXIT_SUCCESS = 0
const EXIT_ERROR = 1

// ANSI color codes for better readability
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
} as const

// Messages
const MESSAGES = {
  USAGE: 'Usage: bun run scripts/oauth-login.ts <credential-path>',
  EXAMPLE: 'Example: bun run scripts/oauth-login.ts credentials/example.com.credentials.json',
  STARTING: 'Starting OAuth login for:',
  INSTRUCTIONS_HEADER: 'You will need to:',
  INSTRUCTIONS: [
    'Visit the authorization URL in your browser',
    'Log in to Claude and authorize the application',
    'Copy the authorization code (contains a # character)',
    'Paste the code here when prompted',
  ],
  SUCCESS: 'OAuth login successful!',
  SAVED_TO: 'Credentials have been saved to:',
  PROXY_NOTICE: 'The proxy will now use these OAuth credentials for authentication.',
} as const

// Error messages
const ERRORS = {
  NO_PATH: 'Error: No credential path provided',
  OAUTH_FAILED: 'OAuth login failed:',
  INVALID_PATH: 'Error: Credential path must end with .credentials.json',
} as const

/**
 * Validates the credential file path
 * @param path - The path to validate
 * @returns True if valid, false otherwise
 */
function validateCredentialPath(path: string): boolean {
  return path.endsWith('.credentials.json')
}

/**
 * Main function to perform OAuth login for Claude credentials
 * Creates the necessary directory structure and saves OAuth tokens
 */
async function main(): Promise<void> {
  const credentialPath = process.argv[2]

  if (!credentialPath) {
    console.error(`${colors.red}${ERRORS.NO_PATH}${colors.reset}`)
    console.error(`\n${MESSAGES.USAGE}`)
    console.error(`${colors.gray}${MESSAGES.EXAMPLE}${colors.reset}`)
    process.exit(EXIT_ERROR)
  }

  // Validate credential path format
  if (!validateCredentialPath(credentialPath)) {
    console.error(`${colors.red}${ERRORS.INVALID_PATH}${colors.reset}`)
    console.error(`\n${MESSAGES.USAGE}`)
    console.error(`${colors.gray}${MESSAGES.EXAMPLE}${colors.reset}`)
    process.exit(EXIT_ERROR)
  }

  try {
    // Ensure the directory exists
    const fullPath = resolve(credentialPath)
    mkdirSync(dirname(fullPath), { recursive: true })

    console.log(
      `\n${colors.cyan}${MESSAGES.STARTING}${colors.reset} ${colors.yellow}${credentialPath}${colors.reset}`
    )
    console.log(`\n${colors.blue}${MESSAGES.INSTRUCTIONS_HEADER}${colors.reset}`)
    MESSAGES.INSTRUCTIONS.forEach((instruction, index) => {
      console.log(`${colors.gray}${index + 1}.${colors.reset} ${instruction}`)
    })
    console.log() // Empty line for spacing

    // Perform OAuth login
    await performOAuthLogin(credentialPath, false) // false = don't create separate API key file

    console.log(`\n${colors.green}✓ ${MESSAGES.SUCCESS}${colors.reset}`)
    console.log(`${MESSAGES.SAVED_TO} ${colors.yellow}${credentialPath}${colors.reset}`)
    console.log(`\n${colors.gray}${MESSAGES.PROXY_NOTICE}${colors.reset}`)
  } catch (error) {
    console.error(`\n${colors.red}${ERRORS.OAUTH_FAILED}${colors.reset}`, error)
    process.exit(EXIT_ERROR)
  }
}

main()
