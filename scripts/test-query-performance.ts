#!/usr/bin/env bun
import { Pool } from 'pg'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env' })

async function testQueryPerformance() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    console.log('Testing query performance...\n')

    // Test 1: Original query (loading full body)
    console.log('1. Original query (loading full body):')
    const start1 = Date.now()
    const result1 = await pool.query(`
      SELECT 
        request_id, domain, timestamp, model, 
        input_tokens, output_tokens, total_tokens, duration_ms,
        error, request_type, tool_call_count, conversation_id,
        current_message_hash, parent_message_hash, branch_id, message_count,
        parent_task_request_id, is_subtask, task_tool_invocation, body
      FROM api_requests 
      WHERE conversation_id IS NOT NULL
      ORDER BY conversation_id, timestamp ASC
      LIMIT 100
    `)
    const time1 = Date.now() - start1
    console.log(`   - Execution time: ${time1}ms`)
    console.log(`   - Rows returned: ${result1.rows.length}`)
    console.log(
      `   - Average body size: ${
        result1.rows.reduce((sum, row) => sum + JSON.stringify(row.body || {}).length, 0) /
        result1.rows.length
      } bytes\n`
    )

    // Test 2: Optimized query (using JSON operators)
    console.log('2. Optimized query (using JSON operators):')
    const start2 = Date.now()
    const result2 = await pool.query(`
      SELECT 
        request_id, domain, timestamp, model, 
        input_tokens, output_tokens, total_tokens, duration_ms,
        error, request_type, tool_call_count, conversation_id,
        current_message_hash, parent_message_hash, branch_id, message_count,
        parent_task_request_id, is_subtask, task_tool_invocation,
        CASE 
          WHEN body -> 'messages' IS NOT NULL AND jsonb_array_length(body -> 'messages') > 0 THEN
            body -> 'messages' -> -1
          ELSE 
            NULL
        END as last_message
      FROM api_requests 
      WHERE conversation_id IS NOT NULL
      ORDER BY conversation_id, timestamp ASC
      LIMIT 100
    `)
    const time2 = Date.now() - start2
    console.log(`   - Execution time: ${time2}ms`)
    console.log(`   - Rows returned: ${result2.rows.length}`)
    console.log(
      `   - Average last_message size: ${
        result2.rows.reduce((sum, row) => sum + JSON.stringify(row.last_message || {}).length, 0) /
        result2.rows.length
      } bytes\n`
    )

    // Calculate improvement
    const improvement = ((time1 - time2) / time1) * 100
    console.log(`Performance improvement: ${improvement.toFixed(2)}%`)
    console.log(`Speed ratio: ${(time1 / time2).toFixed(2)}x faster`)

    // Test 3: Check if JSON operator works correctly
    console.log('\n3. Verifying JSON operator extraction:')
    const sampleRows = result2.rows.slice(0, 3)
    for (const row of sampleRows) {
      if (row.last_message) {
        console.log(`   Request ${row.request_id}:`)
        console.log(`   - Role: ${row.last_message.role}`)
        console.log(`   - Content type: ${typeof row.last_message.content}`)
        if (typeof row.last_message.content === 'string') {
          console.log(`   - Content preview: ${row.last_message.content.substring(0, 50)}...`)
        } else if (Array.isArray(row.last_message.content) && row.last_message.content[0]) {
          console.log(`   - Content type: ${row.last_message.content[0].type}`)
        }
      }
    }
  } catch (error) {
    console.error('Error testing query performance:', error)
  } finally {
    await pool.end()
  }
}

testQueryPerformance()
