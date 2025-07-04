#!/usr/bin/env bun
import { Pool } from 'pg'

/**
 * Migration to add conversation_analyses table for storing analysis results
 * This separates the transient job queue from the persistent analysis results
 */
async function createConversationAnalysesTable() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })

  try {
    console.log('Starting conversation_analyses table creation...')

    // Start transaction
    await pool.query('BEGIN')

    // Create conversation_analyses table
    console.log('Creating conversation_analyses table...')
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversation_analyses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL UNIQUE,
        analysis_result JSONB,
        
        -- Metadata
        model_used VARCHAR(100),
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        total_tokens INTEGER,
        
        -- Timestamps
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    // Create indexes
    console.log('Creating indexes for conversation_analyses...')

    // Primary lookup index
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_analyses_conversation_id
      ON conversation_analyses (conversation_id)
    `)

    // Index for querying recent analyses
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_analyses_updated_at
      ON conversation_analyses (updated_at DESC)
    `)

    // Create trigger to automatically update the updated_at timestamp
    console.log('Creating updated_at trigger...')

    // Ensure the function exists (idempotent)
    await pool.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)

    await pool.query(`
      CREATE TRIGGER set_conversation_analyses_timestamp
      BEFORE UPDATE ON conversation_analyses
      FOR EACH ROW
      EXECUTE PROCEDURE set_updated_at()
    `)

    // Add table and column comments
    console.log('Adding table and column comments...')
    await pool.query(
      `COMMENT ON TABLE conversation_analyses IS 'Persistent storage for AI-generated conversation analyses'`
    )
    await pool.query(
      `COMMENT ON COLUMN conversation_analyses.conversation_id IS 'Unique conversation identifier - one analysis per conversation'`
    )
    await pool.query(
      `COMMENT ON COLUMN conversation_analyses.analysis_result IS 'JSON structure containing the Gemini-generated analysis'`
    )
    await pool.query(
      `COMMENT ON COLUMN conversation_analyses.model_used IS 'The Gemini model used for this analysis'`
    )
    await pool.query(
      `COMMENT ON COLUMN conversation_analyses.prompt_tokens IS 'Number of tokens in the analysis prompt'`
    )
    await pool.query(
      `COMMENT ON COLUMN conversation_analyses.completion_tokens IS 'Number of tokens in the analysis response'`
    )
    await pool.query(
      `COMMENT ON COLUMN conversation_analyses.total_tokens IS 'Total tokens used (prompt + completion)'`
    )

    // Verify table was created
    console.log('Verifying migration...')
    const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'conversation_analyses'
    `)

    if (tableCheck.rows.length === 0) {
      throw new Error('conversation_analyses table was not created')
    }

    // Verify unique constraint
    const constraintCheck = await pool.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'conversation_analyses'
      AND constraint_type = 'UNIQUE'
    `)

    if (constraintCheck.rows.length === 0) {
      throw new Error('Unique constraint on conversation_id was not created')
    }

    // Commit transaction
    await pool.query('COMMIT')
    console.log('Migration completed successfully!')
    console.log('✅ conversation_analyses table created with all indexes and constraints')
  } catch (error) {
    // Rollback on error
    try {
      await pool.query('ROLLBACK')
    } catch (rollbackError) {
      console.error(
        'Rollback failed:',
        rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
      )
    }
    console.error('Migration failed:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  } finally {
    try {
      await pool.end()
    } catch (endError) {
      console.error(
        'Failed to close pool:',
        endError instanceof Error ? endError.message : String(endError)
      )
    }
  }
}

// Run migration
createConversationAnalysesTable().catch(console.error)
