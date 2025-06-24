#!/usr/bin/env bun
/**
 * Link sub-task conversations based on timing
 * If a conversation starts within 30 seconds of a Task invocation, it's likely a sub-task
 */

import { Pool } from 'pg'
import { getErrorMessage } from '@claude-nexus/shared'

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required')
  process.exit(1)
}

async function linkSubtasksByTiming() {
  const pool = new Pool({ connectionString: DATABASE_URL })

  try {
    console.log('🔍 Finding Task invocations and potential sub-tasks...')

    // Find all requests with Task tool invocations
    const taskQuery = `
      SELECT request_id, conversation_id, timestamp, task_tool_invocation
      FROM api_requests
      WHERE task_tool_invocation IS NOT NULL
      ORDER BY timestamp DESC
    `

    const { rows: taskRequests } = await pool.query(taskQuery)
    console.log(`Found ${taskRequests.length} requests with Task invocations`)

    // Use a single query to link all subtasks at once
    console.log('🔄 Performing batch linking operation...')
    
    const batchLinkQuery = `
      WITH task_requests AS (
        SELECT request_id, conversation_id, timestamp
        FROM api_requests
        WHERE task_tool_invocation IS NOT NULL
      ),
      potential_subtasks AS (
        SELECT DISTINCT 
          tr.request_id as parent_request_id,
          ar.conversation_id as subtask_conversation_id,
          MIN(ar.request_id) as first_subtask_request_id
        FROM task_requests tr
        INNER JOIN api_requests ar ON 
          ar.timestamp > tr.timestamp AND
          ar.timestamp < tr.timestamp + interval '30 seconds' AND
          ar.conversation_id != tr.conversation_id AND
          ar.parent_task_request_id IS NULL
        GROUP BY tr.request_id, ar.conversation_id
      ),
      updated AS (
        UPDATE api_requests ar
        SET 
          parent_task_request_id = ps.parent_request_id,
          is_subtask = true
        FROM potential_subtasks ps
        WHERE ar.conversation_id = ps.subtask_conversation_id
        RETURNING ar.request_id, ar.parent_task_request_id, ar.conversation_id
      ),
      linked_conversations AS (
        SELECT 
          parent_task_request_id,
          conversation_id,
          ROW_NUMBER() OVER (PARTITION BY parent_task_request_id ORDER BY MIN(request_id)) as rn
        FROM updated
        GROUP BY parent_task_request_id, conversation_id
      ),
      updated_parents AS (
        UPDATE api_requests ar
        SET task_tool_invocation = jsonb_set(
          COALESCE(ar.task_tool_invocation, '[]'::jsonb),
          '{0,linked_conversation_id}',
          to_jsonb(lc.conversation_id)
        )
        FROM linked_conversations lc
        WHERE ar.request_id = lc.parent_task_request_id
        AND lc.rn = 1
        RETURNING ar.request_id
      )
      SELECT 
        (SELECT COUNT(DISTINCT conversation_id) FROM updated) as linked_conversations,
        (SELECT COUNT(*) FROM updated) as linked_requests,
        (SELECT COUNT(*) FROM updated_parents) as updated_parents
    `

    const { rows } = await pool.query(batchLinkQuery)
    const result = rows[0]
    
    console.log(`\n✨ Batch operation completed:`)
    console.log(`   - Linked ${result.linked_conversations} sub-task conversations`)
    console.log(`   - Updated ${result.linked_requests} requests`)
    console.log(`   - Updated ${result.updated_parents} parent tasks with linked conversation IDs`)
  } catch (error) {
    console.error('Error linking sub-tasks:', getErrorMessage(error))
  } finally {
    await pool.end()
  }
}

// Run the script
linkSubtasksByTiming()
