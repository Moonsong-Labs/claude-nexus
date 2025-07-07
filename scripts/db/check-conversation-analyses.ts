#!/usr/bin/env bun
/**
 * Check the current state of conversation_analyses table
 */

import { Pool } from 'pg'
import { config } from 'dotenv'

config()

async function checkTable() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    console.log('Checking conversation_analyses table...\n')

    // Check if table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'conversation_analyses'
      );
    `)

    if (!tableExists.rows[0].exists) {
      console.log('❌ Table conversation_analyses does not exist!')
      console.log('\nRun this migration to create it:')
      console.log('  bun run scripts/db/migrations/011-add-conversation-analyses-complete.ts')
      return
    }

    console.log('✓ Table exists\n')

    // Get all columns
    const columns = await pool.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'conversation_analyses'
      ORDER BY ordinal_position;
    `)

    console.log('Current columns:')
    console.table(columns.rows)

    // Check for specific columns the API expects
    const requiredColumns = [
      'id', 'conversation_id', 'branch_id', 'status',
      'analysis_content', 'analysis_data', 'error_message',
      'created_at', 'updated_at', 'completed_at',
      'prompt_tokens', 'completion_tokens'
    ]

    const existingColumns = columns.rows.map(row => row.column_name)
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col))

    if (missingColumns.length > 0) {
      console.log('\n❌ Missing required columns:', missingColumns.join(', '))
      console.log('\nThe table exists but is missing required columns.')
      console.log('You need to either:')
      console.log('1. Drop and recreate the table:')
      console.log('   psql $DATABASE_URL -c "DROP TABLE conversation_analyses CASCADE;"')
      console.log('   bun run scripts/db/migrations/011-add-conversation-analyses-complete.ts')
      console.log('\n2. Or add the missing columns manually')
    } else {
      console.log('\n✓ All required columns exist')
    }

    // Check indexes
    const indexes = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'conversation_analyses';
    `)

    console.log('\nIndexes:')
    indexes.rows.forEach(idx => {
      console.log(`  - ${idx.indexname}`)
    })

    // Check if there's any data
    const countResult = await pool.query('SELECT COUNT(*) FROM conversation_analyses')
    console.log(`\nTable contains ${countResult.rows[0].count} rows`)

  } catch (error) {
    console.error('Error checking table:', error)
  } finally {
    await pool.end()
  }
}

checkTable().catch(console.error)