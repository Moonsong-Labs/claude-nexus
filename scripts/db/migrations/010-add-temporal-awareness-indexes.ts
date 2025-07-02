#!/usr/bin/env bun
/**
 * Migration 010: Add indexes for temporal awareness queries
 *
 * This migration adds composite indexes to optimize queries that filter by
 * conversation_id and timestamp, which are critical for historical rebuilds
 * and temporal awareness features.
 *
 * Indexes added:
 * 1. (conversation_id, timestamp) - General temporal queries
 * 2. (conversation_id, timestamp) WHERE branch_id LIKE 'subtask_%' - Subtask sequence queries
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
    console.log('Migration 010: Adding temporal awareness indexes...')

    // Index 1: General composite index for conversation_id and timestamp
    console.log('\n1. Checking general conversation-timestamp index...')
    const checkGeneralIndex = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'api_requests' 
        AND indexname = 'idx_api_requests_conv_id_timestamp'
    `)

    if (checkGeneralIndex.rows.length === 0) {
      console.log('Creating composite index on (conversation_id, timestamp)...')
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_api_requests_conv_id_timestamp 
        ON api_requests (conversation_id, timestamp)
      `)
      console.log('✓ General composite index created')
    } else {
      console.log('✓ General composite index already exists')
    }

    // Index 2: Partial index for subtask sequence queries
    console.log('\n2. Checking subtask sequence index...')
    const checkSubtaskIndex = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'api_requests' 
        AND indexname = 'idx_subtask_seq'
    `)

    if (checkSubtaskIndex.rows.length === 0) {
      console.log('Creating partial index for subtask sequence queries...')
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_subtask_seq 
        ON api_requests (conversation_id, timestamp) 
        WHERE branch_id LIKE 'subtask_%'
      `)
      console.log('✓ Subtask sequence index created')
    } else {
      console.log('✓ Subtask sequence index already exists')
    }

    // Analyze the table to update statistics
    console.log('\n3. Analyzing api_requests table to update statistics...')
    await pool.query('ANALYZE api_requests')
    console.log('✓ Table analyzed')

    // Show index info
    console.log('\n4. Gathering index statistics...')
    const indexInfo = await pool.query(`
      SELECT 
        i.indexname,
        pg_size_pretty(pg_relation_size(i.indexname::regclass)) as index_size
      FROM pg_indexes i
      WHERE i.tablename = 'api_requests' 
        AND i.indexname IN ('idx_api_requests_conv_id_timestamp', 'idx_subtask_seq')
      ORDER BY i.indexname
    `)

    console.log('\nIndex sizes:')
    for (const row of indexInfo.rows) {
      console.log(`  - ${row.indexname}: ${row.index_size}`)
    }

    console.log('\n✅ Migration 010 completed successfully!')
    console.log('\nThese indexes optimize:')
    console.log('  - Historical rebuild queries with beforeTimestamp parameter')
    console.log('  - Subtask sequence calculation (getMaxSubtaskSequence)')
    console.log('  - Conversation linking with temporal awareness')
    console.log('  - General queries filtering by conversation_id and timestamp')
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
