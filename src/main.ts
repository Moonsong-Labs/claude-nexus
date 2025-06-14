#!/usr/bin/env node

import { serve } from '@hono/node-server'
import { createApp } from './app'
import * as process from 'node:process'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as dotenvConfig } from 'dotenv'
import { tokenTracker } from './tokenTracker'
import { container } from './container'
import { closeRateLimitStores } from './middleware/rate-limit'

// Load .env file from multiple possible locations
const envPaths = [
  join(process.cwd(), '.env'),
  join(process.cwd(), '.env.local'),
  join(dirname(process.argv[1] || ''), '.env'),
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
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)

    // Try multiple possible paths for package.json
    const possiblePaths = [
      join(__dirname, '..', 'package.json'),  // Development
      join(__dirname, 'package.json'),        // npm install
      join(__dirname, '..', '..', 'package.json')  // Other scenarios
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
  console.log(`Claude Nexus Proxy v${getPackageVersion()}

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
  CLAUDE_API_KEY              Default Claude API key (optional, can be overridden per domain)
  CREDENTIALS_DIR             Directory containing domain credential files (default: credentials)
  TELEMETRY_ENDPOINT          URL to send telemetry data (optional)
  DEBUG                       Enable debug logging (default: false)
  DASHBOARD_API_KEY           API key for dashboard access (required for dashboard)
  DATABASE_URL                PostgreSQL connection string (required for dashboard)
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

Dashboard:
  To enable the dashboard, set DASHBOARD_API_KEY and DATABASE_URL.
  Access the dashboard at http://localhost:3000/dashboard

Note: The proxy automatically loads .env file from the current directory.
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
let port = parseInt(process.env.PORT || '3000', 10)
let hostname = process.env.HOST || '0.0.0.0'

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
    // Print proxy configuration
    console.log(`Claude Nexus Proxy v${getPackageVersion()}`)
    console.log('Mode: passthrough (direct proxy to Claude API)')
    console.log('Target: Claude API (https://api.anthropic.com)')
    
    // Show credential directory configuration
    if (process.env.CREDENTIALS_DIR) {
      console.log(`✓ Credential directory: ${process.env.CREDENTIALS_DIR}`)
    } else {
      console.log('✓ Credential directory: credentials (default)')
    }
    
    if (process.env.TELEMETRY_ENDPOINT) {
      console.log(`✓ Telemetry: ${process.env.TELEMETRY_ENDPOINT}`)
    }
    
    // Show Slack configuration if enabled
    if (process.env.SLACK_WEBHOOK_URL) {
      console.log('\nSlack Integration:')
      console.log(`  - Webhook: Configured`)
      if (process.env.SLACK_CHANNEL) console.log(`  - Channel: ${process.env.SLACK_CHANNEL}`)
      if (process.env.SLACK_USERNAME) console.log(`  - Username: ${process.env.SLACK_USERNAME}`)
      console.log(`  - Enabled: ${process.env.SLACK_ENABLED !== 'false' ? 'Yes' : 'No'}`)
    }
    
    // Show dashboard configuration
    if (process.env.DASHBOARD_API_KEY && (process.env.DATABASE_URL || process.env.DB_HOST)) {
      console.log('\nDashboard:')
      console.log(`  - Authentication: Configured`)
      console.log(`  - Database: ${process.env.DATABASE_URL ? 'URL configured' : 'Host configured'}`)
      console.log(`  - Storage: ${process.env.STORAGE_ENABLED === 'true' ? 'Enabled' : 'Disabled'}`)
    } else if (process.env.DASHBOARD_API_KEY || process.env.DATABASE_URL || process.env.DB_HOST) {
      console.log('\n⚠️  Dashboard partially configured (needs both DASHBOARD_API_KEY and database)')
    }
    
    // Start token usage tracking
    tokenTracker.startReporting(10000) // Report every 10 seconds
    
    // Create the app
    const app = await createApp()
    
    // Start the server
    const server = serve({
      port: port,
      hostname: hostname,
      fetch: app.fetch
    })
    
    console.log(`\n✅ Server started successfully`)
    console.log(`🌐 Listening on http://${hostname}:${port}`)
    console.log(`📊 Token stats: http://${hostname}:${port}/token-stats`)
    
    if (process.env.DASHBOARD_API_KEY) {
      console.log(`📈 Dashboard: http://${hostname}:${port}/dashboard`)
    }
    
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
    } catch {
      // Ignore if we can't get network interfaces
    }
    
    console.log('\nPress Ctrl+C to stop the server')
    
    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received, shutting down gracefully...`)
      
      // Print final token stats
      console.log('\nFinal token statistics:')
      tokenTracker.printStats()
      
      // Close server
      server.close(() => {
        console.log('Server closed')
      })
      
      // Close rate limit stores
      closeRateLimitStores()
      
      // Clean up container resources
      await container.cleanup()
      
      process.exit(0)
    }
    
    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGQUIT', () => shutdown('SIGQUIT'))
    
  } catch (error: any) {
    console.error('❌ Failed to start server:', error.message)
    process.exit(1)
  }
}

// Start the application
main()