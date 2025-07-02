#!/usr/bin/env bun
/**
 * Migration 009: Add GIN index for response_body to optimize subtask queries
 *
 * This migration adds a GIN index on the response_body column to optimize
 * queries that use the @> containment operator for finding Task tool invocations
 * with specific prompts.
 *
 * The GIN index significantly improves performance for:
 * - Subtask detection queries using @> operator
 * - General JSONB containment queries
 * - JSONPath queries
 */

import { Pool } from 'pg'
import { config } from 'dotenv'

// Load environment variables
config()

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    console.log('Migration 009: Adding GIN index for response_body...')

    // Check if index already exists
    const checkQuery = `
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'api_requests' 
        AND indexname = 'idx_api_requests_response_body_gin'
    `

    const checkResult = await pool.query(checkQuery)

    if (checkResult.rows.length > 0) {
      console.log('✓ GIN index already exists on response_body')
      return
    }

    // Create GIN index
    console.log('Creating GIN index on response_body column...')
    await pool.query(`
      CREATE INDEX idx_api_requests_response_body_gin 
      ON api_requests 
      USING GIN (response_body)
    `)

    console.log('✓ GIN index created successfully')

    // Analyze the table to update statistics
    console.log('Analyzing api_requests table to update statistics...')
    await pool.query('ANALYZE api_requests')
    console.log('✓ Table analyzed')

    // Show index info
    const indexInfo = await pool.query(`
      SELECT 
        pg_size_pretty(pg_relation_size('idx_api_requests_response_body_gin')) as index_size,
        pg_size_pretty(pg_relation_size('api_requests')) as table_size
    `)

    const info = indexInfo.rows[0]
    console.log(`\nIndex statistics:`)
    console.log(`  - Index size: ${info.index_size}`)
    console.log(`  - Table size: ${info.table_size}`)

    console.log('\n✅ Migration 009 completed successfully!')
    console.log('\nThis index will optimize:')
    console.log('  - Subtask detection queries using @> operator')
    console.log('  - JSONB containment queries (response_body @> ...)')
    console.log('  - JSONPath queries (jsonb_path_exists)')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  } finally {
    await pool.end()
  }
}

// Run migration
migrate().catch(error => {
  console.error('Migration error:', error)
  process.exit(1)
})
