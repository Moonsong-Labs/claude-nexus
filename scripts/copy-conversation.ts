#!/usr/bin/env bun
/**
 * Copy Conversation Script
 *
 * This script copies all requests of a given conversation from one table to another.
 * It's designed to be flexible and work with configurable table names.
 *
 * Usage:
 *   bun run scripts/copy-conversation.ts --conversation-id <uuid> [options]
 *
 * Options:
 *   --conversation-id <uuid>  Required. The conversation ID to copy
 *   --source-table <name>     Source table name (default: nexus_query_logs)
 *   --dest-table <name>       Destination table name (default: nexus_query_staging)
 *   --dry-run                 Show what would be copied without executing
 *   --include-chunks          Also copy related streaming_chunks data
 *   --verbose                 Enable verbose logging
 *
 * Expected table structure:
 *   Both tables should have similar structure to api_requests table with at least:
 *   - request_id (UUID)
 *   - conversation_id (UUID)
 *   - All other columns from the source should exist in destination
 */

import { parseArgs } from 'util'
import pg from 'pg'

const { Client } = pg

// Parse command line arguments
const { values, positionals } = parseArgs({
  args: Bun.argv,
  options: {
    'conversation-id': {
      type: 'string',
    },
    'source-table': {
      type: 'string',
      default: 'nexus_query_logs',
    },
    'dest-table': {
      type: 'string',
      default: 'nexus_query_staging',
    },
    'dry-run': {
      type: 'boolean',
      default: false,
    },
    'include-chunks': {
      type: 'boolean',
      default: false,
    },
    verbose: {
      type: 'boolean',
      default: false,
    },
    help: {
      type: 'boolean',
      default: false,
    },
  },
  strict: true,
  allowPositionals: true,
})

// Show help if requested
if (values['help']) {
  console.log(`Copy Conversation Script

This script copies all requests of a given conversation from one table to another.

Usage:
  bun run scripts/copy-conversation.ts --conversation-id <uuid> [options]

Options:
  --conversation-id <uuid>  Required. The conversation ID to copy
  --source-table <name>     Source table name (default: nexus_query_logs)
  --dest-table <name>       Destination table name (default: nexus_query_staging)
  --dry-run                 Show what would be copied without executing
  --include-chunks          Also copy related streaming_chunks data
  --verbose                 Enable verbose logging
  --help                    Show this help message

Examples:
  # Basic copy
  bun run scripts/copy-conversation.ts --conversation-id 123e4567-e89b-12d3-a456-426614174000

  # Dry run to see what would be copied
  bun run scripts/copy-conversation.ts --conversation-id 123e4567-e89b-12d3-a456-426614174000 --dry-run

  # Copy with streaming chunks
  bun run scripts/copy-conversation.ts --conversation-id 123e4567-e89b-12d3-a456-426614174000 --include-chunks

  # Use custom table names
  bun run scripts/copy-conversation.ts --conversation-id 123e4567-e89b-12d3-a456-426614174000 --source-table api_requests --dest-table api_requests_staging
`)
  process.exit(0)
}

// Validate required arguments
if (!values['conversation-id']) {
  console.error('Error: --conversation-id is required')
  console.error('Usage: bun run scripts/copy-conversation.ts --conversation-id <uuid> [options]')
  console.error('Run with --help for more information')
  process.exit(1)
}

// Validate UUID format
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (!uuidRegex.test(values['conversation-id'])) {
  console.error('Error: Invalid conversation ID format. Must be a valid UUID.')
  process.exit(1)
}

const config = {
  conversationId: values['conversation-id'],
  sourceTable: values['source-table'],
  destTable: values['dest-table'],
  dryRun: values['dry-run'],
  includeChunks: values['include-chunks'],
  verbose: values['verbose'],
}

// Database connection
const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is not set')
  process.exit(1)
}

const client = new Client({
  connectionString: DATABASE_URL,
})

async function tableExists(tableName: string): Promise<boolean> {
  const query = `
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    );
  `
  const result = await client.query(query, [tableName])
  return result.rows[0].exists
}

async function getTableColumns(tableName: string): Promise<string[]> {
  const query = `
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = $1
    ORDER BY ordinal_position;
  `
  const result = await client.query(query, [tableName])
  return result.rows.map(row => row.column_name)
}

async function getConversationRequests(): Promise<any[]> {
  const query = `
    SELECT * FROM ${config.sourceTable}
    WHERE conversation_id = $1
    ORDER BY timestamp ASC;
  `

  try {
    const result = await client.query(query, [config.conversationId])
    return result.rows
  } catch (error: any) {
    if (error.code === '42P01') {
      // undefined_table
      throw new Error(`Table "${config.sourceTable}" does not exist`)
    }
    if (error.code === '42703') {
      // undefined_column
      throw new Error(`Column "conversation_id" does not exist in table "${config.sourceTable}"`)
    }
    throw error
  }
}

