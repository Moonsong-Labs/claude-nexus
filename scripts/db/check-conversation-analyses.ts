#!/usr/bin/env bun
/**
 * Database Schema Validation Tool
 *
 * Validates the existence and structure of the conversation_analyses table.
 * Useful for troubleshooting database schema issues and verifying migrations.
 *
 * Usage:
 *   bun run scripts/db/check-conversation-analyses.ts [options]
 *
 * Options:
 *   --verbose, -v     Show detailed information including all columns
 *   --help, -h        Show help text
 */

import { Pool } from 'pg'
import { config } from 'dotenv'
import { parseArgs } from 'util'

// Load environment variables
config()

// ============================================================================
// Type Definitions
// ============================================================================

interface ColumnInfo {
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
}

interface IndexInfo {
  indexname: string
  indexdef: string
}

interface TableExistsResult {
  exists: boolean
}

interface CountResult {
  count: string
}

interface ParsedArgs {
  verbose: boolean
  help: boolean
}

// ============================================================================
// Constants
// ============================================================================

const REQUIRED_COLUMNS = [
  'id',
  'conversation_id',
  'branch_id',
  'status',
  'model_used',
  'analysis_content',
  'analysis_data',
  'raw_response',
  'error_message',
  'retry_count',
  'generated_at',
  'processing_duration_ms',
  'prompt_tokens',
  'completion_tokens',
  'created_at',
  'updated_at',
  'completed_at',
  'custom_prompt',
] as const

const QUERIES = {
  TABLE_EXISTS: `
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'conversation_analyses'
    );
  `,

  GET_COLUMNS: `
    SELECT 
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_name = 'conversation_analyses'
    AND table_schema = 'public'
    ORDER BY ordinal_position;
  `,

  GET_INDEXES: `
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'conversation_analyses'
    AND schemaname = 'public';
  `,

  GET_ROW_COUNT: `
    SELECT COUNT(*) FROM conversation_analyses;
  `,
} as const

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
} as const

const HELP_TEXT = `Database Schema Validation Tool

Validates the existence and structure of the conversation_analyses table.
Useful for troubleshooting database schema issues and verifying migrations.

Usage:
  bun run scripts/db/check-conversation-analyses.ts [options]

Options:
  --verbose, -v     Show detailed information including all columns
  --help, -h        Show help text

Examples:
  # Quick validation
  bun run scripts/db/check-conversation-analyses.ts
  
  # Detailed validation with column info
  bun run scripts/db/check-conversation-analyses.ts --verbose
`

// ============================================================================
// Utility Functions
// ============================================================================

function logSuccess(message: string): void {
  console.log(`${COLORS.green}✓${COLORS.reset} ${message}`)
}

function logError(message: string): void {
  console.log(`${COLORS.red}✗${COLORS.reset} ${message}`)
}

function logWarning(message: string): void {
  console.log(`${COLORS.yellow}⚠${COLORS.reset} ${message}`)
}

function logInfo(message: string): void {
  console.log(`${COLORS.blue}ℹ${COLORS.reset} ${message}`)
}

function logHeader(message: string): void {
  console.log(`\n${COLORS.bold}${message}${COLORS.reset}`)
}

function parseArguments(): ParsedArgs {
  try {
    const { values } = parseArgs({
      args: Bun.argv,
      options: {
        verbose: {
          type: 'boolean',
          short: 'v',
          default: false,
        },
        help: {
          type: 'boolean',
          short: 'h',
          default: false,
        },
      },
      strict: true,
      allowPositionals: true,
    })

    return {
      verbose: values.verbose || false,
      help: values.help || false,
    }
  } catch (error) {
    console.error('Error parsing arguments:', error)
    console.log(HELP_TEXT)
    process.exit(1)
  }
}

// ============================================================================
// Validation Functions
// ============================================================================

async function checkTableExists(pool: Pool): Promise<boolean> {
  const result = await pool.query<TableExistsResult>(QUERIES.TABLE_EXISTS)
  return result.rows[0].exists
}

