#!/usr/bin/env bun

/**
 * Migration 006: Add last_message_preview column
 *
 * Adds a last_message_preview column to api_requests table to optimize
 * conversation detail page performance by avoiding loading full message bodies.
 */

import { Pool } from 'pg'

async function runMigration() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const pool = new Pool({ connectionString })

  try {
    console.log('Starting migration 006: Add last_message_preview column...')

    // Start transaction
    await pool.query('BEGIN')

    // Add the new column
    console.log('Adding last_message_preview column...')
    await pool.query(`
      ALTER TABLE api_requests
      ADD COLUMN IF NOT EXISTS last_message_preview TEXT
    `)

    // Add index for efficient queries on conversation_id with the new column
    console.log('Adding index for conversation queries...')
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_api_requests_conversation_preview
      ON api_requests(conversation_id, created_at DESC)
      WHERE conversation_id IS NOT NULL
    `)

    // Backfill existing data in batches
    console.log('Backfilling existing data...')
    const batchSize = 1000
    let offset = 0
    let processedCount = 0

    while (true) {
      const result = await pool.query(
        `
        UPDATE api_requests
        SET last_message_preview = (
          CASE 
            WHEN body IS NOT NULL AND jsonb_typeof(body) = 'object' THEN
              CASE
                WHEN body->>'messages' IS NOT NULL AND jsonb_array_length(body->'messages') > 0 THEN
                  LEFT(
                    COALESCE(
                      -- Try to get content from the last message
                      CASE 
                        WHEN jsonb_typeof(body->'messages'->-1->'content') = 'string' THEN
                          body->'messages'->-1->>'content'
                        WHEN jsonb_typeof(body->'messages'->-1->'content') = 'array' AND 
                             jsonb_array_length(body->'messages'->-1->'content') > 0 THEN
                          body->'messages'->-1->'content'->0->>'text'
                        ELSE ''
                      END,
                      ''
                    ),
                    100
                  )
                ELSE ''
              END
            ELSE ''
          END
        )
        WHERE id IN (
          SELECT id FROM api_requests
          WHERE last_message_preview IS NULL
          AND body IS NOT NULL
          ORDER BY created_at DESC
          LIMIT $1
          OFFSET $2
        )
      `,
        [batchSize, offset]
      )

      const updatedRows = result.rowCount || 0
      processedCount += updatedRows

      if (updatedRows === 0) {
        break
      }

      console.log(`Processed ${processedCount} records...`)
      offset += batchSize

      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log(`Backfill completed. Total records updated: ${processedCount}`)

    // Commit transaction
    await pool.query('COMMIT')
    console.log('Migration 006 completed successfully!')
  } catch (error) {
    // Rollback on error
    await pool.query('ROLLBACK')
    console.error('Migration 006 failed:', error)
    throw error
  } finally {
    await pool.end()
  }
}

// Run the migration
runMigration().catch(console.error)
