#!/usr/bin/env bun
import { Pool } from 'pg'

// Migration: Add rate limit events table with partitioning
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

    // Create new ENUM type for rate limit types
    console.log('Creating rate limit event type enum...')
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rate_limit_event_type') THEN
          CREATE TYPE rate_limit_event_type AS ENUM (
            '5h_sliding',
            'weekly'
          );
        END IF;
      END $$;
    `)

    // Create rate_limit_events partitioned table
    console.log('Creating rate_limit_events partitioned table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS rate_limit_events (
        id UUID DEFAULT gen_random_uuid(),
        request_id UUID NOT NULL,
        account_id VARCHAR(255) NOT NULL,
        domain VARCHAR(255) NOT NULL,
        limit_type rate_limit_event_type NOT NULL,
        triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        metadata JSONB,
        PRIMARY KEY (triggered_at, id)
      ) PARTITION BY RANGE (triggered_at)
    `)

    // Add table comment
    await client.query(`
      COMMENT ON TABLE rate_limit_events IS 
      'Stores individual rate limit events for tracking and visualization'
    `)

    // Add column comments
    await client.query(`
      COMMENT ON COLUMN rate_limit_events.request_id IS 
      'The API request that triggered this rate limit'
    `)
    await client.query(`
      COMMENT ON COLUMN rate_limit_events.limit_type IS 
      'Type of rate limit: 5h_sliding (5-hour sliding window) or weekly'
    `)
    await client.query(`
      COMMENT ON COLUMN rate_limit_events.metadata IS 
      'Additional data from the 429 response (retry-after headers, error details, etc)'
    `)

    // Create indexes on parent table (will be inherited by partitions)
    console.log('Creating indexes...')
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rate_limit_events_account_domain_time 
      ON rate_limit_events(account_id, domain, triggered_at DESC)
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rate_limit_events_request_id 
      ON rate_limit_events(request_id)
    `)

    // Create initial partitions for current and next 3 months
    const currentDate = new Date()
    const partitions = []

    for (let i = 0; i < 4; i++) {
      const partitionDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1)
      const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + i + 1, 1)

      const year = partitionDate.getFullYear()
      const month = String(partitionDate.getMonth() + 1).padStart(2, '0')
      const partitionName = `rate_limit_events_${year}_${month}`

      const startDate = partitionDate.toISOString().split('T')[0]
      const endDate = nextMonth.toISOString().split('T')[0]

      partitions.push({ name: partitionName, start: startDate, end: endDate })
    }

    for (const partition of partitions) {
      console.log(`Creating partition ${partition.name}...`)
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${partition.name} 
        PARTITION OF rate_limit_events 
        FOR VALUES FROM ('${partition.start}') TO ('${partition.end}')
      `)
    }

    // Create a function to help with partition maintenance
    console.log('Creating partition maintenance function...')
    await client.query(`
      CREATE OR REPLACE FUNCTION create_rate_limit_events_partition(start_date DATE, end_date DATE)
      RETURNS void AS $$
      DECLARE
        partition_name TEXT;
      BEGIN
        partition_name := 'rate_limit_events_' || to_char(start_date, 'YYYY_MM');
        
        EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF rate_limit_events FOR VALUES FROM (%L) TO (%L)',
          partition_name, start_date, end_date);
      END;
      $$ LANGUAGE plpgsql
    `)

    // Create a function to drop old partitions
    await client.query(`
      CREATE OR REPLACE FUNCTION drop_old_rate_limit_events_partitions(retention_days INTEGER DEFAULT 90)
      RETURNS void AS $$
      DECLARE
        partition_record RECORD;
        cutoff_date DATE;
      BEGIN
        cutoff_date := CURRENT_DATE - retention_days;
        
        FOR partition_record IN 
          SELECT 
            schemaname,
            tablename 
          FROM pg_tables 
          WHERE tablename LIKE 'rate_limit_events_%' 
            AND tablename ~ '^rate_limit_events_[0-9]{4}_[0-9]{2}$'
        LOOP
          -- Extract year and month from partition name
          IF substring(partition_record.tablename from 19 for 7) < to_char(cutoff_date, 'YYYY_MM') THEN
            EXECUTE format('DROP TABLE IF EXISTS %I.%I', partition_record.schemaname, partition_record.tablename);
            RAISE NOTICE 'Dropped old partition: %', partition_record.tablename;
          END IF;
        END LOOP;
      END;
      $$ LANGUAGE plpgsql
    `)

    // Update statistics
    console.log('Updating table statistics...')
    await client.query('ANALYZE rate_limit_events')

    await client.query('COMMIT')
    console.log('✅ Migration completed successfully')

    // Show verification
    const tableResult = await client.query(`
      SELECT 
        table_name,
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'rate_limit_events'
      ORDER BY ordinal_position
    `)

    console.log('\nCreated table structure:')
    console.table(tableResult.rows)

    const enumResult = await client.query(`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = 'rate_limit_event_type'::regtype
      ORDER BY enumsortorder
    `)

    console.log('\nRate limit event types:')
    console.table(enumResult.rows)

    const partitionResult = await client.query(`
      SELECT 
        schemaname,
        tablename as partition_name,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
      FROM pg_tables 
      WHERE tablename LIKE 'rate_limit_events_%'
      ORDER BY tablename
    `)

    console.log('\nCreated partitions:')
    console.table(partitionResult.rows)
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
