#!/usr/bin/env bun
/**
 * Copy Conversation Script
 *
 * This script copies all requests of a given conversation between databases.
 * Supports copying to the same table name in a different database.
 *
 * Usage:
 *   bun run scripts/copy-conversation.ts --conversation-id <uuid> --dest-db <url> [options]
 *
 * Options:
 *   --conversation-id <uuid>  Required. The conversation ID to copy
 *   --dest-db <url>           Required. Destination database URL
 *   --source-table <name>     Source table name (default: nexus_query_logs)
 *   --dest-table <name>       Destination table name (default: nexus_query_staging)
 *   --dry-run                 Show what would be copied without executing
 *   --include-chunks          Also copy related streaming_chunks data
 *   --verbose                 Enable verbose logging
 *
 * Expected table structure:
 *   Both tables should have similar structure with at least:
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
    'dest-db': {
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

This script copies all requests of a given conversation between databases.

Usage:
  bun run scripts/copy-conversation.ts --conversation-id <uuid> --dest-db <url> [options]

Options:
  --conversation-id <uuid>  Required. The conversation ID to copy
  --dest-db <url>           Required. Destination database URL
  --source-table <name>     Source table name (default: nexus_query_logs)
  --dest-table <name>       Destination table name (default: nexus_query_staging)
  --dry-run                 Show what would be copied without executing
  --include-chunks          Also copy related streaming_chunks data
  --verbose                 Enable verbose logging
  --help                    Show this help message

Environment:
  DATABASE_URL              Source database connection (from environment)

Examples:
  # Copy to staging database (same table names)
  bun run scripts/copy-conversation.ts --conversation-id 123e4567-e89b-12d3-a456-426614174000 \\
    --dest-db "postgresql://user:pass@staging-host:5432/staging_db"

  # Copy between different table names
  bun run scripts/copy-conversation.ts --conversation-id 123e4567-e89b-12d3-a456-426614174000 \\
    --dest-db "postgresql://user:pass@staging-host:5432/staging_db" \\
    --source-table api_requests --dest-table api_requests_backup

  # Dry run to see what would be copied
  bun run scripts/copy-conversation.ts --conversation-id 123e4567-e89b-12d3-a456-426614174000 \\
    --dest-db "postgresql://user:pass@staging-host:5432/staging_db" --dry-run

  # Copy with streaming chunks
  bun run scripts/copy-conversation.ts --conversation-id 123e4567-e89b-12d3-a456-426614174000 \\
    --dest-db "postgresql://user:pass@staging-host:5432/staging_db" --include-chunks
`)
  process.exit(0)
}

// Validate required arguments
if (!values['conversation-id']) {
  console.error('Error: --conversation-id is required')
  console.error(
    'Usage: bun run scripts/copy-conversation.ts --conversation-id <uuid> --dest-db <url> [options]'
  )
  console.error('Run with --help for more information')
  process.exit(1)
}

if (!values['dest-db']) {
  console.error('Error: --dest-db is required')
  console.error(
    'Usage: bun run scripts/copy-conversation.ts --conversation-id <uuid> --dest-db <url> [options]'
  )
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
  destDbUrl: values['dest-db'],
  dryRun: values['dry-run'],
  includeChunks: values['include-chunks'],
  verbose: values['verbose'],
}

// Database connections
const SOURCE_DB_URL = process.env.DATABASE_URL
if (!SOURCE_DB_URL) {
  console.error('Error: DATABASE_URL environment variable is not set')
  process.exit(1)
}

const sourceClient = new Client({
  connectionString: SOURCE_DB_URL,
})

const destClient = new Client({
  connectionString: config.destDbUrl,
})

async function tableExists(client: any, tableName: string): Promise<boolean> {
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

async function getTableColumns(client: any, tableName: string): Promise<string[]> {
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
    const result = await sourceClient.query(query, [config.conversationId])
    return result.rows
  } catch (error: any) {
    if (error.code === '42P01') {
      // undefined_table
      throw new Error(`Table "${config.sourceTable}" does not exist in source database`)
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
        const result = await destClient.query(insertQuery, values)
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

  // For cross-database copy, we need to fetch from source and insert to destination
  const selectQuery = `
    SELECT request_id, chunk_index, timestamp, data, token_count, created_at
    FROM streaming_chunks
    WHERE request_id = ANY($1)
    ORDER BY request_id, chunk_index;
  `

  const chunks = await sourceClient.query(selectQuery, [requestIds])

  if (chunks.rows.length === 0) {
    return 0
  }

  let copiedCount = 0

  if (!config.dryRun) {
    // Insert chunks one by one to destination
    const insertQuery = `
      INSERT INTO streaming_chunks (request_id, chunk_index, timestamp, data, token_count, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (request_id, chunk_index) DO NOTHING;
    `

    for (const chunk of chunks.rows) {
      try {
        const result = await destClient.query(insertQuery, [
          chunk.request_id,
          chunk.chunk_index,
          chunk.timestamp,
          chunk.data,
          chunk.token_count,
          chunk.created_at,
        ])
        if (result.rowCount > 0) {
          copiedCount++
        }
      } catch (error: any) {
        console.error(
          `Error copying chunk ${chunk.request_id}[${chunk.chunk_index}]:`,
          error.message
        )
        throw error
      }
    }
  } else {
    copiedCount = chunks.rows.length
  }

  return copiedCount
}

async function main() {
  try {
    // Connect to both databases
    await sourceClient.connect()
    console.log('Connected to source database')

    await destClient.connect()
    console.log('Connected to destination database')

    // Start transactions on both connections
    await sourceClient.query('BEGIN')
    await destClient.query('BEGIN')

    // Check if tables exist
    console.log(`\nChecking tables...`)
    const sourceExists = await tableExists(sourceClient, config.sourceTable)
    const destExists = await tableExists(destClient, config.destTable)

    if (!sourceExists) {
      throw new Error(`Source table "${config.sourceTable}" does not exist in source database`)
    }
    if (!destExists) {
      throw new Error(
        `Destination table "${config.destTable}" does not exist in destination database`
      )
    }
    console.log('✓ Both tables exist')

    // Get column information
    console.log(`\nAnalyzing table structures...`)
    const sourceColumns = await getTableColumns(sourceClient, config.sourceTable)
    const destColumns = await getTableColumns(destClient, config.destTable)

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
      await sourceClient.query('ROLLBACK')
      await destClient.query('ROLLBACK')
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

    // Commit transactions
    if (!config.dryRun) {
      await sourceClient.query('COMMIT')
      await destClient.query('COMMIT')
      console.log('\n✓ Transactions committed successfully')
    } else {
      await sourceClient.query('ROLLBACK')
      await destClient.query('ROLLBACK')
      console.log('\n✓ Dry run completed (no changes made)')
    }
  } catch (error) {
    console.error('\nError:', error)
    try {
      await sourceClient.query('ROLLBACK')
      await destClient.query('ROLLBACK')
    } catch (rollbackError) {
      console.error('Error during rollback:', rollbackError)
    }
    process.exit(1)
  } finally {
    await sourceClient.end()
    await destClient.end()
  }
}

// Run the script
main().catch(console.error)
