#!/usr/bin/env bun
/**
 * Migration 007: Add parent_request_id column
 *
 * This migration adds a parent_request_id column to the api_requests table
 * to support direct parent-child relationships in conversation tracking.
 *
 * Key changes:
 * - Adds parent_request_id column with foreign key reference to api_requests
 * - Creates index for efficient parent lookups
 * - Populates parent_request_id based on existing message hash relationships
 * - Adds constraint to prevent self-referencing
 *
 * Background: This column provides a direct link between requests in a conversation,
 * complementing the message hash-based linking system with an explicit parent reference.
 * This improves query performance and simplifies conversation tree traversal.
 *
 * Note: The migration preserves existing data by only populating parent_request_id
 * where it's currently NULL, preventing overwriting of any existing relationships.
 */

import { Pool } from 'pg'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables
config({ path: resolve(process.cwd(), '.env') })

// Migration constants
const MIGRATION_NAME = '007-add-parent-request-id'
const TABLE_NAME = 'api_requests'
const COLUMN_NAME = 'parent_request_id'
const INDEX_NAME = 'idx_api_requests_parent_request_id'
const CONSTRAINT_NAME = 'chk_parent_request_not_self'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function migrate() {
  const client = await pool.connect()

  try {
    console.log(`Starting migration: ${MIGRATION_NAME}...`)

    await client.query('BEGIN')

    // Pre-migration analysis
    console.log('Analyzing current state...')

    // Check if column already exists
    const columnExists = await client.query(
      `
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = $1 
        AND column_name = $2
      ) as exists
    `,
      [TABLE_NAME, COLUMN_NAME]
    )

    const analysisQuery = columnExists.rows[0].exists
      ? `SELECT 
          COUNT(*) as total_requests,
          COUNT(DISTINCT conversation_id) as total_conversations,
          COUNT(*) FILTER (WHERE parent_message_hash IS NOT NULL) as requests_with_parent_hash,
          COUNT(*) FILTER (WHERE ${COLUMN_NAME} IS NOT NULL) as requests_with_parent_id
        FROM ${TABLE_NAME}`
      : `SELECT 
          COUNT(*) as total_requests,
          COUNT(DISTINCT conversation_id) as total_conversations,
          COUNT(*) FILTER (WHERE parent_message_hash IS NOT NULL) as requests_with_parent_hash,
          0 as requests_with_parent_id
        FROM ${TABLE_NAME}`

    const analysisResult = await client.query(analysisQuery)
    const {
      total_requests,
      total_conversations,
      requests_with_parent_hash,
      requests_with_parent_id,
    } = analysisResult.rows[0]
    console.log('Pre-migration state:', {
      totalRequests: total_requests,
      totalConversations: total_conversations,
      requestsWithParentHash: requests_with_parent_hash,
      existingParentIds: requests_with_parent_id,
    })

    // Add parent_request_id column
    console.log(`Adding ${COLUMN_NAME} column to ${TABLE_NAME} table...`)
    await client.query(`
      ALTER TABLE ${TABLE_NAME} 
      ADD COLUMN IF NOT EXISTS ${COLUMN_NAME} UUID REFERENCES ${TABLE_NAME}(request_id);
    `)

    // Create index for parent_request_id
    console.log(`Creating index ${INDEX_NAME}...`)
    await client.query(`
      CREATE INDEX IF NOT EXISTS ${INDEX_NAME} 
      ON ${TABLE_NAME}(${COLUMN_NAME});
    `)

    // Add comment to document the column
    console.log('Adding column documentation...')
    await client.query(`
      COMMENT ON COLUMN ${TABLE_NAME}.${COLUMN_NAME} IS 
      'UUID of the parent request in the conversation chain, references the immediate parent';
    `)

    // Populate parent_request_id for existing conversations
    console.log(`Populating ${COLUMN_NAME} for existing conversations...`)

    // This query finds parent requests by matching parent_message_hash with current_message_hash
    // We only populate where parent_request_id is NULL to avoid overwriting existing data
    const updateQuery = `
      WITH parent_mapping AS (
        SELECT 
          child.request_id AS child_id,
          parent.request_id AS parent_id
        FROM ${TABLE_NAME} child
        INNER JOIN ${TABLE_NAME} parent ON 
          child.domain = parent.domain 
          AND child.parent_message_hash = parent.current_message_hash
          AND child.conversation_id = parent.conversation_id
          AND child.request_id != parent.request_id
        WHERE child.parent_message_hash IS NOT NULL
          AND child.${COLUMN_NAME} IS NULL
      )
      UPDATE ${TABLE_NAME}
      SET ${COLUMN_NAME} = parent_mapping.parent_id
      FROM parent_mapping
      WHERE ${TABLE_NAME}.request_id = parent_mapping.child_id;
    `

    const result = await client.query(updateQuery)
    console.log(`Updated ${result.rowCount} records with ${COLUMN_NAME}`)

    // Add constraint to ensure parent_request_id != request_id
    console.log(`Adding constraint ${CONSTRAINT_NAME} to prevent self-referencing...`)
    await client.query(`
      ALTER TABLE ${TABLE_NAME}
      ADD CONSTRAINT ${CONSTRAINT_NAME}
      CHECK (${COLUMN_NAME} != request_id);
    `)

    await client.query('COMMIT')
    console.log(`Migration ${MIGRATION_NAME} completed successfully!`)

    // Post-migration statistics
    console.log('Gathering post-migration statistics...')
    const stats = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE ${COLUMN_NAME} IS NOT NULL) as with_parent,
        COUNT(*) FILTER (WHERE ${COLUMN_NAME} IS NULL AND parent_message_hash IS NOT NULL) as missing_parent,
        COUNT(*) as total
      FROM ${TABLE_NAME}
    `)
    console.log('Post-migration statistics:', stats.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(`Migration ${MIGRATION_NAME} failed:`, error)
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
    })
    throw error
  } finally {
    client.release()
  }
}

/**
 * Rollback function for reversibility
 *
 * This function reverses all changes made by the migration:
 * 1. Drops the check constraint
 * 2. Drops the index
 * 3. Drops the parent_request_id column
 */
async function rollback() {
  const client = await pool.connect()

  try {
    console.log(`Rolling back migration ${MIGRATION_NAME}...`)

    await client.query('BEGIN')

    // Drop constraint first
    console.log(`Dropping constraint ${CONSTRAINT_NAME}...`)
    await client.query(`ALTER TABLE ${TABLE_NAME} DROP CONSTRAINT IF EXISTS ${CONSTRAINT_NAME};`)

    // Drop index
    console.log(`Dropping index ${INDEX_NAME}...`)
    await client.query(`DROP INDEX IF EXISTS ${INDEX_NAME};`)

    // Drop column
    console.log(`Dropping column ${COLUMN_NAME}...`)
    await client.query(`ALTER TABLE ${TABLE_NAME} DROP COLUMN IF EXISTS ${COLUMN_NAME};`)

    await client.query('COMMIT')
    console.log(`Rollback ${MIGRATION_NAME} completed successfully!`)
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(`Rollback ${MIGRATION_NAME} failed:`, error)
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
    })
    throw error
  } finally {
    client.release()
  }
}

/**
 * Main execution function
 *
 * Usage:
 *   bun run scripts/db/migrations/007-add-parent-request-id.ts        # Run migration
 *   bun run scripts/db/migrations/007-add-parent-request-id.ts rollback  # Rollback
 */
async function main() {
  const command = process.argv[2]

  try {
    // Validate database connection
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required')
    }

    if (command === 'rollback') {
      await rollback()
    } else {
      await migrate()
    }
  } catch (error) {
    console.error('Fatal error:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Execute main function
main()
