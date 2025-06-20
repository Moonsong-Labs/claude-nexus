#!/usr/bin/env bun

import { Pool } from 'pg'
import { randomUUID } from 'crypto'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function testSubtaskLinking() {
  try {
    console.log('Testing sub-task linking with fixed SQL...\n')

    // Find the Task invocation from the logs
    const taskRequestId = 'd82a8b79-576b-4681-91bf-ef880198d3e6'
    const subtaskRequestId = '5612922b-7682-489c-bb72-10c60b0eaa80'
    
    // Get the task details
    const taskResult = await pool.query(
      'SELECT timestamp, task_tool_invocation FROM api_requests WHERE request_id = $1',
      [taskRequestId]
    )
    
    if (taskResult.rows.length === 0) {
      console.log('Task not found')
      return
    }
    
    const task = taskResult.rows[0]
    console.log(`Found Task request: ${taskRequestId}`)
    console.log(`Task timestamp: ${task.timestamp}`)
    console.log(`Task invocation: ${JSON.stringify(task.task_tool_invocation[0].input.prompt?.substring(0, 50))}...`)
    
    // Get the subtask details
    const subtaskResult = await pool.query(
      `SELECT 
        timestamp, 
        parent_task_request_id,
        is_subtask,
        body->'messages'->0->'content'->1->>'text' as user_content
      FROM api_requests 
      WHERE request_id = $1`,
      [subtaskRequestId]
    )
    
    if (subtaskResult.rows.length === 0) {
      console.log('Subtask not found')
      return
    }
    
    const subtask = subtaskResult.rows[0]
    console.log(`\nFound potential sub-task: ${subtaskRequestId}`)
    console.log(`Subtask timestamp: ${subtask.timestamp}`)
    console.log(`Current parent_task_request_id: ${subtask.parent_task_request_id || 'null'}`)
    console.log(`Current is_subtask: ${subtask.is_subtask}`)
    console.log(`Content preview: ${subtask.user_content?.substring(0, 50)}...`)
    
    // Test the fixed SQL query
    console.log('\nTesting the fixed SQL query...')
    const testQuery = `
      SELECT request_id, timestamp
      FROM api_requests
      WHERE task_tool_invocation IS NOT NULL
      AND timestamp >= $1::timestamp - interval '60 seconds'
      AND timestamp <= $1::timestamp
      AND jsonb_path_exists(
        task_tool_invocation,
        '$[*] ? (@.input.prompt == $prompt || @.input.description == $prompt)',
        jsonb_build_object('prompt', $2)
      )
      ORDER BY timestamp DESC
      LIMIT 1
    `
    
    const matchResult = await pool.query(testQuery, [
      subtask.timestamp,
      subtask.user_content
    ])
    
    if (matchResult.rows.length > 0) {
      console.log('✅ SQL query works! Found matching task:', matchResult.rows[0].request_id)
    } else {
      console.log('❌ No match found with the query')
      
      // Try partial match
      console.log('\nTrying partial content match...')
      const partialContent = 'Count the total lines of code in the claude-nexus-proxy repository'
      const partialResult = await pool.query(testQuery, [
        subtask.timestamp,
        partialContent
      ])
      
      if (partialResult.rows.length > 0) {
        console.log('✅ Partial match found:', partialResult.rows[0].request_id)
      } else {
        console.log('❌ No partial match either')
      }
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

testSubtaskLinking().catch(console.error)