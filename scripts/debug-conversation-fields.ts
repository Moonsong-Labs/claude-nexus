#!/usr/bin/env bun

import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function debugConversation() {
  try {
    const conversationId = 'e870f0a4-189a-499c-9da3-6cf7a4baa4dc'
    
    console.log(`Debugging conversation: ${conversationId}\n`)
    
    // Get the first request to see what fields are available
    const result = await pool.query(`
      SELECT *
      FROM api_requests
      WHERE conversation_id = $1
      AND task_tool_invocation IS NOT NULL
      LIMIT 1
    `, [conversationId])
    
    if (result.rows.length > 0) {
      const req = result.rows[0]
      console.log('Request fields available:')
      console.log(Object.keys(req))
      console.log('\ntask_tool_invocation field:')
      console.log('Type:', typeof req.task_tool_invocation)
      console.log('Value:', JSON.stringify(req.task_tool_invocation, null, 2))
    }
    
    // Also check what getConversations returns
    console.log('\n\nChecking getConversations query...')
    const convQuery = `
      SELECT 
        request_id, domain, timestamp, model, 
        input_tokens, output_tokens, total_tokens, duration_ms,
        error, request_type, tool_call_count, conversation_id,
        current_message_hash, parent_message_hash, branch_id, message_count,
        parent_task_request_id, is_subtask, task_tool_invocation
      FROM api_requests 
      WHERE conversation_id = $1
      ORDER BY timestamp ASC
    `
    
    const convResult = await pool.query(convQuery, [conversationId])
    console.log(`\nFound ${convResult.rows.length} requests`)
    
    for (const row of convResult.rows) {
      if (row.task_tool_invocation) {
        console.log(`\nRequest ${row.request_id}:`)
        console.log('- has task_tool_invocation:', !!row.task_tool_invocation)
        console.log('- task_tool_invocation type:', typeof row.task_tool_invocation)
        console.log('- is array:', Array.isArray(row.task_tool_invocation))
        console.log('- length:', row.task_tool_invocation?.length)
      }
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

debugConversation().catch(console.error)