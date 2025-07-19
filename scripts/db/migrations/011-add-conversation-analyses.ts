#!/usr/bin/env bun
/**
 * Migration 011: Add complete AI analysis infrastructure
 *
 * This migration creates all tables and structures needed for AI-powered conversation analysis:
 * 1. conversation_analyses table - Stores AI-generated analyses of conversations
 * 2. analysis_audit_log table - Tracks all AI analysis related events
 *
 * Features:
 * - ENUM type for status field (better than CHECK constraint)
 * - Automatic updated_at trigger
 * - Custom prompt support
 * - Comprehensive audit logging
 * - Optimized indexes for queue processing and lookups
 *
 * According to ADR-012: Database Schema Evolution Strategy
 * - Migrations use TypeScript for consistency with the codebase
 * - Each migration is idempotent and can be run multiple times safely
 * - Includes rollback functionality for reversibility
 *
 * Usage:
 *   bun run scripts/db/migrations/011-add-conversation-analyses.ts
 *   bun run scripts/db/migrations/011-add-conversation-analyses.ts rollback
 *   bun run scripts/db/migrations/011-add-conversation-analyses.ts help
 */

import { Pool } from 'pg'
import { config } from 'dotenv'
import { getErrorMessage } from '@claude-nexus/shared'

// Load environment variables
config()

// Constants
const MIGRATION_NAME = '011-add-conversation-analyses'
const ENUM_NAME = 'conversation_analysis_status'
const ANALYSES_TABLE = 'conversation_analyses'
const AUDIT_TABLE = 'analysis_audit_log'
const TRIGGER_FUNCTION = 'trigger_set_timestamp'
const TRIGGER_NAME = 'set_timestamp_on_conversation_analyses'

// Validate required environment variables
function validateEnvironment(): void {
  const requiredVars = ['DATABASE_URL']
  const missing = requiredVars.filter(varName => !process.env[varName])

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '))
    console.error('Please ensure your .env file is properly configured.')
    process.exit(1)
  }
}

