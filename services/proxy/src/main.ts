#!/usr/bin/env node

/**
 * Proxy Service Entry Point
 * Bootstraps the Claude Nexus Proxy service with CLI support
 */

import { serve } from '@hono/node-server'
import { createProxyApp } from './app.js'
import * as process from 'node:process'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as dotenvConfig } from 'dotenv'
import { tokenTracker } from './services/tokenTracker.js'
import { container } from './container.js'
import { closeRateLimitStores } from './middleware/rate-limit.js'
import { CredentialStatusService } from './services/CredentialStatusService.js'
import { config } from '@claude-nexus/shared'
import { startAnalysisWorker, type AnalysisWorker } from './workers/ai-analysis/index.js'

// Constants
const DEFAULT_PORT = 3000
const DEFAULT_HOST = '0.0.0.0'
const TOKEN_REPORTING_INTERVAL = 10000 // 10 seconds
const FORCE_EXIT_TIMEOUT = 10000 // 10 seconds
const SERVER_CLOSE_TIMEOUT = 5000 // 5 seconds

/**
 * Load environment configuration from .env files
 */
function loadEnvironment(args: string[]): void {
  const __dirname = dirname(fileURLToPath(import.meta.url))

  // Check for --env-file argument first
  const envFileIndex = args.findIndex(arg => arg === '-e' || arg === '--env-file')
  if (envFileIndex !== -1 && args[envFileIndex + 1]) {
    const envFile = args[envFileIndex + 1]
    if (existsSync(envFile)) {
      const result = dotenvConfig({ path: envFile })
      if (result.error) {
        console.error(`Error loading env file ${envFile}: ${result.error.message}`)
        process.exit(1)
      }
      console.log(`✓ Loaded configuration from ${envFile}`)
      return
    } else {
      console.error(`Error: Environment file not found: ${envFile}`)
      process.exit(1)
    }
  }

  // Default paths to check
  const envPaths = [
    join(process.cwd(), '.env'),
    join(process.cwd(), '.env.local'),
    join(dirname(process.argv[1] || ''), '.env'),
    join(__dirname, '..', '..', '..', '.env'),
    join(__dirname, '..', '..', '..', '.env.local'),
  ]

  if (process.env.DEBUG) {
    console.log(`Current working directory: ${process.cwd()}`)
    console.log(`Checking for .env files in:`, envPaths)
  }

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      const result = dotenvConfig({ path: envPath })
      if (!result.error) {
        console.log(`✓ Loaded configuration from ${envPath}`)
        break
      }
    }
  }
}

/**
 * Get package version from package.json
 */
let cachedVersion: string | undefined
function getPackageVersion(): string {
  if (cachedVersion) {
    return cachedVersion
  }

  const __dirname = dirname(fileURLToPath(import.meta.url))
  const possiblePaths = [
    join(__dirname, '..', 'package.json'),
    join(__dirname, 'package.json'),
    join(__dirname, '..', '..', 'package.json'),
  ]

  for (const packagePath of possiblePaths) {
    try {
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
      const version = packageJson.version || 'unknown'
      cachedVersion = version
      return version
    } catch {
      // Continue to next path
    }
  }

  cachedVersion = 'unknown'
  return 'unknown'
}

function showHelp() {
  console.log(`Claude Nexus Proxy Service v${getPackageVersion()}

Usage: claude-nexus-proxy [options]

Options:
  -v, --version              Show version number
  -h, --help                 Show this help message
  -p, --port PORT            Set server port (default: 3000)
  -H, --host HOST            Set server hostname (default: 0.0.0.0)
  -e, --env-file FILE        Load environment from specific file

Environment Variables:
  PORT                        Server port (default: 3000)
  HOST                        Server hostname (default: 0.0.0.0)
  CREDENTIALS_DIR             Directory containing domain credential files (default: credentials)
  TELEMETRY_ENDPOINT          URL to send telemetry data (optional)
  DEBUG                       Enable debug logging (default: false)
  DATABASE_URL                PostgreSQL connection string (for storage)
  STORAGE_ENABLED             Enable request/response storage (default: false)
  SLACK_WEBHOOK_URL           Slack webhook URL for notifications (optional)
  SLACK_CHANNEL               Slack channel override (optional)
  SLACK_USERNAME              Slack bot username (default: Claude Nexus Proxy)
  SLACK_ICON_EMOJI            Slack bot icon (default: :robot_face:)
  SLACK_ENABLED               Enable/disable Slack notifications (default: true if webhook provided)

Examples:
  claude-nexus-proxy
  claude-nexus-proxy --port 8080
  claude-nexus-proxy --host localhost --port 3000
  claude-nexus-proxy --env-file .env.production
  PORT=8787 HOST=127.0.0.1 claude-nexus-proxy

Note: The proxy automatically loads .env file from the current directory.
Use --env-file to specify a different configuration file.`)
}

