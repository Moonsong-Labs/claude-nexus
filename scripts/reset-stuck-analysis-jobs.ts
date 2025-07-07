#!/usr/bin/env bun

/**
 * Script to reset stuck analysis jobs that have exceeded max retries
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
    // Find jobs that have exceeded max retries
    const stuckJobsResult = await pool.query(
      `
      SELECT id, conversation_id, branch_id, retry_count
      FROM conversation_analyses
      WHERE status = 'pending' AND retry_count >= $1
      ORDER BY created_at DESC
    `,
      [maxRetries]
    )

    console.log(`Found ${stuckJobsResult.rows.length} stuck jobs with retry_count >= ${maxRetries}`)

    if (stuckJobsResult.rows.length === 0) {
      console.log('No stuck jobs found.')
      return
    }

    // Reset these jobs
    const result = await pool.query(
      `
      UPDATE conversation_analyses
      SET retry_count = 0,
          error_message = NULL,
          updated_at = NOW()
      WHERE status = 'pending' AND retry_count >= $1
      RETURNING id, conversation_id, branch_id
    `,
      [maxRetries]
    )

    console.log(`\nReset ${result.rowCount} stuck jobs:`)
    result.rows.forEach(row => {
      console.log(`  - Job ${row.id}: ${row.conversation_id} (branch: ${row.branch_id})`)
    })
  } catch (error) {
    console.error('Error resetting stuck jobs:', error)
  } finally {
    await pool.end()
  }
}

main()
