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

const MIGRATION_NAME = '009-add-response-body-gin-index'
const INDEX_NAME = 'idx_api_requests_response_body_gin'

async function migrate() {
  const client = await pool.connect()

  try {
    console.log(`Starting migration: ${MIGRATION_NAME}...`)
    await client.query('BEGIN')

    // Create GIN index with IF NOT EXISTS for idempotency
    console.log(`Creating GIN index '${INDEX_NAME}' on response_body column...`)
    await client.query(`
      CREATE INDEX IF NOT EXISTS ${INDEX_NAME}
      ON api_requests
      USING GIN (response_body)
    `)
    console.log(`✓ GIN index '${INDEX_NAME}' created or already exists`)

    // Analyze the table to update statistics for query planner
    console.log('Analyzing api_requests table to update statistics...')
    await client.query('ANALYZE api_requests')
    console.log('✓ Table analyzed')

    // Show index statistics
    const indexInfo = await client.query(`
      SELECT 
        pg_size_pretty(pg_relation_size('${INDEX_NAME}')) as index_size,
        pg_size_pretty(pg_relation_size('api_requests')) as table_size
    `)

    if (indexInfo.rows.length > 0) {
      const info = indexInfo.rows[0]
      console.log(`\nIndex statistics:`)
      console.log(`  - Index size: ${info.index_size}`)
      console.log(`  - Table size: ${info.table_size}`)
    }

    await client.query('COMMIT')
    console.log(`\n✅ Migration ${MIGRATION_NAME} completed successfully!`)
    console.log('\nThis index optimizes:')
    console.log('  - Subtask detection queries using @> operator')
    console.log('  - JSONB containment queries (response_body @> ...)')
    console.log('  - JSONPath queries (jsonb_path_exists)')
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

    console.log(`Dropping GIN index '${INDEX_NAME}'...`)
    await client.query(`DROP INDEX IF EXISTS ${INDEX_NAME}`)
    console.log(`✓ Index '${INDEX_NAME}' dropped`)

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
