#!/usr/bin/env bun
/**
 * Check Analysis Jobs
 *
 * This script queries the database to check the status of AI analysis jobs
 * and provides actionable insights for monitoring and troubleshooting.
 *
 * Usage:
 *   bun run scripts/check-analysis-jobs.ts [options]
 *
 * Options:
 *   --status <status>  Filter by job status (pending, processing, completed, failed)
 *   --limit <number>   Limit number of results per status (default: 5)
 *   --verbose          Show detailed information
 *   --help             Show this help message
 */

import { Pool, PoolClient } from 'pg'
import { config as loadEnv } from 'dotenv'
import { config } from '@claude-nexus/shared'
import type { ConversationAnalysisStatus } from '@claude-nexus/shared'

// Load environment variables
loadEnv()

// Type definitions for query results
interface AnalysisJob {
  id: string
  conversation_id: string
  branch_id: string
  status: ConversationAnalysisStatus
  retry_count: number
  created_at: Date
  updated_at: Date
  completed_at?: Date
  prompt_tokens?: number
  completion_tokens?: number
  error_message?: string | Record<string, unknown>
}

interface StatusCount {
  status: ConversationAnalysisStatus
  count: number
}

// Parse command line arguments
function parseArgs(): {
  status?: ConversationAnalysisStatus
  limit: number
  verbose: boolean
  help: boolean
} {
  const args = process.argv.slice(2)
  const result = {
    limit: 5,
    verbose: false,
    help: false,
  } as ReturnType<typeof parseArgs>

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--status':
        result.status = args[++i] as ConversationAnalysisStatus
        break
      case '--limit':
        result.limit = parseInt(args[++i], 10) || 5
        break
      case '--verbose':
        result.verbose = true
        break
      case '--help':
      case '-h':
        result.help = true
        break
    }
  }

  return result
}

// Helper to format dates
function formatDate(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19)
}

// Helper to format error messages
function formatError(error: string | Record<string, unknown> | undefined): string {
  if (!error) return 'No error message'

  if (typeof error === 'string') {
    return error.length > 100 ? error.substring(0, 100) + '...' : error
  }

  const errorStr = JSON.stringify(error)
  return errorStr.length > 100 ? errorStr.substring(0, 100) + '...' : errorStr
}

// Display help message
function showHelp(): void {
  console.log(`
Usage: bun run scripts/check-analysis-jobs.ts [options]

Options:
  --status <status>  Filter by job status (pending, processing, completed, failed)
  --limit <number>   Limit number of results per status (default: 5)
  --verbose          Show detailed information
  --help             Show this help message

Examples:
  # Check all job statuses
  bun run scripts/check-analysis-jobs.ts
  
  # Check only failed jobs with details
  bun run scripts/check-analysis-jobs.ts --status failed --verbose
  
  # Check pending jobs with custom limit
  bun run scripts/check-analysis-jobs.ts --status pending --limit 10
`)
}

// Query and display jobs by status
async function queryJobsByStatus(
  client: PoolClient,
  status: ConversationAnalysisStatus,
  limit: number,
  verbose: boolean
): Promise<void> {
  const query = `
    SELECT id, conversation_id, branch_id, status, retry_count, 
           created_at, updated_at, completed_at, prompt_tokens, 
           completion_tokens, error_message
    FROM conversation_analyses
    WHERE status = $1
    ORDER BY ${status === 'completed' ? 'completed_at' : 'updated_at'} DESC
    LIMIT $2
  `

  const result = await client.query<AnalysisJob>(query, [status, limit])

  if (result.rows.length === 0) {
    return
  }

  console.log(`\n=== ${status.toUpperCase()} Jobs (${result.rows.length}) ===`)

  result.rows.forEach((row, index) => {
    console.log(`\n[${index + 1}] ID: ${row.id}`)
    console.log(`    Conversation: ${row.conversation_id}`)
    console.log(`    Branch: ${row.branch_id}`)

    if (verbose) {
      console.log(`    Status: ${row.status}`)
      console.log(`    Retry Count: ${row.retry_count}`)
      console.log(`    Created: ${formatDate(row.created_at)}`)
      console.log(`    Updated: ${formatDate(row.updated_at)}`)
    }

    if (status === 'completed' && row.completed_at) {
      console.log(`    Completed: ${formatDate(row.completed_at)}`)
      if (row.prompt_tokens || row.completion_tokens) {
        console.log(
          `    Tokens: ${row.prompt_tokens || 0} prompt, ${row.completion_tokens || 0} completion`
        )
      }
    }

    if (status === 'failed' && row.error_message) {
      console.log(`    Error: ${formatError(row.error_message)}`)
    }
  })
}

