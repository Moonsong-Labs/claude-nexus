#!/usr/bin/env bun
/**
 * Migration 000: Initial Database Setup
 *
 * This migration serves as a wrapper that executes the init-database.sql file.
 * It ensures idempotency by checking if core tables exist before execution.
 *
 * According to ADR-012: "init-database.sql remains for fresh installations"
 * and "Migrations complement, not replace, the init script".
 *
 * This approach maintains a single source of truth for the schema definition
 * while providing a migration interface for consistency with the migration system.
 */

import { Pool } from 'pg'
import { readFileSync } from 'fs'
import { join } from 'path'
import { config } from 'dotenv'

// Load environment variables
config()

async function initDatabase() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })

  try {
    console.log('Migration 000: Initial database setup...')

    // Check if core tables already exist
    console.log('Checking for existing tables...')
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'api_requests'
      ) as api_requests_exists,
      EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'streaming_chunks'
      ) as streaming_chunks_exists
    `)

    const { api_requests_exists, streaming_chunks_exists } = tableCheck.rows[0]

    if (api_requests_exists && streaming_chunks_exists) {
      console.log('Core tables already exist. Skipping initialization.')
      console.log('✅ Database already initialized')
      return
    }

    console.log('Core tables not found. Executing init-database.sql...')

    // Try multiple paths to find init-database.sql
    const possiblePaths = [
      join(process.cwd(), 'scripts', 'init-database.sql'),
      join(process.cwd(), '..', '..', '..', 'scripts', 'init-database.sql'), // From migrations dir
      join(__dirname, '..', '..', '..', 'init-database.sql'), // Relative to this file
      join(__dirname, '..', '..', 'init-database.sql'), // One level up
    ]

    let sqlContent: string | null = null
    let foundPath: string | null = null

    for (const sqlPath of possiblePaths) {
      try {
        sqlContent = readFileSync(sqlPath, 'utf-8')
        foundPath = sqlPath
        console.log(`Found init-database.sql at: ${sqlPath}`)
        break
      } catch {
        // Continue to next path
      }
    }

    if (!sqlContent || !foundPath) {
      console.error('Could not find init-database.sql file')
      console.error('Tried the following paths:')
      possiblePaths.forEach((path, index) => {
        console.error(`  ${index + 1}. ${path}`)
      })
      console.error('')
      console.error('Current working directory:', process.cwd())
      console.error('Script directory:', __dirname)
      throw new Error(
        'init-database.sql not found. Please ensure it exists in the scripts directory.'
      )
    }

    // Execute the SQL file
    console.log('Executing init-database.sql...')
    await pool.query(sqlContent)

    // Verify all expected tables were created
    console.log('Verifying database initialization...')
    const verifyQuery = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'api_requests', 
        'streaming_chunks', 
        'conversation_analyses',
        'analysis_audit_log'
      )
      ORDER BY table_name
    `)

    const createdTables = verifyQuery.rows.map(row => row.table_name)
    console.log('Created tables:', createdTables.join(', '))

    // Check for core tables at minimum
    const coreTablesExist =
      createdTables.includes('api_requests') && createdTables.includes('streaming_chunks')

    if (!coreTablesExist) {
      throw new Error('Core tables were not created successfully')
    }

    console.log('✅ Database initialization completed successfully!')
    console.log(`✅ Created ${createdTables.length} tables`)
  } catch (error) {
    console.error('Migration 000 failed:', error instanceof Error ? error.message : String(error))

    if (error instanceof Error && error.message.includes('syntax error')) {
      console.error('\nThis might indicate an issue with the SQL file.')
      console.error('Please verify init-database.sql is valid PostgreSQL syntax.')
    }

    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Run migration
initDatabase().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