async function getTableColumns(pool: Pool): Promise<ColumnInfo[]> {
  const result = await pool.query<ColumnInfo>(QUERIES.GET_COLUMNS)
  return result.rows
}

async function getTableIndexes(pool: Pool): Promise<IndexInfo[]> {
  const result = await pool.query<IndexInfo>(QUERIES.GET_INDEXES)
  return result.rows
}

async function getRowCount(pool: Pool): Promise<number> {
  const result = await pool.query<CountResult>(QUERIES.GET_ROW_COUNT)
  return parseInt(result.rows[0].count, 10)
}

function validateColumns(columns: ColumnInfo[]): {
  existingColumns: string[]
  missingColumns: string[]
  extraColumns: string[]
} {
  const existingColumns = columns.map(col => col.column_name)
  const missingColumns = REQUIRED_COLUMNS.filter(col => !existingColumns.includes(col))
  const extraColumns = existingColumns.filter(col => !REQUIRED_COLUMNS.includes(col as any))

  return { existingColumns, missingColumns, extraColumns }
}

// ============================================================================
// Main Function
// ============================================================================

async function main(): Promise<void> {
  const args = parseArguments()

  if (args.help) {
    console.log(HELP_TEXT)
    process.exit(0)
  }

  if (!process.env.DATABASE_URL) {
    logError('DATABASE_URL environment variable is not set')
    process.exit(1)
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    logHeader('Conversation Analyses Table Validation')

    // Check if table exists
    const tableExists = await checkTableExists(pool)

    if (!tableExists) {
      logError('Table conversation_analyses does not exist!')
      console.log('\nTo create the table, run:')
      console.log('  bun run scripts/db/migrations/011-add-conversation-analyses.ts')
      process.exit(1)
    }

    logSuccess('Table exists')

    // Get and validate columns
    const columns = await getTableColumns(pool)
    const { existingColumns, missingColumns, extraColumns } = validateColumns(columns)

    if (args.verbose) {
      logHeader('Column Details')
      console.table(
        columns.map(col => ({
          Column: col.column_name,
          Type: col.data_type,
          Nullable: col.is_nullable === 'YES' ? 'Yes' : 'No',
          Default: col.column_default || '-',
        }))
      )
    }

    // Report column validation results
    if (missingColumns.length === 0) {
      logSuccess(`All ${REQUIRED_COLUMNS.length} required columns present`)
    } else {
      logError(`Missing ${missingColumns.length} required columns: ${missingColumns.join(', ')}`)
    }

    if (extraColumns.length > 0) {
      logInfo(`Found ${extraColumns.length} additional columns: ${extraColumns.join(', ')}`)
    }

    // Check indexes
    const indexes = await getTableIndexes(pool)
    logInfo(`Found ${indexes.length} indexes`)

    if (args.verbose && indexes.length > 0) {
      logHeader('Index Details')
      indexes.forEach(idx => {
        console.log(`  • ${idx.indexname}`)
      })
    }

    // Get row count
    const rowCount = await getRowCount(pool)
    logInfo(`Table contains ${rowCount.toLocaleString()} rows`)

    // Summary
    logHeader('Summary')

    if (missingColumns.length === 0) {
      logSuccess('Schema validation passed - all required columns are present')
    } else {
      logError('Schema validation failed - missing required columns')
      console.log('\nTo fix missing columns, you can:')
      console.log('1. Drop and recreate the table (will lose data):')
      console.log('   psql $DATABASE_URL -c "DROP TABLE conversation_analyses CASCADE;"')
      console.log('   bun run scripts/db/migrations/011-add-conversation-analyses.ts')
      console.log('\n2. Add missing columns manually (preserves data)')
      process.exit(1)
    }
  } catch (error) {
    logError(`Database error: ${error instanceof Error ? error.message : String(error)}`)
    if (args.verbose && error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack)
    }
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// ============================================================================
// Script Execution
// ============================================================================

if (import.meta.main) {
  main().catch(error => {
    console.error('Unhandled error:', error)
    process.exit(1)
  })
}
