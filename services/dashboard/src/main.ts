#!/usr/bin/env node

import * as process from 'node:process'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as dotenvConfig } from 'dotenv'

// Constants
const DEFAULT_PORT = 3001
const DEFAULT_HOST = '0.0.0.0'

// ES Module-safe __dirname
const __dirname = dirname(fileURLToPath(import.meta.url))
// Load environment configuration
function loadEnvironmentConfig(): void {
  const envPaths = [
    join(process.cwd(), '.env'),
    join(process.cwd(), '.env.local'),
    join(dirname(process.argv[1] || ''), '.env'),
    // Check parent directories for monorepo setup
    join(__dirname, '..', '..', '..', '.env'), // Root directory
    join(__dirname, '..', '..', '.env'), // Services directory
    join(__dirname, '..', '.env'), // Dashboard directory
  ]

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      const result = dotenvConfig({ path: envPath })
      if (!result.error) {
        console.log(`Loaded configuration from ${envPath}`)
        break
      }
    }
  }
}

// Load environment configuration before importing other modules
loadEnvironmentConfig()

// Now import other modules after env is loaded
import { serve } from '@hono/node-server'
import { createDashboardApp } from './app.js'

// Parse command line arguments
const args = process.argv.slice(2)

// Check for --env-file argument
const envFileIndex = args.findIndex(arg => arg === '-e' || arg === '--env-file')
if (envFileIndex !== -1 && args[envFileIndex + 1]) {
  const envFile = args[envFileIndex + 1]
  if (existsSync(envFile)) {
    const result = dotenvConfig({ path: envFile })
    if (result.error) {
      console.error(`Error loading env file ${envFile}: ${result.error.message}`)
      process.exit(1)
    } else {
      console.log(`Loaded configuration from ${envFile}`)
    }
  } else {
    console.error(`Error: Environment file not found: ${envFile}`)
    process.exit(1)
  }
}

// Get package version
function getPackageVersion(): string {
  try {
    // Try multiple possible paths for package.json
    const possiblePaths = [
      join(__dirname, '..', 'package.json'), // Development
      join(__dirname, 'package.json'), // npm install
      join(__dirname, '..', '..', 'package.json'), // Other scenarios
    ]

    for (const packagePath of possiblePaths) {
      try {
        const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
        return packageJson.version
      } catch {
        continue
      }
    }

    return 'unknown'
  } catch {
    return 'unknown'
  }
}

function showHelp() {
  console.log(`Claude Nexus Dashboard Service v${getPackageVersion()}

Usage: claude-nexus-dashboard [options]

Options:
  -v, --version              Show version number
  -h, --help                 Show this help message
  -p, --port PORT            Set server port (default: ${DEFAULT_PORT})
  -H, --host HOST            Set server hostname (default: ${DEFAULT_HOST})
  -e, --env-file FILE        Load environment from specific file

Environment Variables:
  PORT                        Server port (default: ${DEFAULT_PORT})
  HOST                        Server hostname (default: ${DEFAULT_HOST})
  DASHBOARD_API_KEY           API key for dashboard access (required)
  DATABASE_URL                PostgreSQL connection string (required)
  PROXY_API_URL               URL of the proxy service for real-time updates (optional)

Examples:
  claude-nexus-dashboard
  claude-nexus-dashboard --port 8080
  claude-nexus-dashboard --host localhost --port 3001
  claude-nexus-dashboard --env-file .env.production

Dashboard Access:
  The dashboard requires DASHBOARD_API_KEY to be set.
  Access the dashboard at http://localhost:3001/

Note: The dashboard automatically loads .env file from the current directory.
Use --env-file to specify a different configuration file.`)
}

if (args.includes('-v') || args.includes('--version')) {
  console.log(getPackageVersion())
  process.exit(0)
}

if (args.includes('-h') || args.includes('--help')) {
  showHelp()
  process.exit(0)
}

// Parse command line options
let port = parseInt(process.env.PORT || String(DEFAULT_PORT), 10)
let hostname = process.env.HOST || DEFAULT_HOST

const portIndex = args.findIndex(arg => arg === '-p' || arg === '--port')
if (portIndex !== -1 && args[portIndex + 1]) {
  port = parseInt(args[portIndex + 1], 10)
  if (isNaN(port)) {
    console.error('Error: Invalid port number')
    process.exit(1)
  }
}

const hostIndex = args.findIndex(arg => arg === '-H' || arg === '--host')
if (hostIndex !== -1 && args[hostIndex + 1]) {
  hostname = args[hostIndex + 1]
}

// Main function
async function main() {
  try {
    // Validate required configuration
    if (!process.env.DASHBOARD_API_KEY) {
      console.error('❌ Error: DASHBOARD_API_KEY environment variable is required')
      process.exit(1)
    }

    if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
      console.error('❌ Error: DATABASE_URL or DB_* environment variables are required')
      process.exit(1)
    }

    // Print dashboard configuration
    console.log(`Claude Nexus Dashboard Service v${getPackageVersion()}`)
    console.log('Mode: Web Dashboard for monitoring and analytics')

    console.log('\nConfiguration:')
    console.log(`  - Authentication: Configured`)
    console.log(`  - Database: ${process.env.DATABASE_URL ? 'URL configured' : 'Host configured'}`)

    if (process.env.PROXY_API_URL) {
      console.log(`  - Proxy Service: ${process.env.PROXY_API_URL}`)
    }

    // Create the app
    const app = await createDashboardApp()

    // Start the server
    serve({
      port: port,
      hostname: hostname,
      fetch: app.fetch,
    })

    console.log(`\n✅ Server started successfully`)
    console.log(`🌐 Listening on http://${hostname}:${port}`)
    console.log(`📈 Dashboard: http://${hostname}:${port}/`)

    // Get network interfaces to show accessible URLs
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
    } catch (error) {
      // Log the error instead of silently ignoring it
      console.warn('Could not determine network interfaces:', error)
    }

    console.log('\nPress Ctrl+C to stop the server')

    // Note: Signal handlers (process.on) are not implemented here as they don't work
    // reliably with Bun's bundling system. The process will exit immediately on signal.
  } catch (error) {
    console.error(
      '❌ Failed to start server:',
      error instanceof Error ? error.message : String(error)
    )
    process.exit(1)
  }
}

// Start the application
main()
