#!/usr/bin/env bun
import { Pool } from 'pg'
import { logger } from '../packages/shared/src/logger/index.js'

/**
 * Migration script to add conversation tracking columns to the database
 */
async function migrateConversationSchema() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    logger.error('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })

  try {
    logger.info('Starting conversation schema migration...')

    // Start transaction
    await pool.query('BEGIN')

    // Add new columns to api_requests table
    logger.info('Adding conversation tracking columns...')
    await pool.query(`
      ALTER TABLE api_requests
      ADD COLUMN IF NOT EXISTS current_message_hash CHAR(64),
      ADD COLUMN IF NOT EXISTS parent_message_hash CHAR(64),
      ADD COLUMN IF NOT EXISTS conversation_id UUID
    `)

    // Create indexes for efficient lookups
    logger.info('Creating indexes...')
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
    logger.info('Migration completed successfully!')
  } catch (error) {
    // Rollback on error
    await pool.query('ROLLBACK')
    logger.error('Migration failed', {
      metadata: { error: error instanceof Error ? error.message : String(error) },
    })
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Run migration
migrateConversationSchema().catch(console.error)
