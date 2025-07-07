#!/usr/bin/env bun

/**
 * Script to manually fail jobs that have exceeded max retries
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
    const result = await pool.query(
      `UPDATE conversation_analyses
       SET status = 'failed',
           error_message = jsonb_build_object(
             'error', 'Maximum retry attempts exceeded',
             'max_retries', $1,
             'retry_count', retry_count,
             'failed_at', NOW()
           )::text,
           updated_at = NOW(),
           completed_at = NOW()
       WHERE status = 'pending' 
         AND retry_count >= $1
       RETURNING id, conversation_id, branch_id, retry_count`,
      [maxRetries]
    )

    const failedCount = result.rowCount || 0
    console.log(`Failed ${failedCount} jobs that exceeded max retries (>= ${maxRetries}):`)
    
    result.rows.forEach(row => {
      console.log(`  - Job ${row.id}: ${row.conversation_id} (retries: ${row.retry_count})`)
    })

  } catch (error) {
    console.error('Error failing jobs:', error)
  } finally {
    await pool.end()
  }
}

main()