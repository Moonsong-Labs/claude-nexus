#!/usr/bin/env bun
import { Pool } from 'pg'

/**
 * Optimization script for conversation window function queries
 * Adds index to support efficient ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY timestamp DESC, request_id DESC)
 */
async function optimizeConversationWindowFunctions() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })

  try {
    console.log('Starting conversation window function optimization...')

    // Start transaction
    await pool.query('BEGIN')

    // Create composite index for window function with deterministic ordering
    console.log('Creating composite index for window function queries...')
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_requests_conversation_timestamp_id 
      ON api_requests(conversation_id, timestamp DESC, request_id DESC) 
      WHERE conversation_id IS NOT NULL
    `)

    // Create index for subtask filtering and ordering
    console.log('Creating index for subtask queries...')
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_requests_conversation_subtask 
      ON api_requests(conversation_id, is_subtask, timestamp ASC, request_id ASC) 
      WHERE conversation_id IS NOT NULL
    `)

    // Ensure request_id is indexed for the final LEFT JOIN
    console.log('Ensuring request_id index exists...')
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_requests_request_id 
      ON api_requests(request_id)
    `)

    // Drop redundant index if it exists (replaced by more specific index)
    console.log('Checking for redundant indexes...')
    const redundantIndexResult = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'api_requests' 
      AND indexname = 'idx_requests_conversation_timestamp'
    `)

    if (redundantIndexResult.rows.length > 0) {
      console.log('Dropping redundant index idx_requests_conversation_timestamp...')
      await pool.query('DROP INDEX IF EXISTS idx_requests_conversation_timestamp')
    }

    // Analyze table to update statistics
    console.log('Analyzing api_requests table to update statistics...')
    await pool.query('ANALYZE api_requests')

    // Check current indexes
    console.log('Checking current indexes on api_requests...')
    const indexesResult = await pool.query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'api_requests'
      ORDER BY indexname
    `)

    console.log(`Found ${indexesResult.rowCount} indexes on api_requests table`)

    // Check for the specific indexes we created
    const requiredIndexes = [
      'idx_requests_conversation_timestamp_id',
      'idx_requests_conversation_subtask',
      'idx_requests_request_id',
    ]

    const createdIndexes = indexesResult.rows.filter(row => requiredIndexes.includes(row.indexname))

    if (createdIndexes.length < requiredIndexes.length) {
      const missingIndexes = requiredIndexes.filter(
        idx => !createdIndexes.some(row => row.indexname === idx)
      )
      throw new Error(
        `Not all expected indexes were created. Missing: ${missingIndexes.join(', ')}`
      )
    }

    console.log('All required indexes created successfully:')
    createdIndexes.forEach(idx => {
      console.log(`  - ${idx.indexname}`)
    })

    // Get table statistics
    console.log('\nChecking table statistics...')
    const statsResult = await pool.query(`
      SELECT 
        schemaname,
        tablename,
        n_live_tup as row_count,
        n_dead_tup as dead_rows,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        last_autoanalyze
      FROM pg_stat_user_tables
      WHERE tablename = 'api_requests'
    `)

    if (statsResult.rows.length > 0) {
      const stats = statsResult.rows[0]
      console.log(`Table statistics:`)
      console.log(`  - Live rows: ${stats.row_count}`)
      console.log(`  - Dead rows: ${stats.dead_rows}`)
      console.log(`  - Last analyze: ${stats.last_analyze || stats.last_autoanalyze || 'Never'}`)
    }

    // Commit transaction
    await pool.query('COMMIT')
    console.log('\nConversation window function optimization completed successfully!')
    console.log('✅ All performance indexes created and table analyzed')
    console.log(
      '\nNote: The optimized query now uses window functions instead of correlated subqueries,'
    )
    console.log('which should significantly improve performance on large datasets.')
  } catch (error) {
    // Rollback on error
    await pool.query('ROLLBACK')
    console.error(
      'Index optimization failed:',
      error instanceof Error ? error.message : String(error)
    )
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Run optimization
optimizeConversationWindowFunctions().catch(console.error)
