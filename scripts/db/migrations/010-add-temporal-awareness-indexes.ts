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
 *
 * Note: For production deployments with large tables, consider using
 * CREATE INDEX CONCURRENTLY to avoid locking the table during index creation.
 * However, CONCURRENTLY cannot be used within a transaction block.
 */

import { Pool } from 'pg'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

const MIGRATION_NAME = '010-add-temporal-awareness-indexes'
const INDEX_GENERAL = 'idx_api_requests_conv_id_timestamp'
const INDEX_SUBTASK = 'idx_subtask_seq'

async function migrate() {
  const client = await pool.connect()

  try {
    console.log(`Starting migration: ${MIGRATION_NAME}...`)
    await client.query('BEGIN')

    // Index 1: General composite index for conversation_id and timestamp
    console.log(`\n1. Creating general composite index '${INDEX_GENERAL}'...`)
    await client.query(`
      CREATE INDEX IF NOT EXISTS ${INDEX_GENERAL} 
      ON api_requests (conversation_id, timestamp)
    `)
    console.log(`✓ Index '${INDEX_GENERAL}' created or already exists`)

    // Index 2: Partial index for subtask sequence queries
    console.log(`\n2. Creating partial index '${INDEX_SUBTASK}' for subtask queries...`)
    await client.query(`
      CREATE INDEX IF NOT EXISTS ${INDEX_SUBTASK} 
      ON api_requests (conversation_id, timestamp) 
      WHERE branch_id LIKE 'subtask_%'
    `)
    console.log(`✓ Index '${INDEX_SUBTASK}' created or already exists`)

    // Analyze the table to update statistics
    console.log('\n3. Analyzing api_requests table to update statistics...')
    await client.query('ANALYZE api_requests')
    console.log('✓ Table analyzed')

    // Show index statistics
    const indexInfo = await client.query(
      `
      SELECT 
        i.indexname,
        pg_size_pretty(pg_relation_size(i.indexname::regclass)) as index_size
      FROM pg_indexes i
      WHERE i.tablename = 'api_requests' 
        AND i.indexname IN ($1, $2)
      ORDER BY i.indexname
    `,
      [INDEX_GENERAL, INDEX_SUBTASK]
    )

    if (indexInfo.rows.length > 0) {
      console.log('\nIndex statistics:')
      for (const row of indexInfo.rows) {
        console.log(`  - ${row.indexname}: ${row.index_size}`)
      }
    }

    await client.query('COMMIT')
    console.log(`\n✅ Migration ${MIGRATION_NAME} completed successfully!`)
    console.log('\nThese indexes optimize:')
    console.log('  - Historical rebuild queries with beforeTimestamp parameter')
    console.log('  - Subtask sequence calculation (getMaxSubtaskSequence)')
    console.log('  - Conversation linking with temporal awareness')
    console.log('  - General queries filtering by conversation_id and timestamp')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(`❌ Migration ${MIGRATION_NAME} failed:`, error)
    throw error
  } finally {
    client.release()
  }
}

async function rollback() {
  const client = await pool.connect()

  try {
    console.log(`Rolling back migration: ${MIGRATION_NAME}...`)
    await client.query('BEGIN')

    console.log(`Dropping index '${INDEX_GENERAL}'...`)
    await client.query(`DROP INDEX IF EXISTS ${INDEX_GENERAL}`)
    console.log(`✓ Index '${INDEX_GENERAL}' dropped`)

    console.log(`Dropping index '${INDEX_SUBTASK}'...`)
    await client.query(`DROP INDEX IF EXISTS ${INDEX_SUBTASK}`)
    console.log(`✓ Index '${INDEX_SUBTASK}' dropped`)

    await client.query('COMMIT')
    console.log(`✅ Rollback for ${MIGRATION_NAME} completed successfully!`)
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(`❌ Rollback for ${MIGRATION_NAME} failed:`, error)
    throw error
  } finally {
    client.release()
  }
}

async function main() {
  const command = process.argv[2]

  try {
    if (command === 'rollback') {
      await rollback()
    } else {
      await migrate()
    }
  } catch (error) {
    // Error already logged in migrate/rollback
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Run the migration
main()
