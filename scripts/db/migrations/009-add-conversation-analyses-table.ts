#!/usr/bin/env bun
/**
 * Migration 009: Add conversation_analyses table
 *
 * Creates the conversation_analyses table to store AI-generated analyses
 * of conversations, supporting multiple analyses per conversation branch
 * with status tracking and metadata storage.
 */

import { Client } from 'pg'
import { config } from '@claude-nexus/shared/config'

async function migrate() {
  const client = new Client({ connectionString: config.database.url })

  try {
    await client.connect()
    console.log('Connected to database')

    // Start transaction
    await client.query('BEGIN')

    // Create conversation_analyses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_analyses (
        id VARCHAR(255) PRIMARY KEY,
        conversation_id UUID NOT NULL,
        branch_id VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        content TEXT,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP,
        
        -- Create a unique index to ensure only one active analysis per conversation branch
        -- (excluding failed analyses which can be retried)
        CONSTRAINT unique_active_analysis EXCLUDE USING btree (
          conversation_id WITH =,
          branch_id WITH =
        ) WHERE (status NOT IN ('failed'))
      )
    `)
    console.log('Created conversation_analyses table')

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_analyses_lookup 
      ON conversation_analyses(conversation_id, branch_id, created_at DESC)
    `)
    console.log('Created lookup index')

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_analyses_status 
      ON conversation_analyses(status) 
      WHERE status IN ('pending', 'processing')
    `)
    console.log('Created status index')

    // Note: We don't add a foreign key constraint since api_requests doesn't have
    // a unique constraint on (conversation_id, branch_id) - we'll validate existence
    // in application code instead

    // Commit transaction
    await client.query('COMMIT')
    console.log('Migration 009 completed successfully')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Migration 009 failed:', error)
    throw error
  } finally {
    await client.end()
  }
}

// Run migration
migrate().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
