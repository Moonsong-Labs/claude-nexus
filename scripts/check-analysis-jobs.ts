#!/usr/bin/env bun

/**
 * Script to check the status of analysis jobs in the database
 */

import { Pool } from 'pg'
import { config } from 'dotenv'

// Load environment variables
config()

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    // Check pending jobs
    const pendingResult = await pool.query(`
      SELECT id, conversation_id, branch_id, status, retry_count, created_at, updated_at
      FROM conversation_analyses
      WHERE status = 'pending'
      ORDER BY created_at DESC
      LIMIT 5
    `)
    
    console.log('\n=== Pending Analysis Jobs ===')
    console.log(`Found ${pendingResult.rows.length} pending jobs:`)
    pendingResult.rows.forEach(row => {
      console.log(`  ID: ${row.id}, Conv: ${row.conversation_id}, Branch: ${row.branch_id}`)
      console.log(`    Retries: ${row.retry_count}, Created: ${row.created_at}, Updated: ${row.updated_at}`)
    })

    // Check processing jobs
    const processingResult = await pool.query(`
      SELECT id, conversation_id, branch_id, status, updated_at
      FROM conversation_analyses
      WHERE status = 'processing'
      ORDER BY updated_at DESC
      LIMIT 5
    `)
    
    console.log('\n=== Processing Analysis Jobs ===')
    console.log(`Found ${processingResult.rows.length} processing jobs:`)
    processingResult.rows.forEach(row => {
      console.log(`  ID: ${row.id}, Conv: ${row.conversation_id}, Updated: ${row.updated_at}`)
    })

    // Check recent completed jobs
    const completedResult = await pool.query(`
      SELECT id, conversation_id, branch_id, status, completed_at, prompt_tokens, completion_tokens
      FROM conversation_analyses
      WHERE status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 3
    `)
    
    console.log('\n=== Recent Completed Jobs ===')
    console.log(`Found ${completedResult.rows.length} completed jobs:`)
    completedResult.rows.forEach(row => {
      console.log(`  ID: ${row.id}, Conv: ${row.conversation_id}, Completed: ${row.completed_at}`)
      console.log(`    Tokens: ${row.prompt_tokens} prompt, ${row.completion_tokens} completion`)
    })

    // Check failed jobs
    const failedResult = await pool.query(`
      SELECT id, conversation_id, branch_id, status, retry_count, error_message
      FROM conversation_analyses
      WHERE status = 'failed'
      ORDER BY updated_at DESC
      LIMIT 3
    `)
    
    console.log('\n=== Recent Failed Jobs ===')
    console.log(`Found ${failedResult.rows.length} failed jobs:`)
    failedResult.rows.forEach(row => {
      console.log(`  ID: ${row.id}, Conv: ${row.conversation_id}, Retries: ${row.retry_count}`)
      const error = typeof row.error_message === 'string' ? 
        row.error_message.substring(0, 100) + '...' : 
        JSON.stringify(row.error_message).substring(0, 100) + '...'
      console.log(`    Error: ${error}`)
    })

  } catch (error) {
    console.error('Error checking jobs:', error)
  } finally {
    await pool.end()
  }
}

main()