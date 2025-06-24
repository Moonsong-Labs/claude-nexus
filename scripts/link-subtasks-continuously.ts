#!/usr/bin/env bun
/**
 * Script to continuously link sub-task conversations
 * Runs periodically to find and link new sub-tasks
 */

import { Pool } from 'pg'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
const envPath = path.join(process.cwd(), '../../.env')
dotenv.config({ path: envPath })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is required')
  process.exit(1)
}

const pool = new Pool({ connectionString: DATABASE_URL })

async function linkSubtasks() {
  const client = await pool.connect()

  try {
    // Find requests with Task invocations that might have sub-tasks to link
    const parentTasksQuery = `
      SELECT 
        request_id,
        task_tool_invocation,
        timestamp
      FROM api_requests
      WHERE task_tool_invocation IS NOT NULL
      AND timestamp > NOW() - INTERVAL '1 hour'
    `

    const { rows: parentTasks } = await client.query(parentTasksQuery)

    console.log(`Found ${parentTasks.length} requests with Task invocations in the last hour`)

    // Perform batch linking for all parent tasks
    if (parentTasks.length > 0) {
      const batchLinkQuery = `
        WITH parent_task_prompts AS (
          SELECT 
            ar.request_id,
            ar.timestamp,
            ar.conversation_id as parent_conversation_id,
            jsonb_array_elements(ar.task_tool_invocation) as task,
            (jsonb_array_elements(ar.task_tool_invocation)->>'input')::jsonb->>'prompt' as prompt,
            (jsonb_array_elements(ar.task_tool_invocation)->>'input')::jsonb->>'description' as description
          FROM api_requests ar
          WHERE ar.task_tool_invocation IS NOT NULL
          AND ar.timestamp > NOW() - interval '1 hour'
        ),
        task_prompts AS (
          SELECT 
            request_id,
            timestamp,
            parent_conversation_id,
            COALESCE(prompt, description) as task_prompt
          FROM parent_task_prompts
          WHERE COALESCE(prompt, description) IS NOT NULL
        ),
        first_messages AS (
          SELECT DISTINCT ON (ar.conversation_id)
            ar.conversation_id,
            ar.timestamp,
            ar.body->'messages'->0->>'content' as string_content,
            ar.body->'messages'->0->'content'->0->>'text' as array_content_0,
            ar.body->'messages'->0->'content'->1->>'text' as array_content_1
          FROM api_requests ar
          WHERE ar.timestamp = (
            SELECT MIN(timestamp) FROM api_requests WHERE conversation_id = ar.conversation_id
          )
          AND ar.body->'messages'->0->>'role' = 'user'
          AND ar.parent_task_request_id IS NULL
          ORDER BY ar.conversation_id, ar.timestamp
        ),
        matched_subtasks AS (
          SELECT DISTINCT
            tp.request_id as parent_request_id,
            fm.conversation_id as subtask_conversation_id
          FROM task_prompts tp
          JOIN first_messages fm ON (
            fm.timestamp > tp.timestamp AND
            fm.timestamp < tp.timestamp + interval '30 seconds' AND
            fm.conversation_id != tp.parent_conversation_id AND
            (
              fm.string_content = tp.task_prompt OR
              fm.array_content_0 = tp.task_prompt OR
              fm.array_content_1 = tp.task_prompt
            )
          )
        ),
        updated AS (
          UPDATE api_requests ar
          SET 
            parent_task_request_id = ms.parent_request_id,
            is_subtask = true
          FROM matched_subtasks ms
          WHERE ar.conversation_id = ms.subtask_conversation_id
          RETURNING ar.conversation_id, ar.parent_task_request_id
        )
        SELECT 
          COUNT(DISTINCT conversation_id) as linked_conversations,
          COUNT(DISTINCT parent_task_request_id) as parent_tasks
        FROM updated
      `

      const result = await client.query(batchLinkQuery)
      const { linked_conversations, parent_tasks } = result.rows[0]
      
      if (linked_conversations > 0) {
        console.log(`\n✅ Linked ${linked_conversations} sub-task conversations to ${parent_tasks} parent tasks`)
      } else {
        console.log('\n⏳ No new sub-tasks to link')
      }
    } else {
      console.log('\n⏳ No parent tasks found in the last hour')
    }
  } catch (error) {
    console.error('❌ Error linking sub-tasks:', error)
  } finally {
    client.release()
  }
}

// Run continuously every 10 seconds
async function runContinuously() {
  console.log('🔄 Starting continuous sub-task linking...')
  console.log('Press Ctrl+C to stop\n')

  while (true) {
    await linkSubtasks()
    await new Promise(resolve => setTimeout(resolve, 10000)) // Wait 10 seconds
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n👋 Shutting down...')
  await pool.end()
  process.exit(0)
})

// Start the continuous linking
runContinuously().catch(console.error)
