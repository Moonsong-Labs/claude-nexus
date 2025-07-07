#!/usr/bin/env bun
/**
 * Migration 012: Add custom_prompt column to conversation_analyses table
 *
 * This migration adds a column to store custom prompts that users can provide
 * when generating conversation analyses.
 */

import { Pool } from 'pg'
import { config } from 'dotenv'

// Load environment variables
config()

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    console.log('Migration 012: Adding custom_prompt column to conversation_analyses table...')

    // Add custom_prompt column
    console.log('\n1. Adding custom_prompt column...')
    await pool.query(`
      ALTER TABLE conversation_analyses 
      ADD COLUMN IF NOT EXISTS custom_prompt TEXT;
    `)
    console.log('✓ custom_prompt column added')

    // Create index on custom_prompt to find analyses with custom prompts
    console.log('\n2. Creating index on custom_prompt...')
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_analyses_has_custom_prompt
      ON conversation_analyses ((custom_prompt IS NOT NULL))
      WHERE custom_prompt IS NOT NULL;
    `)
    console.log('✓ Index created')

    console.log('\n✅ Migration 012 completed successfully')
  } catch (error) {
    console.error('❌ Migration 012 failed:', error)
    throw error
  } finally {
    await pool.end()
  }
}

// Run the migration
migrate().catch(console.error)