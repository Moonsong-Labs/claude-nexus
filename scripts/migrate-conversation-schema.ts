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
      ADD COLUMN IF NOT EXISTS conversation_id UUID
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

    // Commit transaction
    await pool.query('COMMIT')
    console.log('Migration completed successfully!')
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
