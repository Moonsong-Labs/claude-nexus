#!/usr/bin/env bun

/**
 * Script to manually fail jobs that have exceeded max retries
 *
 * Usage:
 *   bun run scripts/fail-exceeded-retry-jobs.ts [--dry-run] [--force]
 *
 * Options:
 *   --dry-run  Preview changes without updating the database
 *   --force    Skip confirmation prompt (useful for automation)
 */

import { Pool, PoolClient } from 'pg'
import { config } from 'dotenv'
import type { ConversationAnalysisJob } from '../services/proxy/src/workers/ai-analysis/db.js'
import { ConversationAnalysisStatus } from '@claude-nexus/shared/types'

// Load environment variables
config()

// Parse command line arguments
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const isForce = args.includes('--force')

// Constants
const SCRIPT_NAME = 'fail-exceeded-retry-jobs'
const MAX_RETRIES = Number(process.env.AI_ANALYSIS_MAX_RETRIES) || 3

// Error message schema for consistency
interface FailureError {
  error: string
  reason: string
  max_retries: number
  retry_count: number
  failed_at: string
  script: string
}

async function getExceededJobs(client: PoolClient): Promise<Partial<ConversationAnalysisJob>[]> {
  const query = `
    SELECT id, conversation_id, branch_id, retry_count, created_at, updated_at
    FROM conversation_analyses
    WHERE status = $1 AND retry_count >= $2
    ORDER BY created_at ASC
  `

  const result = await client.query(query, [ConversationAnalysisStatus.PENDING, MAX_RETRIES])
  return result.rows
}

async function failJobs(client: PoolClient, jobIds: number[]): Promise<number> {
  if (jobIds.length === 0) return 0

  const errorData: FailureError = {
    error: 'Maximum retry attempts exceeded',
    reason: 'Job exceeded configured retry limit',
    max_retries: MAX_RETRIES,
    retry_count: MAX_RETRIES,
    failed_at: new Date().toISOString(),
    script: SCRIPT_NAME,
  }

  const query = `
    UPDATE conversation_analyses
    SET status = $1,
        error_message = $2,
        updated_at = NOW(),
        completed_at = NOW()
    WHERE id = ANY($3::bigint[])
    RETURNING id
  `

  const result = await client.query(query, [
    ConversationAnalysisStatus.FAILED,
    JSON.stringify(errorData),
    jobIds,
  ])

  return result.rowCount || 0
}

async function main() {
  // Validate environment
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set')
    process.exit(1)
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  // Print header
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  ${SCRIPT_NAME}`)
  console.log(`  ${new Date().toISOString()}`)
  console.log(`  Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log(`  Max retries threshold: ${MAX_RETRIES}`)
  console.log('═══════════════════════════════════════════════════════════════\n')

  let client: PoolClient | null = null

  try {
    client = await pool.connect()

    // Start transaction
    await client.query('BEGIN')

    // Find jobs that exceeded retry limit
    const exceededJobs = await getExceededJobs(client)

    if (exceededJobs.length === 0) {
      console.log('✅ No jobs found with retry_count >= ' + MAX_RETRIES)
      await client.query('COMMIT')
      process.exit(0)
    }

    // Display jobs that will be failed
    console.log(`Found ${exceededJobs.length} job(s) exceeding retry limit:\n`)
    exceededJobs.forEach(job => {
      console.log(`  • Job ${job.id}:`)
      console.log(`    Conversation: ${job.conversation_id}`)
      console.log(`    Branch: ${job.branch_id}`)
      console.log(`    Retries: ${job.retry_count}`)
      console.log(`    Created: ${job.created_at}`)
      console.log(`    Last updated: ${job.updated_at}`)
      console.log()
    })

    if (isDryRun) {
      console.log('🔍 DRY RUN: No changes will be made to the database.')
      await client.query('ROLLBACK')
      process.exit(0)
    }

    // Confirm before proceeding (unless --force is used)
    if (!isForce) {
      console.log(`⚠️  This will mark ${exceededJobs.length} job(s) as FAILED.`)
      console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...')
      await new Promise(resolve => setTimeout(resolve, 5000))
    }

    // Fail the jobs
    const jobIds = exceededJobs.map(job => job.id!)
    const failedCount = await failJobs(client, jobIds)

    // Commit transaction
    await client.query('COMMIT')

    console.log(`\n✅ Successfully failed ${failedCount} job(s).`)
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error failing jobs:', error)

    // Rollback transaction on error
    if (client) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        console.error('Failed to rollback transaction:', rollbackError)
      }
    }

    process.exit(1)
  } finally {
    if (client) {
      client.release()
    }
    await pool.end()
  }
}

// Run the script
main().catch(error => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
