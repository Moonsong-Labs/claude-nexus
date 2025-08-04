#!/usr/bin/env bun
import { Pool } from 'pg'

// Migration: Add rate limit tracking tables and indexes
async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // Create ENUM type for rate limit types
    console.log('Creating rate limit type enum...')
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rate_limit_type') THEN
          CREATE TYPE rate_limit_type AS ENUM (
            'tokens_per_minute',
            'requests_per_minute', 
            'tokens_per_day',
            'unknown'
          );
        END IF;
      END $$;
    `)

    // Create account_rate_limit_summary table
    console.log('Creating account_rate_limit_summary table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS account_rate_limit_summary (
        id SERIAL PRIMARY KEY,
        account_id VARCHAR(255) NOT NULL UNIQUE,
        first_triggered_at TIMESTAMPTZ NOT NULL,
        last_triggered_at TIMESTAMPTZ NOT NULL,
        retry_until TIMESTAMPTZ,
        total_hits BIGINT NOT NULL DEFAULT 1,
        last_limit_type rate_limit_type,
        last_error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    // Add table comment
    await client.query(`
      COMMENT ON TABLE account_rate_limit_summary IS 
      'Tracks rate limit events per account with summary statistics'
    `)

    // Add column comments
    await client.query(`
      COMMENT ON COLUMN account_rate_limit_summary.account_id IS 
      'Account identifier from credential files'
    `)
    await client.query(`
      COMMENT ON COLUMN account_rate_limit_summary.retry_until IS 
      'Calculated timestamp when the account can retry (from Retry-After header)'
    `)
    await client.query(`
      COMMENT ON COLUMN account_rate_limit_summary.last_limit_type IS 
      'Type of rate limit that was last triggered'
    `)
    await client.query(`
      COMMENT ON COLUMN account_rate_limit_summary.total_hits IS 
      'Total number of rate limit events for this account'
    `)

    // Create indexes
    console.log('Creating indexes...')
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_account_rate_limit_summary_account_id 
      ON account_rate_limit_summary(account_id)
    `)

    // Create index for efficient retry_until queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_account_rate_limit_summary_retry_until 
      ON account_rate_limit_summary(retry_until) 
      WHERE retry_until IS NOT NULL
    `)

    // Create updated_at trigger
    console.log('Creating updated_at trigger...')
    await client.query(`
      CREATE OR REPLACE FUNCTION update_account_rate_limit_summary_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)

    await client.query(`
      CREATE TRIGGER update_account_rate_limit_summary_updated_at
      BEFORE UPDATE ON account_rate_limit_summary
      FOR EACH ROW
      EXECUTE FUNCTION update_account_rate_limit_summary_updated_at()
    `)

    // Create optimized index on api_requests for token window queries
    console.log('Creating optimized index on api_requests for rate limit window queries...')
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_api_requests_account_id_created_at
      ON api_requests(account_id, created_at)
    `)

    // Update statistics
    console.log('Updating table statistics...')
    await client.query('ANALYZE account_rate_limit_summary')
    await client.query('ANALYZE api_requests')

    await client.query('COMMIT')
    console.log('✅ Migration completed successfully')

    // Show verification
    const result = await client.query(`
      SELECT 
        table_name,
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'account_rate_limit_summary'
      ORDER BY ordinal_position
    `)

    console.log('\nCreated table structure:')
    console.table(result.rows)

    const enumResult = await client.query(`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = 'rate_limit_type'::regtype
      ORDER BY enumsortorder
    `)

    console.log('\nRate limit types:')
    console.table(enumResult.rows)
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(error => {
  console.error('Unexpected error:', error)
  process.exit(1)
})
