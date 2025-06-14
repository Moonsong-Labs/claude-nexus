#!/usr/bin/env node

import { serve } from '@hono/node-server'
import { createApp } from './app'
import { config } from './config'
import { container } from './container'
import { logger } from './middleware/logger'
import { tokenTracker } from './tokenTracker'
import { closeRateLimitStores } from './middleware/rate-limit'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { configDotenv } from 'dotenv'

/**
 * CLI entry point for the refactored application
 * Handles command line arguments and environment setup
 */

// Parse command line arguments
const args = process.argv.slice(2)
let port: number | undefined
let host: string | undefined
let envFile: string | undefined

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  
  if (arg === '-h' || arg === '--help') {
    console.log(`
Claude Nexus Proxy - Direct proxy to Claude API with telemetry support

Usage: claude-nexus-proxy [options]

Options:
  -p, --port <port>      Port to listen on (default: 3000)
  -H, --host <host>      Host to bind to (default: 0.0.0.0)
  -e, --env-file <path>  Path to .env file (default: .env)
  -v, --version          Show version
  -h, --help             Show this help message

Environment Variables:
  PORT                   Server port
  HOST                   Server host
  CLAUDE_API_KEY         Default Claude API key
  DATABASE_URL           PostgreSQL connection string
  SLACK_WEBHOOK_URL      Slack webhook for notifications
  LOG_LEVEL              Logging level (debug, info, warn, error)
  
See documentation for full configuration options.
`)
    process.exit(0)
  }
  
  if (arg === '-v' || arg === '--version') {
    const version = getVersion()
    console.log(`claude-nexus-proxy v${version}`)
    process.exit(0)
  }
  
  if (arg === '-p' || arg === '--port') {
    port = parseInt(args[++i])
    if (isNaN(port)) {
      console.error('Invalid port number')
      process.exit(1)
    }
  }
  
  if (arg === '-H' || arg === '--host') {
    host = args[++i]
  }
  
  if (arg === '-e' || arg === '--env-file') {
    envFile = args[++i]
  }
}

// Load environment variables
configDotenv({ path: envFile || '.env' })

// Override with CLI arguments
if (port) process.env.PORT = port.toString()
if (host) process.env.HOST = host

// Main function
async function main() {
  try {
    // Create the application
    const app = await createApp()
    
    // Start the server
    const server = serve({
      fetch: app.fetch,
      port: config.server.port,
      hostname: config.server.host
    })
    
    console.log(`🚀 Claude Nexus Proxy v${getVersion()} started`)
    console.log(`🔗 Listening on http://${config.server.host}:${config.server.port}`)
    console.log(`📊 Token stats available at http://${config.server.host}:${config.server.port}/token-stats`)
    
    if (config.features.enableHealthChecks) {
      console.log(`🏥 Health checks at http://${config.server.host}:${config.server.port}/health`)
    }
    
    // Start token stats reporting
    setInterval(() => {
      tokenTracker.printStats()
    }, 10000) // Every 10 seconds
    
    // Setup graceful shutdown
    setupGracefulShutdown(server)
    
  } catch (error) {
    console.error('❌ Failed to start server:', error.message)
    process.exit(1)
  }
}

// Get version from package.json
function getVersion(): string {
  try {
    // Try to find package.json in various locations
    const possiblePaths = [
      join(process.cwd(), 'package.json'),
      join(dirname(fileURLToPath(import.meta.url)), '../package.json'),
      join(dirname(fileURLToPath(import.meta.url)), '../../package.json')
    ]
    
    for (const path of possiblePaths) {
      try {
        const packageJson = JSON.parse(readFileSync(path, 'utf-8'))
        return packageJson.version || 'unknown'
      } catch {
        // Try next path
      }
    }
  } catch {
    // Ignore errors
  }
  
  return 'unknown'
}

// Graceful shutdown handler
function setupGracefulShutdown(server: any): void {
  let isShuttingDown = false
  
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return
    isShuttingDown = true
    
    console.log(`\n⏹️  ${signal} received, shutting down gracefully...`)
    
    try {
      // Stop accepting new connections
      server.close(() => {
        console.log('✅ HTTP server closed')
      })
      
      // Give ongoing requests time to complete
      const shutdownTimeout = setTimeout(() => {
        console.error('⚠️  Forcefully shutting down after timeout')
        process.exit(1)
      }, 30000) // 30 second timeout
      
      // Print final stats
      console.log('\n📊 Final token statistics:')
      tokenTracker.printStats()
      
      // Close rate limit stores
      closeRateLimitStores()
      
      // Clean up container resources
      await container.cleanup()
      
      clearTimeout(shutdownTimeout)
      console.log('✅ Graceful shutdown complete')
      process.exit(0)
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error.message)
      process.exit(1)
    }
  }
  
  // Handle various shutdown signals
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGQUIT', () => shutdown('SIGQUIT'))
  
  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error)
    shutdown('uncaughtException')
  })
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled rejection:', reason)
    shutdown('unhandledRejection')
  })
}

// Start the application
main()