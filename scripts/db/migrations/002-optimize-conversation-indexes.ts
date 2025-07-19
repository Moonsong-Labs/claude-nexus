#!/usr/bin/env bun
import { Pool } from 'pg'
import { getErrorMessage } from '@claude-nexus/shared'

/**
 * Migration script to optimize conversation query performance through strategic indexing
 *
 * This migration creates composite and covering indexes that significantly improve
 * conversation query performance by:
 * - Reducing index scan time with targeted composite indexes
 * - Eliminating table lookups with covering indexes containing commonly accessed fields
 * - Updating table statistics for optimal query planning
 *
 * This migration is idempotent - it can be run multiple times safely.
 *
 * See ADR-012 for details on the database schema evolution strategy.
 */
async function optimizeConversationIndexes() {
  const startTime = Date.now()

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })

  try {
    console.log('🚀 Starting conversation index optimization migration...')
    console.log('⏰ Start time:', new Date().toISOString())

    // Start transaction
    await pool.query('BEGIN')

    // Check for existing indexes before creating
    const existingIndexes = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'api_requests' 
        AND indexname IN ('idx_requests_conversation_timestamp', 'idx_requests_conversation_detail')
    `)
    const existingIndexNames = existingIndexes.rows.map(row => row.indexname)

    // Create composite index for conversation queries
    if (!existingIndexNames.includes('idx_requests_conversation_timestamp')) {
      console.log('📊 Creating composite index for conversation queries...')
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_requests_conversation_timestamp 
        ON api_requests(conversation_id, timestamp) 
        WHERE conversation_id IS NOT NULL
      `)
      console.log('✅ Composite index created successfully')
    } else {
      console.log(
        'ℹ️  Composite index idx_requests_conversation_timestamp already exists - skipping'
      )
    }

    // Create covering index with commonly needed fields
    if (!existingIndexNames.includes('idx_requests_conversation_detail')) {
      console.log(
        '📊 Creating covering index for conversation details to eliminate table lookups...'
      )
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_requests_conversation_detail
        ON api_requests(conversation_id, timestamp, request_id, domain, model, total_tokens, branch_id) 
        WHERE conversation_id IS NOT NULL
      `)
      console.log('✅ Covering index created successfully')
    } else {
      console.log('ℹ️  Covering index idx_requests_conversation_detail already exists - skipping')
    }

    // Analyze table to update statistics
    console.log('📈 Analyzing api_requests table to update query planner statistics...')
    await pool.query('ANALYZE api_requests')
    console.log('✅ Table statistics updated successfully')

    // Check all indexes and their sizes
    console.log('\n🔍 Verifying indexes on api_requests table...')
    const indexesResult = await pool.query(`
      SELECT 
        i.indexname,
        i.indexdef,
        pg_size_pretty(pg_relation_size(c.oid)) as index_size
      FROM pg_indexes i
      JOIN pg_class c ON c.relname = i.indexname
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE i.tablename = 'api_requests'
        AND n.nspname = i.schemaname
      ORDER BY pg_relation_size(c.oid) DESC
    `)

    console.log(`\n📋 Total indexes on api_requests: ${indexesResult.rowCount}`)
    console.log('\nIndex details:')
    indexesResult.rows.forEach(row => {
      console.log(`  • ${row.indexname} (${row.index_size})`)
    })

    // Verify our specific indexes were created
    const createdIndexes = indexesResult.rows.filter(
      row =>
        row.indexname === 'idx_requests_conversation_timestamp' ||
        row.indexname === 'idx_requests_conversation_detail'
    )

    if (createdIndexes.length < 2) {
      throw new Error('Not all expected conversation indexes were created successfully')
    }

    console.log('\n✅ All conversation performance indexes verified successfully')

    // Get comprehensive table statistics
    console.log('\n📊 Retrieving table statistics...')
    const statsResult = await pool.query(`
      SELECT 
        schemaname,
        relname,
        n_live_tup as row_count,
        n_dead_tup as dead_rows,
        pg_size_pretty(pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname))) as total_size,
        pg_size_pretty(pg_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname))) as table_size,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        last_autoanalyze
      FROM pg_stat_user_tables
      WHERE relname = 'api_requests'
    `)

    if (statsResult.rows.length > 0) {
      const stats = statsResult.rows[0]
      console.log(`\nTable statistics for api_requests:`)
      console.log(`  • Live rows: ${stats.row_count.toLocaleString()}`)
      console.log(`  • Dead rows: ${stats.dead_rows.toLocaleString()}`)
      console.log(`  • Total size (with indexes): ${stats.total_size}`)
      console.log(`  • Table size (data only): ${stats.table_size}`)
      console.log(`  • Last vacuum: ${stats.last_vacuum || stats.last_autovacuum || 'Never'}`)
      console.log(`  • Last analyze: ${stats.last_analyze || stats.last_autoanalyze || 'Never'}`)
    }

    // Commit transaction
    await pool.query('COMMIT')

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`\n✨ Conversation index optimization completed successfully!`)
    console.log(`⏱️  Total execution time: ${elapsedTime} seconds`)
    console.log('\n🎉 Migration 002-optimize-conversation-indexes completed')
  } catch (error) {
    // Rollback on error
    await pool.query('ROLLBACK')
    console.error('❌ Index optimization failed:', getErrorMessage(error))
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Run the migration
optimizeConversationIndexes().catch(error => {
  console.error('❌ Migration failed:', getErrorMessage(error))
  process.exit(1)
})
