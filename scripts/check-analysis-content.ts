#!/usr/bin/env bun
/**
 * Check Analysis Content
 *
 * This script queries the database to display the content of AI analysis
 * for a specific conversation, including both structured data and raw text.
 *
 * Usage:
 *   bun run scripts/check-analysis-content.ts <conversation-id> [options]
 *
 * Options:
 *   --branch <branch>    Filter by specific branch ID
 *   --format <format>    Output format: pretty (default) or json
 *   --verbose            Show additional details
 *   --help               Show this help message
 */

import { Pool, PoolClient } from 'pg'
import { config as loadEnv } from 'dotenv'
import { config } from '@claude-nexus/shared'
import type { ConversationAnalysisStatus } from '@claude-nexus/shared'

// Load environment variables
loadEnv()

// Type definitions for query results
interface AnalysisContent {
  id: string
  conversation_id: string
  branch_id: string
  status: ConversationAnalysisStatus
  analysis_content?: string
  analysis_data?: string
  prompt_tokens?: number
  completion_tokens?: number
  completed_at?: Date
  created_at: Date
  updated_at: Date
  retry_count: number
  custom_prompt?: string
  error_message?: string | Record<string, unknown>
}

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Parse command line arguments
interface Args {
  conversationId?: string
  branch?: string
  format: 'pretty' | 'json'
  verbose: boolean
  help: boolean
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const result: Args = {
    format: 'pretty',
    verbose: false,
    help: false,
  }

  // First positional argument is conversation ID
  if (args.length > 0 && !args[0].startsWith('--')) {
    result.conversationId = args[0]
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--branch':
        result.branch = args[++i]
        break
      case '--format':
        const format = args[++i]
        if (format === 'json' || format === 'pretty') {
          result.format = format
        }
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

// Display help message
function showHelp(): void {
  console.log(`
Check Analysis Content

This script queries the database to display the content of AI analysis
for a specific conversation, including both structured data and raw text.

Usage:
  bun run scripts/check-analysis-content.ts <conversation-id> [options]

Arguments:
  <conversation-id>    UUID of the conversation to check (required)

Options:
  --branch <branch>    Filter by specific branch ID
  --format <format>    Output format: pretty (default) or json
  --verbose            Show additional details
  --help               Show this help message

Examples:
  # Check analysis for a conversation
  bun run scripts/check-analysis-content.ts daaacac7-759b-439d-90d9-81e8cd519c35
  
  # Check analysis for specific branch with verbose output
  bun run scripts/check-analysis-content.ts daaacac7-759b-439d-90d9-81e8cd519c35 --branch main --verbose
  
  # Get JSON output for scripting
  bun run scripts/check-analysis-content.ts daaacac7-759b-439d-90d9-81e8cd519c35 --format json
`)
}

// Validate UUID format
function isValidUUID(uuid: string): boolean {
  return UUID_REGEX.test(uuid)
}

// Format date for display
function formatDate(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19)
}

// Format error message
function formatError(error: string | Record<string, unknown> | undefined): string {
  if (!error) return 'No error message'

  if (typeof error === 'string') {
    return error
  }

  return JSON.stringify(error, null, 2)
}

// Display analysis in pretty format
function displayPrettyFormat(analysis: AnalysisContent, verbose: boolean): void {
  console.log('\n=== Analysis Details ===')
  console.log(`ID: ${analysis.id}`)
  console.log(`Conversation: ${analysis.conversation_id}`)
  console.log(`Branch: ${analysis.branch_id}`)
  console.log(`Status: ${analysis.status}`)

  if (verbose) {
    console.log(`Created: ${formatDate(analysis.created_at)}`)
    console.log(`Updated: ${formatDate(analysis.updated_at)}`)
    console.log(`Retry Count: ${analysis.retry_count}`)

    if (analysis.custom_prompt) {
      console.log(`Custom Prompt: Yes`)
    }
  }

  if (analysis.completed_at) {
    console.log(`Completed: ${formatDate(analysis.completed_at)}`)
  }

  if (analysis.prompt_tokens || analysis.completion_tokens) {
    console.log(
      `Tokens: ${analysis.prompt_tokens || 0} prompt, ${analysis.completion_tokens || 0} completion`
    )
  }

  console.log('\n=== Content Type ===')
  if (analysis.analysis_data) {
    console.log('✅ Has structured data (JSON parsed successfully)')
    try {
      const data = JSON.parse(analysis.analysis_data)
      console.log('Keys:', Object.keys(data))

      if (verbose) {
        console.log('\nStructured Data:')
        console.log(JSON.stringify(data, null, 2))
      }
    } catch (e) {
      console.log('⚠️  Warning: Failed to parse analysis_data as JSON')
    }
  } else {
    console.log('❌ No structured data (JSON parse failed)')
  }

  if (analysis.analysis_content) {
    console.log('✅ Has text content')
    console.log(`Content length: ${analysis.analysis_content.length} characters`)

    if (verbose) {
      console.log('\nFull Text Content:')
      console.log(analysis.analysis_content)
    } else {
      console.log('\nFirst 500 characters:')
      console.log(analysis.analysis_content.substring(0, 500) + '...')
    }
  } else {
    console.log('❌ No text content')
  }

  if (analysis.status === 'failed' && analysis.error_message) {
    console.log('\n=== Error Information ===')
    console.log(formatError(analysis.error_message))
  }

  if (verbose && analysis.custom_prompt) {
    console.log('\n=== Custom Prompt ===')
    console.log(analysis.custom_prompt)
  }
}

// Query and display analysis
async function queryAnalysis(
  client: PoolClient,
  conversationId: string,
  branch?: string
): Promise<AnalysisContent | null> {
  let query = `
    SELECT id, conversation_id, branch_id, status, 
           analysis_content, analysis_data, 
           prompt_tokens, completion_tokens,
           completed_at, created_at, updated_at,
           retry_count, custom_prompt, error_message
    FROM conversation_analyses
    WHERE conversation_id = $1
  `

  const params: (string | number)[] = [conversationId]

  if (branch) {
    query += ` AND branch_id = $2`
    params.push(branch)
  }

  query += ` ORDER BY created_at DESC LIMIT 1`

  const result = await client.query<AnalysisContent>(query, params)

  return result.rows.length > 0 ? result.rows[0] : null
}

async function main(): Promise<void> {
  const args = parseArgs()

  if (args.help) {
    showHelp()
    process.exit(0)
  }

  // Validate required arguments
  if (!args.conversationId) {
    console.error('❌ Error: Conversation ID is required')
    console.error('\nUsage: bun run scripts/check-analysis-content.ts <conversation-id>')
    console.error('\nRun with --help for more information')
    process.exit(1)
  }

  // Validate conversation ID format
  if (!isValidUUID(args.conversationId)) {
    console.error('❌ Error: Invalid conversation ID format')
    console.error('   Conversation ID must be a valid UUID')
    process.exit(1)
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

    // Query analysis
    const analysis = await queryAnalysis(client, args.conversationId, args.branch)

    if (!analysis) {
      const message = args.branch
        ? `No analysis found for conversation: ${args.conversationId} on branch: ${args.branch}`
        : `No analysis found for conversation: ${args.conversationId}`

      if (args.format === 'json') {
        console.log(JSON.stringify({ error: message }, null, 2))
      } else {
        console.log(message)
      }
      process.exit(1)
    }

    // Display results
    if (args.format === 'json') {
      console.log(JSON.stringify(analysis, null, 2))
    } else {
      displayPrettyFormat(analysis, args.verbose)
    }

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error checking analysis content:')

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
