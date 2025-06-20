#!/usr/bin/env bun

import { Pool } from 'pg'
import { randomUUID } from 'crypto'
import { StorageWriter } from '../services/proxy/src/storage/writer.js'
import { createHash } from 'crypto'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

async function testSubtaskContinuation() {
  try {
    console.log('Testing sub-task continuation (subsequent messages)...\n')

    const writer = new StorageWriter(pool)
    
    // Step 1: Create a parent request with Task invocation
    const parentRequestId = randomUUID()
    const parentTimestamp = new Date()
    const taskPrompt = "Test sub-task continuation feature"
    
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
      JSON.stringify({ messages: [{ role: 'user', content: 'spawn task' }] }),
      'test-hash',
      'claude-3-opus',
      'inference',
      randomUUID(),
      JSON.stringify([{
        id: "toolu_test_continuation",
        name: "Task",
        input: {
          prompt: taskPrompt,
          description: "Test continuation"
        }
      }]),
      200
    ])
    console.log(`✅ Parent created: ${parentRequestId}`)
    
    // Step 2: Create first sub-task request
    const subtaskConversationId = randomUUID()
    const firstRequestId = randomUUID()
    const firstMessageHash = hashContent(taskPrompt)
    
    console.log('\n2. Creating FIRST sub-task request...')
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    await writer.storeRequest({
      requestId: firstRequestId,
      domain: 'test.localhost',
      timestamp: new Date(),
      method: 'POST',
      path: '/v1/messages',
      headers: {},
      body: {
        messages: [{
          role: 'user',
          content: taskPrompt
        }]
      },
      apiKey: 'test-key',
      model: 'claude-3-opus',
      requestType: 'inference',
      conversationId: subtaskConversationId,
      currentMessageHash: firstMessageHash,
      parentMessageHash: null, // First message
    })
    
    // Check first request
    const firstResult = await pool.query(
      'SELECT parent_task_request_id, is_subtask FROM api_requests WHERE request_id = $1',
      [firstRequestId]
    )
    
    console.log(`✅ First request: ${firstRequestId}`)
    console.log(`   parent_task_request_id: ${firstResult.rows[0].parent_task_request_id}`)
    console.log(`   is_subtask: ${firstResult.rows[0].is_subtask}`)
    
    // Step 3: Create second request in same conversation
    const secondRequestId = randomUUID()
    const secondMessageHash = hashContent('Second message')
    
    console.log('\n3. Creating SECOND request in same sub-task conversation...')
    await writer.storeRequest({
      requestId: secondRequestId,
      domain: 'test.localhost',
      timestamp: new Date(),
      method: 'POST',
      path: '/v1/messages',
      headers: {},
      body: {
        messages: [
          { role: 'user', content: taskPrompt },
          { role: 'assistant', content: 'Working on it...' },
          { role: 'user', content: 'Second message' }
        ]
      },
      apiKey: 'test-key',
      model: 'claude-3-opus',
      requestType: 'inference',
      conversationId: subtaskConversationId, // Same conversation
      currentMessageHash: secondMessageHash,
      parentMessageHash: firstMessageHash, // Has parent
    })
    
    // Check second request
    const secondResult = await pool.query(
      'SELECT parent_task_request_id, is_subtask FROM api_requests WHERE request_id = $1',
      [secondRequestId]
    )
    
    console.log(`✅ Second request: ${secondRequestId}`)
    console.log(`   parent_task_request_id: ${secondResult.rows[0].parent_task_request_id}`)
    console.log(`   is_subtask: ${secondResult.rows[0].is_subtask}`)
    
    // Step 4: Create third request
    const thirdRequestId = randomUUID()
    const thirdMessageHash = hashContent('Third message')
    
    console.log('\n4. Creating THIRD request in same sub-task conversation...')
    await writer.storeRequest({
      requestId: thirdRequestId,
      domain: 'test.localhost',
      timestamp: new Date(),
      method: 'POST',
      path: '/v1/messages',
      headers: {},
      body: {
        messages: [
          { role: 'user', content: taskPrompt },
          { role: 'assistant', content: 'Working on it...' },
          { role: 'user', content: 'Second message' },
          { role: 'assistant', content: 'Still working...' },
          { role: 'user', content: 'Third message' }
        ]
      },
      apiKey: 'test-key',
      model: 'claude-3-opus',
      requestType: 'inference',
      conversationId: subtaskConversationId, // Same conversation
      currentMessageHash: thirdMessageHash,
      parentMessageHash: secondMessageHash, // Chain from second
    })
    
    // Check third request
    const thirdResult = await pool.query(
      'SELECT parent_task_request_id, is_subtask FROM api_requests WHERE request_id = $1',
      [thirdRequestId]
    )
    
    console.log(`✅ Third request: ${thirdRequestId}`)
    console.log(`   parent_task_request_id: ${thirdResult.rows[0].parent_task_request_id}`)
    console.log(`   is_subtask: ${thirdResult.rows[0].is_subtask}`)
    
    // Summary
    console.log('\n5. SUMMARY:')
    const allLinked = 
      firstResult.rows[0].is_subtask && 
      secondResult.rows[0].is_subtask && 
      thirdResult.rows[0].is_subtask &&
      firstResult.rows[0].parent_task_request_id === parentRequestId &&
      secondResult.rows[0].parent_task_request_id === parentRequestId &&
      thirdResult.rows[0].parent_task_request_id === parentRequestId
    
    if (allLinked) {
      console.log('✅ SUCCESS! All requests in sub-task conversation are properly linked!')
    } else {
      console.log('❌ FAILED! Not all requests are linked to the parent task')
    }
    
    // Cleanup
    console.log('\n6. Cleaning up test data...')
    await pool.query('DELETE FROM api_requests WHERE request_id IN ($1, $2, $3, $4)', [
      parentRequestId, firstRequestId, secondRequestId, thirdRequestId
    ])
    console.log('✅ Cleanup complete')
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

testSubtaskContinuation().catch(console.error)