interface CliOptions {
  port: number
  hostname: string
  showHelp: boolean
  showVersion: boolean
}

/**
 * Parse command line arguments
 */
function parseCliArguments(args: string[]): CliOptions {
  const options: CliOptions = {
    port: parseInt(process.env.PORT || String(DEFAULT_PORT), 10),
    hostname: process.env.HOST || DEFAULT_HOST,
    showHelp: false,
    showVersion: false,
  }

  if (args.includes('-v') || args.includes('--version')) {
    options.showVersion = true
    return options
  }

  if (args.includes('-h') || args.includes('--help')) {
    options.showHelp = true
    return options
  }

  const portIndex = args.findIndex(arg => arg === '-p' || arg === '--port')
  if (portIndex !== -1 && args[portIndex + 1]) {
    const port = parseInt(args[portIndex + 1], 10)
    if (isNaN(port)) {
      console.error('Error: Invalid port number')
      process.exit(1)
    }
    options.port = port
  }

  const hostIndex = args.findIndex(arg => arg === '-H' || arg === '--host')
  if (hostIndex !== -1 && args[hostIndex + 1]) {
    options.hostname = args[hostIndex + 1]
  }

  return options
}

/**
 * Setup graceful shutdown handlers
 */
function setupShutdownHandlers(
  server: ReturnType<typeof serve>,
  analysisWorker: AnalysisWorker | null
): void {
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down gracefully...`)

    // Set a hard timeout to force exit if graceful shutdown hangs
    const forceExitTimeout = setTimeout(() => {
      console.error('Graceful shutdown timeout - forcing exit')
      process.exit(1)
    }, FORCE_EXIT_TIMEOUT)

    try {
      // Print final token stats
      console.log('\nFinal token statistics:')
      tokenTracker.printStats()

      // Close server with timeout
      let serverClosed = false
      const serverCloseTimeout = setTimeout(() => {
        if (!serverClosed) {
          console.log('Server close timeout - forcing shutdown')
          process.exit(0)
        }
      }, SERVER_CLOSE_TIMEOUT)

      server.close(() => {
        serverClosed = true
        clearTimeout(serverCloseTimeout)
        console.log('Server closed')
      })

      // Close rate limit stores
      closeRateLimitStores()

      // Stop analysis worker
      if (analysisWorker) {
        console.log('Stopping AI Analysis Worker...')
        await analysisWorker.stop()
        console.log('AI Analysis Worker stopped')
      }

      // Clean up container resources
      await container.cleanup()

      clearTimeout(forceExitTimeout)
      process.exit(0)
    } catch (error) {
      console.error('Error during shutdown:', error)
      clearTimeout(forceExitTimeout)
      process.exit(1)
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGQUIT', () => shutdown('SIGQUIT'))
}

/**
 * Configure and start the server
 */
async function configureServer(port: number, hostname: string): Promise<ReturnType<typeof serve>> {
  const app = await createProxyApp()

  const server = serve({
    port,
    hostname,
    fetch: app.fetch,
  })

  // Configure server timeout
  const serverTimeout = config.server.timeout
  if (
    server &&
    'timeout' in server &&
    typeof (server as unknown as { timeout: unknown }).timeout === 'number'
  ) {
    ;(server as unknown as { timeout: number; headersTimeout?: number }).timeout = serverTimeout
    if ('headersTimeout' in server) {
      ;(server as unknown as { headersTimeout: number }).headersTimeout = serverTimeout
    }
    console.log(
      `\n⏱️  Server timeout: ${serverTimeout}ms (${Math.floor(serverTimeout / 60000)} minutes)`
    )
  } else {
    console.log(`\n⏱️  Note: Server timeout configuration not applied (using framework defaults)`)
  }

  console.log(`\n✅ Server started successfully`)
  console.log(`🌐 Listening on http://${hostname}:${port}`)
  console.log(`📊 Token stats: http://${hostname}:${port}/token-stats`)
  console.log(`🔐 OAuth metrics: http://${hostname}:${port}/oauth-metrics`)

  // Show network interfaces
  try {
    const os = await import('os')
    const interfaces = os.networkInterfaces()
    const addresses = []

    for (const name in interfaces) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push(`http://${iface.address}:${port}`)
        }
      }
    }

    if (addresses.length > 0) {
      console.log('\nNetwork interfaces:')
      addresses.forEach(addr => console.log(`  ${addr}`))
    }
  } catch {
    // Ignore network interface errors
  }

  console.log('\nPress Ctrl+C to stop the server')
  return server
}

