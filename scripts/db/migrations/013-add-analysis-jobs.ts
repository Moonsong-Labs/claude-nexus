#!/usr/bin/env bun
import { Pool } from 'pg'

/**
 * Migration to add analysis_jobs table for background conversation analysis
 */
async function createAnalysisJobsTable() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })

  try {
    console.log('Starting analysis_jobs table creation...')

    // Start transaction
    await pool.query('BEGIN')

    // Create analysis job status enum type
    console.log('Creating analysis_job_status enum type...')
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE analysis_job_status AS ENUM (
          'pending',
          'processing',
          'completed',
          'failed'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `)

    // Create analysis_jobs table
    console.log('Creating analysis_jobs table...')
    await pool.query(`
      CREATE TABLE IF NOT EXISTS analysis_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL,
        status analysis_job_status NOT NULL DEFAULT 'pending',
        
        attempts SMALLINT NOT NULL DEFAULT 0,
        last_error TEXT,
        
        -- Timestamps for tracking and watchdog
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processing_started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,

        -- Metrics
        duration_ms BIGINT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,

        -- Note: analysis_result is stored in separate conversation_analyses table
        CONSTRAINT max_attempts CHECK (attempts <= 3)
      )
    `)

    // Create indexes for efficient querying
    console.log('Creating indexes for analysis_jobs...')

    // Index for claiming pending jobs efficiently
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_analysis_jobs_pending_status
      ON analysis_jobs (created_at)
      WHERE status = 'pending'
    `)

    // Index for watchdog to find stuck jobs
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_analysis_jobs_stuck
      ON analysis_jobs (status, updated_at)
      WHERE status = 'processing'
    `)

    // Index for querying by conversation_id
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_analysis_jobs_conversation_id
      ON analysis_jobs (conversation_id)
    `)

    // Unique partial index to prevent duplicate active jobs per conversation
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_analysis_jobs_unique_active_conversation
      ON analysis_jobs (conversation_id)
      WHERE status IN ('pending', 'processing')
    `)

    // Create trigger to automatically update the updated_at timestamp
    console.log('Creating updated_at trigger...')
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
      CREATE TRIGGER set_analysis_jobs_timestamp
      BEFORE UPDATE ON analysis_jobs
      FOR EACH ROW
      EXECUTE PROCEDURE set_updated_at()
    `)

    // Add table and column comments
    console.log('Adding table and column comments...')
    await pool.query(
      `COMMENT ON TABLE analysis_jobs IS 'Background job queue for AI-powered conversation analysis'`
    )
    await pool.query(
      `COMMENT ON COLUMN analysis_jobs.conversation_id IS 'Reference to the conversation being analyzed'`
    )
    await pool.query(
      `COMMENT ON COLUMN analysis_jobs.status IS 'Current status of the analysis job'`
    )
    await pool.query(
      `COMMENT ON COLUMN analysis_jobs.attempts IS 'Number of processing attempts (max 3)'`
    )
    await pool.query(
      `COMMENT ON COLUMN analysis_jobs.last_error IS 'Error message from the most recent failed attempt'`
    )
    await pool.query(
      `COMMENT ON COLUMN analysis_jobs.processing_started_at IS 'When the job started processing (for watchdog timeout)'`
    )
    await pool.query(
      `COMMENT ON COLUMN analysis_jobs.duration_ms IS 'Total processing time in milliseconds'`
    )
    await pool.query(
      `COMMENT ON COLUMN analysis_jobs.prompt_tokens IS 'Number of tokens in the Gemini API prompt'`
    )
    await pool.query(
      `COMMENT ON COLUMN analysis_jobs.completion_tokens IS 'Number of tokens in the Gemini API response'`
    )

    // Verify table was created
    console.log('Verifying migration...')
    const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'analysis_jobs'
    `)

    if (tableCheck.rows.length === 0) {
      throw new Error('analysis_jobs table was not created')
    }

    // Verify enum type was created
    const enumCheck = await pool.query(`
      SELECT typname 
      FROM pg_type 
      WHERE typname = 'analysis_job_status'
    `)

    if (enumCheck.rows.length === 0) {
      throw new Error('analysis_job_status enum type was not created')
    }

    // Commit transaction
    await pool.query('COMMIT')
    console.log('Migration completed successfully!')
    console.log('✅ analysis_jobs table created with all indexes and constraints')
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
createAnalysisJobsTable().catch(console.error)