// Get summary statistics
async function getSummaryStats(client: PoolClient): Promise<StatusCount[]> {
  const query = `
    SELECT status, COUNT(*) as count
    FROM conversation_analyses
    GROUP BY status
    ORDER BY 
      CASE status
        WHEN 'pending' THEN 1
        WHEN 'processing' THEN 2
        WHEN 'completed' THEN 3
        WHEN 'failed' THEN 4
      END
  `

  const result = await client.query<StatusCount>(query)
  return result.rows
}

async function main(): Promise<void> {
  const args = parseArgs()

  if (args.help) {
    showHelp()
    process.exit(0)
  }

  // Validate database configuration
  if (!config.database.url) {
    console.error('❌ Error: DATABASE_URL environment variable is not set')
    console.error('\nPlease set DATABASE_URL in your .env file or environment')
    process.exit(1)
  }

  let pool: Pool | undefined
  let client: PoolClient | undefined

  try {
    // Create connection pool
    pool = new Pool({
      connectionString: config.database.url,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
      max: 1, // Single connection for CLI script
    })

    // Get a client from the pool
    client = await pool.connect()

    console.log('AI Analysis Jobs Status Check')
    console.log('==============================')

    // Get and display summary statistics
    const stats = await getSummaryStats(client)
    console.log('\nSummary:')

    let totalJobs = 0
    stats.forEach(stat => {
      totalJobs += Number(stat.count)
      console.log(`  ${stat.status.toUpperCase()}: ${stat.count}`)
    })
    console.log(`  TOTAL: ${totalJobs}`)

    if (args.status) {
      // Query specific status
      await queryJobsByStatus(client, args.status, args.limit, args.verbose)
    } else {
      // Query all statuses
      const statuses: ConversationAnalysisStatus[] = [
        'pending',
        'processing',
        'completed',
        'failed',
      ]
      for (const status of statuses) {
        await queryJobsByStatus(client, status, args.limit, args.verbose)
      }
    }

    console.log('\n✅ Analysis complete')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error checking analysis jobs:')

    if (error instanceof Error) {
      console.error(`   ${error.message}`)

      // Provide helpful guidance for common errors
      if (error.message.includes('ECONNREFUSED')) {
        console.error('\n   The database connection was refused.')
        console.error('   Please check that PostgreSQL is running and DATABASE_URL is correct.')
      } else if (error.message.includes('password authentication failed')) {
        console.error('\n   Database authentication failed.')
        console.error('   Please check your database credentials in DATABASE_URL.')
      } else if (error.message.includes('relation') && error.message.includes('does not exist')) {
        console.error('\n   The conversation_analyses table does not exist.')
        console.error('   Please run the database migrations first.')
      }
    } else {
      console.error('   An unexpected error occurred:', error)
    }

    process.exit(1)
  } finally {
    // Clean up resources
    if (client) {
      client.release()
    }
    if (pool) {
      await pool.end()
    }
  }
}

// Run the script and handle any uncaught errors
main().catch(error => {
  console.error('\n❌ Uncaught error:', error)
  process.exit(1)
})