/**
 * Print startup banner and configuration
 */
function printStartupBanner(): void {
  console.log(`Claude Nexus Proxy Service v${getPackageVersion()}`)
  console.log('Mode: passthrough (direct proxy to Claude API)')
  console.log('Target: Claude API (https://api.anthropic.com)')

  // Credential directory
  console.log(`✓ Credential directory: ${process.env.CREDENTIALS_DIR || 'credentials (default)'}`)

  if (process.env.TELEMETRY_ENDPOINT) {
    console.log(`✓ Telemetry: ${process.env.TELEMETRY_ENDPOINT}`)
  }

  // Slack configuration
  if (process.env.SLACK_WEBHOOK_URL) {
    console.log('\nSlack Integration:')
    console.log(`  - Webhook: Configured`)
    if (process.env.SLACK_CHANNEL) {
      console.log(`  - Channel: ${process.env.SLACK_CHANNEL}`)
    }
    if (process.env.SLACK_USERNAME) {
      console.log(`  - Username: ${process.env.SLACK_USERNAME}`)
    }
    console.log(`  - Enabled: ${process.env.SLACK_ENABLED !== 'false' ? 'Yes' : 'No'}`)
  }

  // Storage configuration
  if (process.env.STORAGE_ENABLED === 'true' && (process.env.DATABASE_URL || process.env.DB_HOST)) {
    console.log('\nStorage:')
    console.log(`  - Enabled: Yes`)
    console.log(`  - Database: ${process.env.DATABASE_URL ? 'URL configured' : 'Host configured'}`)
  }

  // Spark API configuration
  console.log('\nSpark API:')
  if (process.env.SPARK_API_KEY) {
    console.log('  - Enabled: Yes')
    console.log(`  - URL: ${process.env.SPARK_API_URL || 'http://localhost:8000 (default)'}`)
    console.log('  - API Key: Configured')
  } else {
    console.log('  - Enabled: No')
    console.log('  - Reason: SPARK_API_KEY not set')
  }

  // AI Analysis configuration
  console.log('\nAI Analysis:')
  if (process.env.AI_WORKER_ENABLED === 'true') {
    if (process.env.GEMINI_API_KEY) {
      console.log('  - Enabled: Yes')
      console.log(`  - Model: ${process.env.GEMINI_MODEL_NAME || 'gemini-2.0-flash-exp (default)'}`)
      console.log('  - API Key: Configured')
    } else {
      console.log('  - Enabled: No')
      console.log('  - Reason: GEMINI_API_KEY not set')
    }
  } else {
    console.log('  - Enabled: No')
    console.log('  - Reason: AI_WORKER_ENABLED not set to true')
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2)

  // Load environment configuration
  loadEnvironment(args)

  // Parse CLI options
  const options = parseCliArguments(args)

  // Handle version and help flags
  if (options.showVersion) {
    console.log(getPackageVersion())
    process.exit(0)
  }

  if (options.showHelp) {
    showHelp()
    process.exit(0)
  }

  let analysisWorker: AnalysisWorker | null = null

  try {
    printStartupBanner()

    // Check all credentials at startup
    console.log('\nChecking credentials...')
    const credentialService = new CredentialStatusService()
    const credentialStatuses = await credentialService.checkAllCredentials()

    if (credentialStatuses.length > 0) {
      const statusLines = credentialService.formatStatusForLogging(credentialStatuses)
      statusLines.forEach(line => console.log(line))
    } else {
      console.log('  No credential files found')
    }

    // Start token usage tracking
    tokenTracker.startReporting(TOKEN_REPORTING_INTERVAL)

    // Start AI Analysis Worker
    try {
      analysisWorker = startAnalysisWorker()
      if (analysisWorker) {
        console.log('✓ AI Analysis Worker started')
      } else {
        console.log('✓ AI Analysis Worker is disabled')
      }
    } catch (error) {
      console.log(
        '✗ AI Analysis Worker not started:',
        error instanceof Error ? error.message : String(error)
      )
      // Non-fatal - continue without analysis worker
    }

    // Create and configure server
    const server = await configureServer(options.port, options.hostname)

    // Setup shutdown handlers
    setupShutdownHandlers(server, analysisWorker)
  } catch (error) {
    console.error(
      '❌ Failed to start server:',
      error instanceof Error ? error.message : String(error)
    )
    process.exit(1)
  }
}

// Start the application
main().catch(error => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
