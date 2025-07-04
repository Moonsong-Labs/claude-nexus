#!/usr/bin/env bun
/**
 * Script to verify timestamp column types in the database
 * Checks if timestamp columns are using TIMESTAMPTZ (timestamp with time zone)
 * as recommended by the reviews for proper timezone handling
 */

import { Pool } from 'pg'
import { config } from 'dotenv'

// Load environment variables
config()

async function verifyTimestampTypes() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    console.log('Verifying timestamp column types...\n')

    // Query to get all timestamp columns and their types
    const query = `
      SELECT 
        table_name,
        column_name,
        data_type,
        udt_name,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('api_requests', 'streaming_chunks')
        AND (data_type LIKE '%timestamp%' OR udt_name LIKE '%timestamp%')
      ORDER BY table_name, column_name
    `

    const result = await pool.query(query)

    if (result.rows.length === 0) {
      console.log('No timestamp columns found in api_requests or streaming_chunks tables')
      return
    }

    // Group by table
    const tableColumns: Record<string, any[]> = {}
    for (const row of result.rows) {
      if (!tableColumns[row.table_name]) {
        tableColumns[row.table_name] = []
      }
      tableColumns[row.table_name].push(row)
    }

    // Display results
    for (const [tableName, columns] of Object.entries(tableColumns)) {
      console.log(`Table: ${tableName}`)
      console.log('─'.repeat(60))

      for (const col of columns) {
        const typeInfo =
          col.data_type === 'timestamp with time zone' ? '✓ TIMESTAMPTZ' : '⚠️  TIMESTAMP'
        const nullInfo = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'
        console.log(`  ${col.column_name.padEnd(20)} ${typeInfo.padEnd(15)} ${nullInfo}`)
      }
      console.log()
    }

    // Check for any non-TIMESTAMPTZ columns
    const nonTzColumns = result.rows.filter(row => row.data_type !== 'timestamp with time zone')

    if (nonTzColumns.length > 0) {
      console.log('⚠️  WARNING: The following columns are not using TIMESTAMPTZ:')
      console.log('─'.repeat(60))
      for (const col of nonTzColumns) {
        console.log(`  - ${col.table_name}.${col.column_name} (currently: ${col.data_type})`)
      }
      console.log(
        '\nRecommendation: Convert these columns to TIMESTAMPTZ to avoid timezone issues.'
      )
      console.log('Example migration SQL:')
      for (const col of nonTzColumns) {
        console.log(
          `  ALTER TABLE ${col.table_name} ALTER COLUMN ${col.column_name} TYPE TIMESTAMPTZ;`
        )
      }
    } else {
      console.log('✅ All timestamp columns are correctly using TIMESTAMPTZ!')
    }
  } catch (error) {
    console.error('❌ Error verifying timestamp types:', error)
    throw error
  } finally {
    await pool.end()
  }
}

// Run verification
verifyTimestampTypes().catch(error => {
  console.error('Verification error:', error)
  process.exit(1)
})
