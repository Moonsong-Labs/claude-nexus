#!/usr/bin/env bun
/**
 * Copy specific requests to development database for testing
 */

import { Pool } from 'pg'
import { config } from 'dotenv'

config()

const READONLY_CONNECTION_STRING =
  'postgresql://readonly_user:ReadOnly%23Secure2025%21@aurora-serverless-nexus-logs-instance.canjjr6w3qne.us-east-1.rds.amazonaws.com:5432/nexus_query_logs'

// Development database connection - you'll need to update this
const DEV_CONNECTION_STRING =
  process.env.DEV_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/claude_proxy'

async function main() {
  const sourcePool = new Pool({ connectionString: READONLY_CONNECTION_STRING })
  const targetPool = new Pool({ connectionString: DEV_CONNECTION_STRING })

  const requestIds = [
    'b8dd8bee-76df-436c-be51-c32e92c70987', // First request (127 messages)
    'ee9ec976-5cf7-4795-9ab5-a82210bbd555', // Second request (129 messages)
  ]

  try {
    console.log('Copying requests to development database...\n')

    // Check if dev database is accessible
    try {
      await targetPool.query('SELECT 1')
      console.log('✅ Connected to development database')
    } catch (error) {
      console.error('❌ Failed to connect to development database')
      console.error('Connection string:', DEV_CONNECTION_STRING)
      console.error('Error:', error.message)
      console.error('\nMake sure PostgreSQL is running. You can start it with:')
      console.error(
        '  docker run -d --name postgres-dev -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15-alpine'
      )
      process.exit(1)
    }

    // Ensure table has all required columns
    console.log('Ensuring target database schema...')

    // First check if table exists
    const tableExists = await targetPool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'api_requests'
      )
    `)

    if (tableExists.rows[0].exists) {
      // Add missing columns if table exists
      console.log('Table exists, ensuring all columns are present...')

      const columnsToAdd = [
        { name: 'account_id', definition: 'VARCHAR(255)' },
        { name: 'cache_creation_input_tokens', definition: 'INTEGER DEFAULT 0' },
        { name: 'cache_read_input_tokens', definition: 'INTEGER DEFAULT 0' },
        { name: 'usage_data', definition: 'JSONB' },
        { name: 'current_message_hash', definition: 'CHAR(64)' },
        { name: 'parent_message_hash', definition: 'CHAR(64)' },
        { name: 'conversation_id', definition: 'UUID' },
        { name: 'branch_id', definition: "VARCHAR(255) DEFAULT 'main'" },
        { name: 'message_count', definition: 'INTEGER DEFAULT 0' },
        { name: 'parent_task_request_id', definition: 'UUID' },
        { name: 'is_subtask', definition: 'BOOLEAN DEFAULT false' },
        { name: 'task_tool_invocation', definition: 'JSONB' },
      ]

      for (const column of columnsToAdd) {
        try {
          await targetPool.query(`
            ALTER TABLE api_requests 
            ADD COLUMN IF NOT EXISTS ${column.name} ${column.definition}
          `)
        } catch (e) {
          // Ignore errors for columns that already exist
          if (!e.message.includes('already exists')) {
            console.error(`Failed to add column ${column.name}: ${e.message}`)
          }
        }
      }
    }

    // Get the requests from source database
    const query = `
      SELECT *
      FROM api_requests
      WHERE request_id = ANY($1::uuid[])
    `

    const result = await sourcePool.query(query, [requestIds])

    console.log(`Found ${result.rows.length} requests to copy\n`)

    if (result.rows.length === 0) {
      console.log('No requests found with the specified IDs')
      return
    }

    // Check if requests already exist in target
    const existingCheck = await targetPool.query(
      'SELECT request_id FROM api_requests WHERE request_id = ANY($1::uuid[])',
      [requestIds]
    )

    if (existingCheck.rows.length > 0) {
      console.log('⚠️  Some requests already exist in target database:')
      existingCheck.rows.forEach(row => {
        console.log(`   - ${row.request_id}`)
      })

      const response = prompt(
        '\nDo you want to DELETE existing requests and insert fresh copies? (yes/no): '
      )
      if (response?.toLowerCase() === 'yes') {
        await targetPool.query('DELETE FROM api_requests WHERE request_id = ANY($1::uuid[])', [
          requestIds,
        ])
        console.log('Deleted existing requests')
      } else {
        console.log('Aborting operation')
        return
      }
    }

    // Helper function to format JSONB fields for PostgreSQL
    const formatJsonb = (value: any): string | null => {
      if (value === null || value === undefined) return null
      // If it's already an object/array, stringify it for PostgreSQL
      if (typeof value === 'object') {
        return JSON.stringify(value)
      }
      // If it's a string, return as-is (it should already be valid JSON)
      return value
    }

    // Insert requests into target database
    for (const row of result.rows) {
      console.log(`📦 Processing request ${row.request_id}...`)

      const insertQuery = `
        INSERT INTO api_requests (
          request_id,
          domain,
          account_id,
          timestamp,
          method,
          path,
          headers,
          body,
          api_key_hash,
          model,
          request_type,
          response_status,
          response_headers,
          response_body,
          response_streaming,
          input_tokens,
          output_tokens,
          total_tokens,
          cache_creation_input_tokens,
          cache_read_input_tokens,
          usage_data,
          first_token_ms,
          duration_ms,
          error,
          tool_call_count,
          current_message_hash,
          parent_message_hash,
          conversation_id,
          branch_id,
          message_count,
          parent_task_request_id,
          is_subtask,
          task_tool_invocation,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
          $31, $32, $33, $34
        )
      `

      const values = [
        row.request_id,
        row.domain,
        row.account_id || null,
        row.timestamp,
        row.method,
        row.path,
        formatJsonb(row.headers),
        formatJsonb(row.body),
        row.api_key_hash || null,
        row.model,
        row.request_type,
        row.response_status || row.status_code || null,
        formatJsonb(row.response_headers),
        formatJsonb(row.response_body),
        row.response_streaming !== undefined ? row.response_streaming : false,
        row.input_tokens || row.prompt_tokens || 0,
        row.output_tokens || row.completion_tokens || 0,
        row.total_tokens || 0,
        row.cache_creation_input_tokens || 0,
        row.cache_read_input_tokens || 0,
        formatJsonb(row.usage_data),
        row.first_token_ms || null,
        row.duration_ms || row.response_time_ms || null,
        row.error || null,
        row.tool_call_count || 0,
        row.current_message_hash || null,
        row.parent_message_hash || null,
        row.conversation_id || null,
        row.branch_id || 'main',
        row.message_count || 0,
        row.parent_task_request_id || null,
        row.is_subtask !== undefined ? row.is_subtask : false,
        formatJsonb(row.task_tool_invocation),
        row.created_at || new Date(),
      ]

      try {
        await targetPool.query(insertQuery, values)
        console.log(`✅ Copied request ${row.request_id}`)
        console.log(`   - Domain: ${row.domain}`)
        console.log(`   - Timestamp: ${row.timestamp}`)
        console.log(`   - Messages: ${row.message_count || 0}`)
        console.log(`   - Conversation: ${row.conversation_id || 'NULL'}`)
        console.log(`   - Is subtask: ${row.is_subtask || false}`)
        if (row.task_tool_invocation) {
          console.log(
            `   - Task invocations: ${Array.isArray(row.task_tool_invocation) ? row.task_tool_invocation.length : 1}`
          )
        }
        console.log('')
      } catch (insertError) {
        console.error(`\n❌ Failed to insert request ${row.request_id}:`)
        console.error(`   Error: ${insertError.message}`)

        // For debugging, log the specific field if it's a JSON parsing error
        if (insertError.message.includes('$33')) {
          console.error('\n   Task tool invocation debug:')
          console.error(`   - Type: ${typeof row.task_tool_invocation}`)
          console.error(`   - Is Array: ${Array.isArray(row.task_tool_invocation)}`)
          console.error(`   - Value: ${JSON.stringify(row.task_tool_invocation, null, 2)}`)
        }

        throw insertError
      }
    }

    console.log('\n✅ Successfully copied all requests to development database!')
    console.log('\nYou can now experiment with these requests in the dev database.')
    console.log('Connection string:', DEV_CONNECTION_STRING)
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await sourcePool.end()
    await targetPool.end()
  }
}

main()
