#!/usr/bin/env bun
import { Pool } from 'pg'

/**
 * Migration script to add message_count column to api_requests table
 */
async function addMessageCountColumn() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })

  try {
    console.log('Starting message_count column migration...')

    // Start transaction
    await pool.query('BEGIN')

    // Check if column already exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'api_requests' 
      AND column_name = 'message_count'
    `)

    if (columnCheck.rows.length > 0) {
      console.log('Column message_count already exists, skipping migration')
      await pool.query('ROLLBACK')
      return
    }

    // Add message_count column
    console.log('Adding message_count column...')
    await pool.query(`
      ALTER TABLE api_requests
      ADD COLUMN message_count INTEGER DEFAULT 0
    `)

    // Create index
    console.log('Creating index...')
    await pool.query(`
      CREATE INDEX idx_api_requests_message_count 
      ON api_requests(message_count)
    `)

    // Add comment
    console.log('Adding column comment...')
    await pool.query(`
      COMMENT ON COLUMN api_requests.message_count IS 'Total number of messages in the conversation up to this request'
    `)

    // Commit transaction
    await pool.query('COMMIT')
    console.log('Migration completed successfully!')
    
    // Optional: Update existing records based on request body
    console.log('\nDo you want to update existing records with calculated message counts? (This may take a while)')
    console.log('Run: bun run scripts/recalculate-message-counts.ts')
    
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
addMessageCountColumn().catch(console.error)