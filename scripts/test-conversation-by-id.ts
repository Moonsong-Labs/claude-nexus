#!/usr/bin/env bun
import { Pool } from 'pg'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env' })

async function testConversationByIdPerformance() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    console.log('Testing conversation loading performance...\n')

    // First, get a sample conversation ID
    const sampleResult = await pool.query(`
      SELECT conversation_id 
      FROM api_requests 
      WHERE conversation_id IS NOT NULL 
      GROUP BY conversation_id 
      HAVING COUNT(*) > 10
      LIMIT 1
    `)

    if (sampleResult.rows.length === 0) {
      console.log('No suitable conversations found for testing')
      return
    }

    const conversationId = sampleResult.rows[0].conversation_id
    console.log(`Testing with conversation ID: ${conversationId}\n`)

    // Test 1: Old approach - load all conversations then filter
    console.log('1. Old approach (load all conversations then filter):')
    const start1 = Date.now()

    // Simulate the old getConversations query
    const allConversationsResult = await pool.query(`
      SELECT 
        conversation_id,
        COUNT(*) as request_count,
        MAX(message_count) as message_count,
        MIN(timestamp) as first_message,
        MAX(timestamp) as last_message,
        SUM(total_tokens) as total_tokens,
        array_agg(DISTINCT branch_id) FILTER (WHERE branch_id IS NOT NULL) as branches
      FROM api_requests
      WHERE conversation_id IS NOT NULL
      GROUP BY conversation_id
      ORDER BY MAX(timestamp) DESC
      LIMIT 1000
    `)

    // Then load all requests for all conversations
    const conversationIds = allConversationsResult.rows.map(r => r.conversation_id)
    const allRequestsResult = await pool.query(
      `
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
      WHERE conversation_id = ANY($1::uuid[])
      ORDER BY conversation_id, timestamp ASC
    `,
      [conversationIds]
    )

    const time1 = Date.now() - start1
    console.log(`   - Execution time: ${time1}ms`)
    console.log(`   - Conversations loaded: ${allConversationsResult.rows.length}`)
    console.log(`   - Total requests loaded: ${allRequestsResult.rows.length}`)
    console.log(
      `   - Requests for target conversation: ${allRequestsResult.rows.filter(r => r.conversation_id === conversationId).length}\n`
    )

    // Test 2: New approach - load specific conversation by ID
    console.log('2. New approach (getConversationById):')
    const start2 = Date.now()

    // Get conversation metadata
    const conversationResult = await pool.query(
      `
      SELECT 
        conversation_id,
        COUNT(*) as request_count,
        MAX(message_count) as message_count,
        MIN(timestamp) as first_message,
        MAX(timestamp) as last_message,
        SUM(total_tokens) as total_tokens,
        array_agg(DISTINCT branch_id) FILTER (WHERE branch_id IS NOT NULL) as branches
      FROM api_requests
      WHERE conversation_id = $1
      GROUP BY conversation_id
    `,
      [conversationId]
    )

    // Get requests for this specific conversation
    const requestsResult = await pool.query(
      `
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
      WHERE conversation_id = $1
      ORDER BY timestamp ASC
    `,
      [conversationId]
    )

    const time2 = Date.now() - start2
    console.log(`   - Execution time: ${time2}ms`)
    console.log(`   - Requests loaded: ${requestsResult.rows.length}\n`)

    // Calculate improvement
    const improvement = ((time1 - time2) / time1) * 100
    console.log(`Performance improvement: ${improvement.toFixed(2)}%`)
    console.log(`Speed ratio: ${(time1 / time2).toFixed(2)}x faster`)
    console.log(
      `Data reduction: Loaded ${requestsResult.rows.length} requests instead of ${allRequestsResult.rows.length} (${((1 - requestsResult.rows.length / allRequestsResult.rows.length) * 100).toFixed(2)}% reduction)`
    )
  } catch (error) {
    console.error('Error testing performance:', error)
  } finally {
    await pool.end()
  }
}

testConversationByIdPerformance()