async function copyRequests(requests: any[], commonColumns: string[]): Promise<number> {
  if (requests.length === 0) {
    return 0
  }

  // Build insert query dynamically based on common columns
  const columnsList = commonColumns.join(', ')
  const placeholders = commonColumns.map((_, index) => `$${index + 1}`).join(', ')

  const insertQuery = `
    INSERT INTO ${config.destTable} (${columnsList})
    VALUES (${placeholders})
    ON CONFLICT (request_id) DO NOTHING;
  `

  let copiedCount = 0

  for (const request of requests) {
    const values = commonColumns.map(col => request[col])

    if (config.verbose) {
      console.log(`Copying request ${request.request_id}...`)
    }

    if (!config.dryRun) {
      try {
        const result = await client.query(insertQuery, values)
        if (result.rowCount > 0) {
          copiedCount++
        }
      } catch (error: any) {
        console.error(`Error copying request ${request.request_id}:`, error.message)
        throw error
      }
    } else {
      copiedCount++
    }
  }

  return copiedCount
}

async function copyStreamingChunks(requestIds: string[]): Promise<number> {
  if (requestIds.length === 0 || !config.includeChunks) {
    return 0
  }

  const query = `
    INSERT INTO streaming_chunks (request_id, chunk_index, timestamp, data, token_count, created_at)
    SELECT request_id, chunk_index, timestamp, data, token_count, created_at
    FROM streaming_chunks
    WHERE request_id = ANY($1)
    ON CONFLICT (request_id, chunk_index) DO NOTHING;
  `

  if (!config.dryRun) {
    const result = await client.query(query, [requestIds])
    return result.rowCount || 0
  } else {
    // In dry-run mode, just count the chunks
    const countQuery = `
      SELECT COUNT(*) as count
      FROM streaming_chunks
      WHERE request_id = ANY($1);
    `
    const result = await client.query(countQuery, [requestIds])
    return parseInt(result.rows[0].count)
  }
}

async function main() {
  try {
    await client.connect()
    console.log('Connected to database')

    // Start transaction
    await client.query('BEGIN')

    // Check if tables exist
    console.log(`\nChecking tables...`)
    const sourceExists = await tableExists(config.sourceTable)
    const destExists = await tableExists(config.destTable)

    if (!sourceExists) {
      throw new Error(`Source table "${config.sourceTable}" does not exist`)
    }
    if (!destExists) {
      throw new Error(`Destination table "${config.destTable}" does not exist`)
    }
    console.log('✓ Both tables exist')

    // Get column information
    console.log(`\nAnalyzing table structures...`)
    const sourceColumns = await getTableColumns(config.sourceTable)
    const destColumns = await getTableColumns(config.destTable)

    // Find common columns
    const commonColumns = sourceColumns.filter(col => destColumns.includes(col))
    const missingColumns = sourceColumns.filter(col => !destColumns.includes(col))

    console.log(`✓ Source table has ${sourceColumns.length} columns`)
    console.log(`✓ Destination table has ${destColumns.length} columns`)
    console.log(`✓ ${commonColumns.length} columns will be copied`)

    if (missingColumns.length > 0) {
      console.warn(
        `⚠ Warning: ${missingColumns.length} columns exist in source but not in destination:`
      )
      console.warn(`  ${missingColumns.join(', ')}`)
    }

    // Get conversation requests
    console.log(`\nFetching conversation ${config.conversationId}...`)
    const requests = await getConversationRequests()

    if (requests.length === 0) {
      console.log('No requests found for this conversation ID')
      await client.query('ROLLBACK')
      return
    }

    console.log(`✓ Found ${requests.length} requests to copy`)

    // Show summary in dry-run mode
    if (config.dryRun) {
      console.log('\n=== DRY RUN MODE ===')
      console.log('The following operations would be performed:')
      console.log(
        `- Copy ${requests.length} requests from ${config.sourceTable} to ${config.destTable}`
      )

      if (config.includeChunks) {
        const requestIds = requests.map(r => r.request_id)
        const chunksCount = await copyStreamingChunks(requestIds)
        console.log(`- Copy ${chunksCount} streaming chunks`)
      }

      console.log('\nSample request data:')
      const sample = requests[0]
      console.log(`  Request ID: ${sample.request_id}`)
      console.log(`  Timestamp: ${sample.timestamp}`)
      console.log(`  Model: ${sample.model || 'N/A'}`)
      console.log(`  Domain: ${sample.domain || 'N/A'}`)
    } else {
      // Copy requests
      console.log(`\nCopying requests...`)
      const copiedCount = await copyRequests(requests, commonColumns)
      console.log(`✓ Copied ${copiedCount} requests`)

      // Copy streaming chunks if requested
      if (config.includeChunks) {
        console.log(`\nCopying streaming chunks...`)
        const requestIds = requests.map(r => r.request_id)
        const chunksCount = await copyStreamingChunks(requestIds)
        console.log(`✓ Copied ${chunksCount} streaming chunks`)
      }
    }

    // Commit transaction
    if (!config.dryRun) {
      await client.query('COMMIT')
      console.log('\n✓ Transaction committed successfully')
    } else {
      await client.query('ROLLBACK')
      console.log('\n✓ Dry run completed (no changes made)')
    }
  } catch (error) {
    console.error('\nError:', error)
    await client.query('ROLLBACK')
    process.exit(1)
  } finally {
    await client.end()
  }
}

// Run the script
main().catch(console.error)
