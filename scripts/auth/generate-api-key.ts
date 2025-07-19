#!/usr/bin/env bun
import { randomBytes } from 'crypto'

// Constants
const DEFAULT_PREFIX = 'cnp_live'
const TEST_PREFIX = 'cnp_test'
const KEY_BYTES = 32
const PREFIX_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/
const MIN_COUNT = 1
const MAX_COUNT = 100

// Error messages
const ERRORS = {
  INVALID_COUNT: 'Error: Count must be a positive number between 1 and 100',
  INVALID_PREFIX:
    'Error: Prefix must contain only alphanumeric characters, underscores, and hyphens (max 32 chars)',
  CRYPTO_ERROR: 'Error: Failed to generate secure random bytes',
} as const

// CLI Options interface
interface CLIOptions {
  count: number
  prefix: string
  showHelp: boolean
}

/**
 * Validates the prefix format to prevent injection attacks
 * @param prefix - The prefix to validate
 * @returns true if valid, false otherwise
 */
function isValidPrefix(prefix: string): boolean {
  return PREFIX_PATTERN.test(prefix)
}

/**
 * Generate a secure API key for proxy authentication
 * @param prefix - The prefix for the API key (default: 'cnp_live')
 * @returns A secure API key string
 * @throws Error if crypto operations fail
 * @example
 * ```typescript
 * const key = generateApiKey() // Returns: cnp_live_<base64url-encoded-string>
 * const testKey = generateApiKey('cnp_test') // Returns: cnp_test_<base64url-encoded-string>
 * ```
 */
function generateApiKey(prefix: string = DEFAULT_PREFIX): string {
  if (!isValidPrefix(prefix)) {
    throw new Error(ERRORS.INVALID_PREFIX)
  }

  try {
    // Generate cryptographically secure random data
    const buffer = randomBytes(KEY_BYTES)
    // Convert to URL-safe base64 string
    const key = buffer.toString('base64url')
    return `${prefix}_${key}`
  } catch (error) {
    throw new Error(ERRORS.CRYPTO_ERROR)
  }
}

/**
 * Generate multiple API keys at once
 * @param count - Number of keys to generate (default: 1)
 * @param prefix - The prefix for the API keys
 * @returns Array of secure API key strings
 * @throws Error if count is invalid or crypto operations fail
 * @example
 * ```typescript
 * const keys = generateKeys(5) // Returns array of 5 keys
 * const testKeys = generateKeys(3, 'cnp_test') // Returns array of 3 test keys
 * ```
 */
function generateKeys(count: number = 1, prefix?: string): string[] {
  if (!Number.isInteger(count) || count < MIN_COUNT || count > MAX_COUNT) {
    throw new Error(ERRORS.INVALID_COUNT)
  }

  const keys: string[] = []
  for (let i = 0; i < count; i++) {
    keys.push(generateApiKey(prefix))
  }
  return keys
}

/**
 * Display help message
 */
function showHelp(): void {
  console.log(`
Claude Nexus Proxy API Key Generator

Usage:
  bun run generate-api-key.ts [options]

Options:
  -n, --count <number>    Generate multiple keys (default: 1, max: 100)
  -p, --prefix <string>   Key prefix (default: cnp_live)
  --test                  Generate test key with cnp_test prefix
  -h, --help             Show this help message

Examples:
  # Generate a single production key
  bun run generate-api-key.ts

  # Generate 5 keys
  bun run generate-api-key.ts -n 5

  # Generate test key
  bun run generate-api-key.ts --test

  # Custom prefix
  bun run generate-api-key.ts -p myapp_prod

Security Notes:
  - Prefixes must contain only alphanumeric characters, underscores, and hyphens
  - Maximum prefix length is 32 characters
  - Keys contain 256 bits of entropy (32 bytes)
`)
}

/**
 * Parse command line arguments
 * @param args - Command line arguments
 * @returns Parsed CLI options
 */
function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    count: 1,
    prefix: DEFAULT_PREFIX,
    showHelp: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const nextArg = args[i + 1]

    switch (arg) {
      case '-h':
      case '--help':
        options.showHelp = true
        break

      case '-n':
      case '--count':
        if (nextArg) {
          const parsed = parseInt(nextArg, 10)
          if (!isNaN(parsed)) {
            options.count = parsed
          }
          i++
        }
        break

      case '-p':
      case '--prefix':
        if (nextArg) {
          options.prefix = nextArg
          i++
        }
        break

      case '--test':
        options.prefix = TEST_PREFIX
        break
    }
  }

  return options
}

/**
 * Display generated keys
 * @param keys - Array of generated keys
 */
function displayKeys(keys: string[]): void {
  if (keys.length === 1) {
    console.log('\nGenerated API Key:')
    console.log(keys[0])
    console.log('\nAdd this to your domain credential file as:')
    console.log(`"client_api_key": "${keys[0]}"`)
  } else {
    console.log(`\nGenerated ${keys.length} API Keys:`)
    keys.forEach((key, index) => {
      console.log(`${index + 1}. ${key}`)
    })
  }
  console.log('\n⚠️  Keep these keys secure and do not share them publicly!')
}

/**
 * Main CLI entry point
 */
function main(): void {
  const args = process.argv.slice(2)
  const options = parseArgs(args)

  if (options.showHelp) {
    showHelp()
    process.exit(0)
  }

  try {
    const keys = generateKeys(options.count, options.prefix)
    displayKeys(keys)
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'An unknown error occurred')
    process.exit(1)
  }
}

// CLI interface
if (import.meta.main) {
  main()
}

export { generateApiKey, generateKeys }
