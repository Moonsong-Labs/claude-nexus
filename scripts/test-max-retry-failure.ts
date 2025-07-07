#!/usr/bin/env bun

/**
 * Script to test max retry failure handling
 */

import { Pool } from 'pg'
import { config } from 'dotenv'

// Load environment variables
config()

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  const maxRetries = Number(process.env.AI_ANALYSIS_MAX_RETRIES) || 3

  try {
    // Create a test job with retry_count >= MAX_RETRIES
    const result = await pool.query(
      `
      INSERT INTO conversation_analyses (
        conversation_id, 
        branch_id, 
        status, 
        retry_count,
        error_message,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        'main',
        'pending',
        $1,
        '{"test": "This job has exceeded max retries"}',
        NOW(),
        NOW()
      ) RETURNING *
    `,
      [maxRetries + 1]
    )

    const testJob = result.rows[0]
    console.log('Created test job with exceeded retries:')
    console.log(`  ID: ${testJob.id}`)
    console.log(`  Conversation: ${testJob.conversation_id}`)
    console.log(`  Retry count: ${testJob.retry_count}`)
    console.log(`  Status: ${testJob.status}`)

    console.log('\nThis job should be automatically marked as failed by the worker.')
    console.log('Check the worker logs and run check-analysis-jobs.ts to verify.')
  } catch (error) {
    console.error('Error creating test job:', error)
  } finally {
    await pool.end()
  }
}

main()
