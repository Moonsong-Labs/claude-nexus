#!/usr/bin/env bun
/**
 * Process Pending Analyses
 *
 * This script manually triggers processing of pending AI analysis jobs.
 * It can process all pending jobs or a specific conversation.
 *
 * Usage:
 *   bun run scripts/process-pending-analyses.ts [options]
 *
 * Options:
 *   -c, --conversation <id>  Process specific conversation ID
 *   -d, --dry-run           Preview what would be processed without making changes
 *   -f, --force             Skip confirmation prompt
 *   -v, --verbose           Show detailed processing information
 *   -h, --help              Show this help message
 *
 * Examples:
 *   # Process all pending analyses
 *   bun run scripts/process-pending-analyses.ts
 *
 *   # Process specific conversation
 *   bun run scripts/process-pending-analyses.ts -c 123e4567-e89b-12d3-a456-426614174000
 *
 *   # Preview what would be processed
 *   bun run scripts/process-pending-analyses.ts --dry-run
 */

import { Pool, PoolClient } from 'pg'
import { config as loadEnv } from 'dotenv'
import { AnalysisWorker } from '../services/proxy/src/workers/ai-analysis/AnalysisWorker.js'
import { ConversationAnalysisStatus } from '@claude-nexus/shared/types'

// Load environment variables
loadEnv()

// Parse command line arguments
const args = process.argv.slice(2)
const conversationId =
  args.find((_, i) => args[i - 1] === '-c' || args[i - 1] === '--conversation') || undefined
const isDryRun = args.includes('--dry-run') || args.includes('-d')
const isForce = args.includes('--force') || args.includes('-f')
const isVerbose = args.includes('--verbose') || args.includes('-v')
const showHelp = args.includes('--help') || args.includes('-h')

// Constants
const SCRIPT_NAME = 'process-pending-analyses'

// Show help if requested
if (showHelp) {
  console.log(`
Process Pending Analyses

This script manually triggers processing of pending AI analysis jobs.
It can process all pending jobs or a specific conversation.

Usage:
  bun run scripts/${SCRIPT_NAME}.ts [options]

Options:
  -c, --conversation <id>  Process specific conversation ID
  -d, --dry-run           Preview what would be processed without making changes
  -f, --force             Skip confirmation prompt
  -v, --verbose           Show detailed processing information
  -h, --help              Show this help message

Examples:
  # Process all pending analyses
  bun run scripts/${SCRIPT_NAME}.ts

  # Process specific conversation
  bun run scripts/${SCRIPT_NAME}.ts -c 123e4567-e89b-12d3-a456-426614174000

  # Preview what would be processed
  bun run scripts/${SCRIPT_NAME}.ts --dry-run
`)
  process.exit(0)
}

// Validation function
function validateEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is not set')
  }

  if (!process.env.GEMINI_API_KEY) {
    errors.push('GEMINI_API_KEY is not set')
  }

  return { valid: errors.length === 0, errors }
}

// Helper to prompt for confirmation
async function promptConfirmation(message: string): Promise<boolean> {
  if (isForce) return true

  console.log(`\n${message}`)
  console.log('Continue? (y/N): ')

  for await (const line of console) {
    const answer = line.trim().toLowerCase()
    return answer === 'y' || answer === 'yes'
  }
  return false
}

// Main processing function
async function processPending() {
  // Validate environment
  const { valid, errors } = validateEnvironment()
  if (!valid) {
    console.error('❌ Environment validation failed:')
    errors.forEach(err => console.error(`   - ${err}`))
    console.error('\nPlease check your .env file')
    process.exit(1)
  }

  console.log(`🤖 ${isDryRun ? '[DRY RUN] ' : ''}Starting manual analysis processing...`)

  let pool: Pool | null = null
  let client: PoolClient | null = null

  try {
    pool = new Pool({ connectionString: process.env.DATABASE_URL })

    if (conversationId) {
      // Process specific conversation
      if (isVerbose) {
        console.log(`\n📋 Looking for pending analysis for conversation: ${conversationId}`)
      }

      client = await pool.connect()
      const result = await client.query<{ id: string; branch_id: string; created_at: Date }>(
        `SELECT id, branch_id, created_at 
         FROM conversation_analyses 
         WHERE conversation_id = $1 AND status = $2
         LIMIT 1`,
        [conversationId, ConversationAnalysisStatus.PENDING]
      )

      if (result.rows.length === 0) {
        console.log('ℹ️  No pending analysis found for this conversation')
        return
      }

      const job = result.rows[0]

      if (isVerbose) {
        console.log(`\n📌 Found pending job:`)
        console.log(`   - Job ID: ${job.id}`)
        console.log(`   - Branch: ${job.branch_id}`)
        console.log(`   - Created: ${job.created_at.toISOString()}`)
      }

      if (isDryRun) {
        console.log('\n✨ [DRY RUN] Would process 1 job')
        return
      }

      const confirmed = await promptConfirmation(
        `Process analysis job for conversation ${conversationId}?`
      )

      if (!confirmed) {
        console.log('❌ Cancelled by user')
        return
      }

      // Process the specific job
      const worker = new AnalysisWorker()
      await worker.processJob({ id: job.id })
    } else {
      // Process all pending analyses
      client = await pool.connect()

      // Count pending jobs
      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*) FROM conversation_analyses WHERE status = $1`,
        [ConversationAnalysisStatus.PENDING]
      )

      const pendingCount = parseInt(countResult.rows[0].count, 10)

      if (pendingCount === 0) {
        console.log('ℹ️  No pending analyses found')
        return
      }

      if (isVerbose) {
        // Show details of pending jobs
        const jobsResult = await client.query<{
          conversation_id: string
          branch_id: string
          created_at: Date
          retry_count: number
        }>(
          `SELECT conversation_id, branch_id, created_at, retry_count
           FROM conversation_analyses 
           WHERE status = $1
           ORDER BY created_at ASC
           LIMIT 10`,
          [ConversationAnalysisStatus.PENDING]
        )

        console.log(`\n📋 Found ${pendingCount} pending analysis job(s)`)
        console.log('\nFirst 10 jobs:')
        jobsResult.rows.forEach((job, i) => {
          console.log(`\n${i + 1}. Conversation: ${job.conversation_id}`)
          console.log(`   Branch: ${job.branch_id}`)
          console.log(`   Created: ${job.created_at.toISOString()}`)
          console.log(`   Retries: ${job.retry_count}`)
        })

        if (pendingCount > 10) {
          console.log(`\n... and ${pendingCount - 10} more`)
        }
      } else {
        console.log(`\n📋 Found ${pendingCount} pending analysis job(s)`)
      }

      if (isDryRun) {
        console.log(`\n✨ [DRY RUN] Would process ${pendingCount} job(s)`)
        return
      }

      const confirmed = await promptConfirmation(`Process ${pendingCount} pending analysis job(s)?`)

      if (!confirmed) {
        console.log('❌ Cancelled by user')
        return
      }

      // Process all pending jobs
      const worker = new AnalysisWorker()
      await worker.processPendingJobs()
    }

    console.log('\n✅ Processing complete')
  } catch (error) {
    console.error('\n❌ Processing failed:', error instanceof Error ? error.message : String(error))
    if (isVerbose && error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack)
    }
    process.exit(1)
  } finally {
    if (client) await client.release()
    if (pool) await pool.end()
  }
}

// Run the script
processPending().catch(error => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})