async function migrate(): Promise<void> {
  const startTime = Date.now()
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()

  try {
    console.log(`🚀 Starting migration ${MIGRATION_NAME}...`)
    console.log('⏰ Start time:', new Date().toISOString())

    // Start transaction
    await client.query('BEGIN')

    // Create ENUM type for status
    console.log(`\n1. Creating ${ENUM_NAME} ENUM type...`)
    await client.query(`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${ENUM_NAME}') THEN
              CREATE TYPE ${ENUM_NAME} AS ENUM (
                  'pending',
                  'processing',
                  'completed',
                  'failed'
              );
              RAISE NOTICE 'Created ${ENUM_NAME} ENUM type';
          ELSE
              RAISE NOTICE '${ENUM_NAME} ENUM type already exists';
          END IF;
      END$$;
    `)
    console.log('✓ ENUM type ready')

    // Create or replace the updated_at trigger function
    console.log(`\n2. Creating ${TRIGGER_FUNCTION} function...`)
    await client.query(`
      CREATE OR REPLACE FUNCTION ${TRIGGER_FUNCTION}()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)
    console.log('✓ Trigger function created')

    // Create the conversation_analyses table
    console.log(`\n3. Creating ${ANALYSES_TABLE} table...`)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${ANALYSES_TABLE} (
          id BIGSERIAL PRIMARY KEY,
          conversation_id UUID NOT NULL,
          branch_id VARCHAR(255) NOT NULL DEFAULT 'main',
          status ${ENUM_NAME} NOT NULL DEFAULT 'pending',
          model_used VARCHAR(255) DEFAULT 'gemini-2.5-pro',
          analysis_content TEXT,
          analysis_data JSONB,
          raw_response JSONB,
          error_message TEXT,
          retry_count INTEGER DEFAULT 0,
          generated_at TIMESTAMPTZ,
          processing_duration_ms INTEGER,
          prompt_tokens INTEGER,
          completion_tokens INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ,
          custom_prompt TEXT,
          UNIQUE (conversation_id, branch_id)
      );
    `)
    console.log(`✓ ${ANALYSES_TABLE} table created`)

    // Create the updated_at trigger
    console.log('\n4. Creating updated_at trigger...')
    await client.query(`
      DROP TRIGGER IF EXISTS ${TRIGGER_NAME} ON ${ANALYSES_TABLE};
      CREATE TRIGGER ${TRIGGER_NAME}
      BEFORE UPDATE ON ${ANALYSES_TABLE}
      FOR EACH ROW
      EXECUTE FUNCTION ${TRIGGER_FUNCTION}();
    `)
    console.log('✓ Trigger created')

    // Create indexes for conversation_analyses
    console.log(`\n5. Creating indexes for ${ANALYSES_TABLE}...`)

    // Index for finding pending analyses
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_analyses_status
      ON ${ANALYSES_TABLE} (status)
      WHERE status = 'pending';
    `)
    console.log('  ✓ Created partial index on status for pending analyses')

    // Index for conversation lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_analyses_conversation
      ON ${ANALYSES_TABLE} (conversation_id, branch_id);
    `)
    console.log('  ✓ Created composite index on (conversation_id, branch_id)')

    // Index for custom prompts
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_analyses_has_custom_prompt
      ON ${ANALYSES_TABLE} ((custom_prompt IS NOT NULL))
      WHERE custom_prompt IS NOT NULL;
    `)
    console.log('  ✓ Created index for custom prompts')

    // Add column comments for conversation_analyses
    console.log(`\n6. Adding column comments for ${ANALYSES_TABLE}...`)
    await client.query(`
      COMMENT ON TABLE ${ANALYSES_TABLE} IS 'Stores AI-generated analyses of conversations';
      COMMENT ON COLUMN ${ANALYSES_TABLE}.conversation_id IS 'UUID of the conversation being analyzed';
      COMMENT ON COLUMN ${ANALYSES_TABLE}.branch_id IS 'Branch within the conversation (defaults to main)';
      COMMENT ON COLUMN ${ANALYSES_TABLE}.status IS 'Processing status: pending, processing, completed, or failed';
      COMMENT ON COLUMN ${ANALYSES_TABLE}.model_used IS 'AI model used for analysis (e.g., gemini-2.5-pro)';
      COMMENT ON COLUMN ${ANALYSES_TABLE}.analysis_content IS 'Human-readable analysis text';
      COMMENT ON COLUMN ${ANALYSES_TABLE}.analysis_data IS 'Structured analysis data in JSON format';
      COMMENT ON COLUMN ${ANALYSES_TABLE}.raw_response IS 'Complete raw response from the AI model';
      COMMENT ON COLUMN ${ANALYSES_TABLE}.error_message IS 'Error details if analysis failed';
      COMMENT ON COLUMN ${ANALYSES_TABLE}.retry_count IS 'Number of retry attempts for failed analyses';
      COMMENT ON COLUMN ${ANALYSES_TABLE}.generated_at IS 'Timestamp when the analysis was completed';
      COMMENT ON COLUMN ${ANALYSES_TABLE}.processing_duration_ms IS 'Time taken to generate the analysis in milliseconds';
      COMMENT ON COLUMN ${ANALYSES_TABLE}.prompt_tokens IS 'Number of tokens used in the prompt';
      COMMENT ON COLUMN ${ANALYSES_TABLE}.completion_tokens IS 'Number of tokens in the completion';
      COMMENT ON COLUMN ${ANALYSES_TABLE}.completed_at IS 'Timestamp when the analysis was completed (status changed to completed or failed)';
      COMMENT ON COLUMN ${ANALYSES_TABLE}.custom_prompt IS 'Optional custom prompt provided by the user to guide the analysis';
    `)
    console.log('✓ Column comments added')

    // Create analysis_audit_log table
    console.log(`\n7. Creating ${AUDIT_TABLE} table...`)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${AUDIT_TABLE} (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(50) NOT NULL,
        outcome VARCHAR(50) NOT NULL,
        conversation_id UUID NOT NULL,
        branch_id VARCHAR(255) NOT NULL,
        domain VARCHAR(255) NOT NULL,
        request_id VARCHAR(255) NOT NULL,
        user_context JSONB DEFAULT '{}',
        metadata JSONB DEFAULT '{}',
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `)
    console.log(`✓ ${AUDIT_TABLE} table created`)

    // Create indexes for analysis_audit_log
    console.log(`\n8. Creating indexes for ${AUDIT_TABLE}...`)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_conversation ON ${AUDIT_TABLE} (conversation_id, branch_id);
      CREATE INDEX IF NOT EXISTS idx_audit_domain ON ${AUDIT_TABLE} (domain);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON ${AUDIT_TABLE} (timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_event_type ON ${AUDIT_TABLE} (event_type);
    `)
    console.log('✓ Indexes created for audit log')

    // Add comment on analysis_audit_log
    await client.query(`
      COMMENT ON TABLE ${AUDIT_TABLE} IS 
        'Audit log for AI analysis operations. Consider partitioning by timestamp for high-volume deployments.'
    `)

    // Analyze tables to update statistics
    console.log('\n9. Analyzing tables...')
    await client.query(`ANALYZE ${ANALYSES_TABLE}`)
    await client.query(`ANALYZE ${AUDIT_TABLE}`)
    console.log('✓ Tables analyzed')

    // Commit transaction
    await client.query('COMMIT')

    // Show final status
    console.log('\n10. Verifying migration results...')

    // Check conversation_analyses table structure
    const tableCheck = await client.query(`
      SELECT 
        column_name,
        data_type,
        column_default,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = '${ANALYSES_TABLE}'
      ORDER BY ordinal_position
    `)

    console.log(`\n${ANALYSES_TABLE} table:`)
    console.log('Columns:', tableCheck.rows.length)

    // Check indexes
    const indexCheck = await client.query(`
      SELECT 
        tablename,
        indexname,
        pg_size_pretty(pg_relation_size(c.oid)) as index_size
      FROM pg_indexes i
      JOIN pg_class c ON c.relname = i.indexname
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE i.tablename IN ('${ANALYSES_TABLE}', '${AUDIT_TABLE}')
        AND n.nspname = 'public'
      ORDER BY tablename, indexname
    `)

    console.log('\nIndexes created:')
    for (const idx of indexCheck.rows) {
      console.log(`  - ${idx.tablename}.${idx.indexname} (${idx.index_size})`)
    }

    const duration = Date.now() - startTime
    console.log(`\n✅ Migration ${MIGRATION_NAME} completed successfully in ${duration}ms!`)
    console.log('⏰ End time:', new Date().toISOString())
    console.log('\nAI Analysis infrastructure is ready:')
    console.log(`  - ${ANALYSES_TABLE} table for storing AI-generated analyses`)
    console.log(`  - ${AUDIT_TABLE} table for tracking all analysis events`)
    console.log('  - Support for custom prompts')
    console.log('  - Comprehensive indexing for optimal performance')
    console.log('  - Automatic timestamp management')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(`\n❌ Migration ${MIGRATION_NAME} failed:`, getErrorMessage(error))
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

// Rollback function for reversibility
async function rollback(): Promise<void> {
  const startTime = Date.now()
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()

  try {
    console.log(`🔄 Rolling back migration ${MIGRATION_NAME}...`)
    console.log('⏰ Start time:', new Date().toISOString())

    await client.query('BEGIN')

    // Check current state before rollback
    console.log('🔍 Checking current database state...')
    const stateCheck = await client.query(`
      SELECT 
        EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_schema = 'public' 
            AND table_name = '${ANALYSES_TABLE}'
        ) as analyses_table_exists,
        EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_schema = 'public' 
            AND table_name = '${AUDIT_TABLE}'
        ) as audit_table_exists,
        EXISTS (
          SELECT 1 FROM pg_type 
          WHERE typname = '${ENUM_NAME}'
        ) as enum_exists,
        EXISTS (
          SELECT 1 FROM pg_proc 
          WHERE proname = '${TRIGGER_FUNCTION}'
        ) as function_exists
    `)

    const { analyses_table_exists, audit_table_exists, enum_exists, function_exists } =
      stateCheck.rows[0]
    console.log(`   • Analyses table exists: ${analyses_table_exists}`)
    console.log(`   • Audit table exists: ${audit_table_exists}`)
    console.log(`   • ENUM type exists: ${enum_exists}`)
    console.log(`   • Trigger function exists: ${function_exists}`)

    // Drop tables first (they depend on the ENUM type)
    if (audit_table_exists) {
      console.log(`\n📊 Dropping ${AUDIT_TABLE} table...`)
      await client.query(`DROP TABLE IF EXISTS ${AUDIT_TABLE} CASCADE;`)
      console.log('✓ Audit table dropped')
    }

    if (analyses_table_exists) {
      console.log(`\n📊 Dropping ${ANALYSES_TABLE} table...`)
      await client.query(`DROP TABLE IF EXISTS ${ANALYSES_TABLE} CASCADE;`)
      console.log('✓ Analyses table dropped')
    }

    // Drop ENUM type
    if (enum_exists) {
      console.log(`\n📊 Dropping ${ENUM_NAME} ENUM type...`)
      await client.query(`DROP TYPE IF EXISTS ${ENUM_NAME} CASCADE;`)
      console.log('✓ ENUM type dropped')
    }

    // Check if trigger function is still used by other tables
    const functionUsageCheck = await client.query(`
      SELECT COUNT(*) as usage_count
      FROM pg_trigger t
      JOIN pg_proc p ON t.tgfoid = p.oid
      WHERE p.proname = '${TRIGGER_FUNCTION}'
    `)

    const { usage_count } = functionUsageCheck.rows[0]

    if (function_exists && usage_count === '0') {
      console.log(`\n📊 Dropping ${TRIGGER_FUNCTION} function...`)
      await client.query(`DROP FUNCTION IF EXISTS ${TRIGGER_FUNCTION}() CASCADE;`)
      console.log('✓ Trigger function dropped')
    } else if (usage_count > 0) {
      console.log(
        `\nℹ️  Keeping ${TRIGGER_FUNCTION} function (still used by ${usage_count} triggers)`
      )
    }

    // Verify rollback
    console.log('\n🔍 Verifying rollback results...')
    const verifyRollback = await client.query(`
      SELECT 
        EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_schema = 'public' 
            AND table_name IN ('${ANALYSES_TABLE}', '${AUDIT_TABLE}')
        ) as tables_still_exist,
        EXISTS (
          SELECT 1 FROM pg_type 
          WHERE typname = '${ENUM_NAME}'
        ) as enum_still_exists
    `)

    const { tables_still_exist, enum_still_exists } = verifyRollback.rows[0]
    if (!tables_still_exist && !enum_still_exists) {
      console.log('✅ Rollback verified - all changes reverted')
    } else {
      throw new Error('Rollback verification failed - some changes may not have been reverted')
    }

    await client.query('COMMIT')

    const duration = Date.now() - startTime
    console.log(`\n🎉 Rollback ${MIGRATION_NAME} completed successfully in ${duration}ms!`)
    console.log('⏰ End time:', new Date().toISOString())
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(`\n❌ Rollback ${MIGRATION_NAME} failed:`, getErrorMessage(error))
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

// Main execution
async function main(): Promise<void> {
  // Validate environment first
  validateEnvironment()

  const command = process.argv[2]

  // Show help if requested or invalid command
  if (command === 'help' || (command && !['rollback'].includes(command))) {
    console.log(`\n📚 Migration ${MIGRATION_NAME}: Add AI Analysis Infrastructure`)
    console.log('\nUsage:')
    console.log(`  bun run scripts/db/migrations/${MIGRATION_NAME}.ts [command]`)
    console.log('\nCommands:')
    console.log('  (default)  Run the migration')
    console.log('  rollback   Revert the migration')
    console.log('  help       Show this help message')
    console.log('\nExamples:')
    console.log('  # Run migration')
    console.log(`  bun run scripts/db/migrations/${MIGRATION_NAME}.ts`)
    console.log('  \n  # Rollback migration')
    console.log(`  bun run scripts/db/migrations/${MIGRATION_NAME}.ts rollback`)
    process.exit(0)
  }

  try {
    if (command === 'rollback') {
      await rollback()
    } else {
      await migrate()
    }
  } catch (error) {
    console.error(`\n💥 Fatal error:`, getErrorMessage(error))
    process.exit(1)
  }
}

// Handle uncaught errors
process.on('unhandledRejection', error => {
  console.error('\n💥 Unhandled rejection:', getErrorMessage(error as Error))
  process.exit(1)
})

// Run migration
main()
