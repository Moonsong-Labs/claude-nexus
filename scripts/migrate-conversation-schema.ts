#!/usr/bin/env bun
import { Pool } from 'pg'

/**
 * Migration script to add conversation tracking columns to the database
 */
async function migrateConversationSchema() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })

  try {
    console.log('Starting conversation schema migration...')

    // Start transaction
    await pool.query('BEGIN')

    // Add new columns to api_requests table
    console.log('Adding conversation tracking columns...')
    await pool.query(`
      ALTER TABLE api_requests
      ADD COLUMN IF NOT EXISTS current_message_hash CHAR(64),
      ADD COLUMN IF NOT EXISTS parent_message_hash CHAR(64),
      ADD COLUMN IF NOT EXISTS conversation_id UUID,
      ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255) DEFAULT 'main'
    `)

    // Create indexes for efficient lookups
    console.log('Creating indexes...')
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_requests_current_message_hash 
      ON api_requests(current_message_hash)
    `)

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_requests_parent_message_hash 
      ON api_requests(parent_message_hash)
    `)

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_requests_conversation_id 
      ON api_requests(conversation_id)
    `)

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_requests_branch_id 
      ON api_requests(branch_id)
    `)

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_requests_conversation_branch 
      ON api_requests(conversation_id, branch_id)
    `)

    // Add column comments
    console.log('Adding column comments...')
    await pool.query(`
      COMMENT ON COLUMN api_requests.current_message_hash IS 'SHA-256 hash of the last message in this request';
      COMMENT ON COLUMN api_requests.parent_message_hash IS 'SHA-256 hash of the previous message (null for conversation start)';
      COMMENT ON COLUMN api_requests.conversation_id IS 'UUID grouping related messages into conversations';
      COMMENT ON COLUMN api_requests.branch_id IS 'Branch identifier within a conversation (defaults to main)';
    `)

    // Verify all columns exist
    console.log('Verifying migration...')
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'api_requests' 
      AND column_name IN ('current_message_hash', 'parent_message_hash', 'conversation_id', 'branch_id')
    `)

    const foundColumns = columnCheck.rows.map(row => row.column_name)
    const expectedColumns = ['current_message_hash', 'parent_message_hash', 'conversation_id', 'branch_id']
    const missingColumns = expectedColumns.filter(col => !foundColumns.includes(col))

    if (missingColumns.length > 0) {
      throw new Error(`Missing columns after migration: ${missingColumns.join(', ')}`)
    }

    // Commit transaction
    await pool.query('COMMIT')
    console.log('Migration completed successfully!')
    console.log(`✅ All conversation tracking columns are present`)
  } catch (error) {
    // Rollback on error
    await pool.query('ROLLBACK')
    console.error('Migration failed:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Run migration
migrateConversationSchema().catch(console.error)
