#!/usr/bin/env bun
/**
 * Migration 006: Split Conversation Hashes
 *
 * This migration implements a dual hash system for conversation tracking by adding
 * a system_hash column to the api_requests table. This allows conversations to
 * maintain links even when system prompts change (e.g., git status updates,
 * context compaction).
 *
 * Key Features:
 * - Adds system_hash column to track system prompts separately from message content
 * - Creates index for efficient querying by system hash
 * - Supports backward compatibility - old conversations continue to work
 *
 * According to ADR-012: Database Schema Evolution Strategy
 * - Migrations use TypeScript for consistency with the codebase
 * - Each migration is idempotent and can be run multiple times safely
 * - Includes rollback functionality for reversibility
 *
 * Usage:
 *   bun run scripts/db/migrations/006-split-conversation-hashes.ts
 *   bun run scripts/db/migrations/006-split-conversation-hashes.ts rollback
 */

import { Pool } from 'pg'
import { config } from 'dotenv'
import { getErrorMessage } from '@claude-nexus/shared'

// Load environment variables
config()

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
    console.log('🚀 Starting migration 006: Split conversation hashes...')
    console.log('⏰ Start time:', new Date().toISOString())

    await client.query('BEGIN')

    // Check if column already exists
    console.log('🔍 Checking for existing system_hash column...')
    const columnCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'api_requests' 
          AND column_name = 'system_hash'
      ) as column_exists
    `)

    const { column_exists } = columnCheck.rows[0]

    if (!column_exists) {
      // Add system_hash column
      console.log('📊 Adding system_hash column to api_requests table...')
      await client.query(`
        ALTER TABLE api_requests 
        ADD COLUMN system_hash VARCHAR(64);
      `)
      console.log('✅ Column added successfully')
    } else {
      console.log('ℹ️  Column system_hash already exists - skipping creation')
    }

    // Create index for system_hash
    console.log('📊 Creating index on system_hash...')
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_api_requests_system_hash 
      ON api_requests(system_hash)
      WHERE system_hash IS NOT NULL;
    `)
    console.log('✅ Index created successfully')

    // Add comment to document the column
    console.log('📝 Adding column documentation...')
    await client.query(`
      COMMENT ON COLUMN api_requests.system_hash IS 
      'SHA-256 hash of the system prompt only, separate from message content hash';
    `)

    // Verify the changes
    console.log('\n🔍 Verifying migration results...')

    // Check column exists with correct type
    const verifyColumn = await client.query(`
      SELECT 
        column_name,
        data_type,
        character_maximum_length,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'api_requests'
        AND column_name = 'system_hash'
    `)

    if (verifyColumn.rowCount === 1) {
      const col = verifyColumn.rows[0]
      console.log('✅ Column verified:')
      console.log(`   • Name: ${col.column_name}`)
      console.log(`   • Type: ${col.data_type}(${col.character_maximum_length})`)
      console.log(`   • Nullable: ${col.is_nullable}`)
    }

    // Check index exists
    const verifyIndex = await client.query(`
      SELECT 
        indexname,
        indexdef,
        pg_size_pretty(pg_relation_size(c.oid)) as index_size
      FROM pg_indexes i
      JOIN pg_class c ON c.relname = i.indexname
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE i.tablename = 'api_requests'
        AND i.indexname = 'idx_api_requests_system_hash'
        AND n.nspname = 'public'
    `)

    if (verifyIndex.rowCount === 1) {
      const idx = verifyIndex.rows[0]
      console.log('\n✅ Index verified:')
      console.log(`   • Name: ${idx.indexname}`)
      console.log(`   • Size: ${idx.index_size}`)
    }

    // Analyze table to update statistics
    console.log('\n📈 Analyzing api_requests table to update query planner statistics...')
    await client.query('ANALYZE api_requests')
    console.log('✅ Table statistics updated successfully')

    await client.query('COMMIT')

    const duration = Date.now() - startTime
    console.log(`\n🎉 Migration 006 completed successfully in ${duration}ms!`)
    console.log('⏰ End time:', new Date().toISOString())
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('\n❌ Migration 006 failed:', getErrorMessage(error))
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
    console.log('🔄 Rolling back migration 006...')
    console.log('⏰ Start time:', new Date().toISOString())

    await client.query('BEGIN')

    // Check current state before rollback
    console.log('🔍 Checking current database state...')
    const stateCheck = await client.query(`
      SELECT 
        EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_schema = 'public' 
            AND table_name = 'api_requests' 
            AND column_name = 'system_hash'
        ) as column_exists,
        EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE tablename = 'api_requests' 
            AND indexname = 'idx_api_requests_system_hash'
        ) as index_exists
    `)

    const { column_exists, index_exists } = stateCheck.rows[0]
    console.log(`   • Column exists: ${column_exists}`)
    console.log(`   • Index exists: ${index_exists}`)

    // Drop index first
    if (index_exists) {
      console.log('\n📊 Dropping index idx_api_requests_system_hash...')
      await client.query('DROP INDEX IF EXISTS idx_api_requests_system_hash;')
      console.log('✅ Index dropped successfully')
    }

    // Drop column
    if (column_exists) {
      console.log('\n📊 Dropping column system_hash...')
      await client.query('ALTER TABLE api_requests DROP COLUMN IF EXISTS system_hash;')
      console.log('✅ Column dropped successfully')
    }

    // Verify rollback
    console.log('\n🔍 Verifying rollback results...')
    const verifyRollback = await client.query(`
      SELECT 
        EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_schema = 'public' 
            AND table_name = 'api_requests' 
            AND column_name = 'system_hash'
        ) as column_still_exists,
        EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE tablename = 'api_requests' 
            AND indexname = 'idx_api_requests_system_hash'
        ) as index_still_exists
    `)

    const { column_still_exists, index_still_exists } = verifyRollback.rows[0]
    if (!column_still_exists && !index_still_exists) {
      console.log('✅ Rollback verified - all changes reverted')
    } else {
      throw new Error('Rollback verification failed - some changes may not have been reverted')
    }

    await client.query('COMMIT')

    const duration = Date.now() - startTime
    console.log(`\n🎉 Rollback 006 completed successfully in ${duration}ms!`)
    console.log('⏰ End time:', new Date().toISOString())
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('\n❌ Rollback 006 failed:', getErrorMessage(error))
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
  const validCommands = ['migrate', 'rollback', 'help']

  // Show help if requested or invalid command
  if (command === 'help' || (command && !['rollback'].includes(command))) {
    console.log('\n📚 Migration 006: Split Conversation Hashes')
    console.log('\nUsage:')
    console.log('  bun run scripts/db/migrations/006-split-conversation-hashes.ts [command]')
    console.log('\nCommands:')
    console.log('  (default)  Run the migration')
    console.log('  rollback   Revert the migration')
    console.log('  help       Show this help message')
    console.log('\nExamples:')
    console.log('  # Run migration')
    console.log('  bun run scripts/db/migrations/006-split-conversation-hashes.ts')
    console.log('  \n  # Rollback migration')
    console.log('  bun run scripts/db/migrations/006-split-conversation-hashes.ts rollback')
    process.exit(0)
  }

  try {
    if (command === 'rollback') {
      await rollback()
    } else {
      await migrate()
    }
  } catch (error) {
    console.error('\n💥 Fatal error:', getErrorMessage(error))
    process.exit(1)
  }
}

// Handle uncaught errors
process.on('unhandledRejection', error => {
  console.error('\n💥 Unhandled rejection:', getErrorMessage(error as Error))
  process.exit(1)
})

main()
