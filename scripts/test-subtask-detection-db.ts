#!/usr/bin/env bun

import { Pool } from 'pg'
import { randomUUID } from 'crypto'
import { createHash } from 'crypto'

// Connect to database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function testSubtaskDetection() {
  try {
    console.log('Testing sub-task detection directly in database...\n')

    // 1. Create a parent request with Task invocation
    const parentRequestId = randomUUID()
    const parentConversationId = randomUUID()
    const parentTimestamp = new Date()
    
    const taskPrompt = "Analyze the codebase and count lines of code by file type"
    const taskInvocation = [{
      id: "toolu_test123",
      name: "Task",
      input: {
        prompt: taskPrompt,
        description: "Count code lines"
      }
    }]

    console.log('1. Creating parent request with Task invocation...')
    await pool.query(`
      INSERT INTO api_requests (
        request_id, domain, timestamp, method, path, headers, body,
        api_key_hash, model, request_type, conversation_id,
        task_tool_invocation, response_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      parentRequestId,
      'test.localhost',
      parentTimestamp,
      'POST',
      '/v1/messages',
      JSON.stringify({}),
      JSON.stringify({ messages: [{ role: 'user', content: 'Original request' }] }),
      'test-hash',
      'claude-3-opus',
      'inference',
      parentConversationId,
      JSON.stringify(taskInvocation),
      200
    ])
    console.log(`✅ Parent request created: ${parentRequestId}`)
    console.log(`   Task prompt: "${taskPrompt}"`)

    // 2. Wait 5 seconds
    console.log('\n2. Waiting 5 seconds...')
    await new Promise(resolve => setTimeout(resolve, 5000))

    // 3. Create a sub-task request with the same prompt
    const subtaskRequestId = randomUUID()
    const subtaskConversationId = randomUUID()
    const subtaskTimestamp = new Date()

    console.log('\n3. Creating sub-task request with matching prompt...')
    const subtaskBody = {
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '<system-reminder>System context here</system-reminder>' },
          { type: 'text', text: taskPrompt }  // Same prompt as Task invocation
        ]
      }]
    }

    await pool.query(`
      INSERT INTO api_requests (
        request_id, domain, timestamp, method, path, headers, body,
        api_key_hash, model, request_type, conversation_id,
        parent_message_hash  -- No parent hash = new conversation
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      subtaskRequestId,
      'test.localhost',
      subtaskTimestamp,
      'POST',
      '/v1/messages',
      JSON.stringify({}),
      JSON.stringify(subtaskBody),
      'test-hash',
      'claude-3-opus',
      'inference',
      subtaskConversationId,
      null  // No parent = new conversation
    ])
    console.log(`✅ Sub-task request created: ${subtaskRequestId}`)

    // 4. Run the sub-task detection query
    console.log('\n4. Running sub-task detection query...')
    const detectQuery = `
      WITH subtask_content AS (
        SELECT 
          request_id,
          body->'messages'->0->'content'->1->>'text' as user_content,
          timestamp
        FROM api_requests 
        WHERE request_id = $1
      )
      SELECT 
        ar.request_id as parent_id,
        ar.timestamp as parent_timestamp,
        sc.request_id as subtask_id,
        sc.timestamp as subtask_timestamp,
        EXTRACT(EPOCH FROM (sc.timestamp - ar.timestamp)) as time_diff_seconds,
        jsonb_path_exists(
          ar.task_tool_invocation,
          '$[*] ? (@.input.prompt == $prompt)',
          jsonb_build_object('prompt', sc.user_content)
        ) as matches
      FROM api_requests ar
      CROSS JOIN subtask_content sc
      WHERE ar.task_tool_invocation IS NOT NULL
        AND ar.timestamp BETWEEN sc.timestamp - interval '60 seconds' AND sc.timestamp
      ORDER BY ar.timestamp DESC
    `

    const result = await pool.query(detectQuery, [subtaskRequestId])
    
    if (result.rows.length > 0) {
      console.log('✅ Sub-task detection successful!')
      console.log(`   Parent: ${result.rows[0].parent_id}`)
      console.log(`   Sub-task: ${result.rows[0].subtask_id}`)
      console.log(`   Time difference: ${result.rows[0].time_diff_seconds} seconds`)
      console.log(`   Match found: ${result.rows[0].matches}`)
    } else {
      console.log('❌ No matching parent task found')
    }

    // 5. Simulate the actual update that would happen
    console.log('\n5. Simulating sub-task linking update...')
    const updateResult = await pool.query(`
      UPDATE api_requests
      SET 
        parent_task_request_id = $1,
        is_subtask = true
      WHERE request_id = $2
      RETURNING request_id, parent_task_request_id, is_subtask
    `, [parentRequestId, subtaskRequestId])

    if (updateResult.rows.length > 0) {
      console.log('✅ Sub-task linked successfully!')
      console.log(`   Updated: ${JSON.stringify(updateResult.rows[0], null, 2)}`)
    }

    // 6. Verify the final state
    console.log('\n6. Verifying final state...')
    const verify = await pool.query(`
      SELECT 
        request_id,
        conversation_id,
        parent_task_request_id,
        is_subtask,
        task_tool_invocation IS NOT NULL as has_task_invocation
      FROM api_requests
      WHERE request_id IN ($1, $2)
      ORDER BY timestamp
    `, [parentRequestId, subtaskRequestId])

    console.log('\nFinal state:')
    verify.rows.forEach(row => {
      console.log(`  ${row.request_id}:`)
      console.log(`    - Conversation: ${row.conversation_id}`)
      console.log(`    - Parent task: ${row.parent_task_request_id || 'none'}`)
      console.log(`    - Is sub-task: ${row.is_subtask}`)
      console.log(`    - Has Task invocation: ${row.has_task_invocation}`)
    })

    // Cleanup
    console.log('\n7. Cleaning up test data...')
    await pool.query('DELETE FROM api_requests WHERE request_id IN ($1, $2)', [
      parentRequestId,
      subtaskRequestId
    ])
    console.log('✅ Test data cleaned up')

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

testSubtaskDetection().catch(console.error)