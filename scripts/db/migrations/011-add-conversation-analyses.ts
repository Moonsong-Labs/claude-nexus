#!/usr/bin/env bun
import { Pool } from 'pg'
import { config } from 'dotenv'

// Load environment variables
config()

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

const pool = new Pool({
  connectionString: DATABASE_URL,
})

async function runMigration() {
  const client = await pool.connect()

  try {
    console.log('Starting migration 009: Add conversation analyses table...')

    await client.query('BEGIN')

    // Create conversation_analyses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_analyses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL,
        analysis_result JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        model_used VARCHAR(100),
        input_tokens INTEGER,
        output_tokens INTEGER
      )
    `)

    console.log('Created conversation_analyses table')

    // Add index on conversation_id for fast lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_analyses_conversation_id 
      ON conversation_analyses(conversation_id)
    `)

    console.log('Created index on conversation_id')

    // Add unique constraint to ensure one analysis per conversation
    // (can be removed if we want to allow multiple analyses)
    await client.query(`
      ALTER TABLE conversation_analyses 
      ADD CONSTRAINT unique_conversation_analysis 
      UNIQUE (conversation_id)
    `)

    console.log('Added unique constraint on conversation_id')

    await client.query('COMMIT')
    console.log('Migration 009 completed successfully')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Migration 009 failed:', error)
    throw error
  } finally {
    client.release()
  }
}

runMigration()
  .then(() => {
    console.log('Migration completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
  .finally(() => {
    pool.end()
  })
