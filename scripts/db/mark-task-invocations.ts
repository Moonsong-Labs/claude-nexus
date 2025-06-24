#!/usr/bin/env bun
/**
 * Simple script to mark all requests that have Task tool invocations
 */

import { Pool } from 'pg'
import { getErrorMessage } from '@claude-nexus/shared'

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required')
  process.exit(1)
}

async function markTaskInvocations() {
  const pool = new Pool({ connectionString: DATABASE_URL })

  try {
    console.log('🔍 Finding and marking Task tool invocations...')

    // Update all requests that have Task tool invocations in their response
    const updateQuery = `
      UPDATE api_requests
      SET task_tool_invocation = (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', tool.value->>'id',
            'name', tool.value->>'name',
            'prompt', tool.value->'input'->>'prompt',
            'description', tool.value->'input'->>'description'
          )
        )
        FROM jsonb_array_elements(response_body->'content') AS tool
        WHERE tool.value->>'type' = 'tool_use' 
        AND tool.value->>'name' = 'Task'
      )
      WHERE response_body IS NOT NULL
      AND response_body->'content' IS NOT NULL
      AND EXISTS (
        SELECT 1 
        FROM jsonb_array_elements(response_body->'content') AS tool
        WHERE tool.value->>'type' = 'tool_use' 
        AND tool.value->>'name' = 'Task'
      )
      AND task_tool_invocation IS NULL
      RETURNING request_id, conversation_id
    `

    const { rows: markedRequests } = await pool.query(updateQuery)
    console.log(`✅ Marked ${markedRequests.length} requests with Task invocations`)

    // Mark conversations as sub-tasks based on simple criteria:
    // If a conversation starts after a Task invocation, it's likely a sub-task
    console.log('\n🔗 Performing batch sub-task linking...')

    // Use a single query to link all subtasks at once
    const batchLinkQuery = `
      WITH marked_tasks AS (
        SELECT request_id, conversation_id, timestamp
        FROM api_requests
        WHERE task_tool_invocation IS NOT NULL
      ),
      potential_subtasks AS (
        SELECT DISTINCT 
          mt.request_id as parent_request_id,
          ar.conversation_id as subtask_conversation_id,
          MIN(ar.request_id) as first_subtask_request_id
        FROM marked_tasks mt
        INNER JOIN api_requests ar ON 
          ar.timestamp > mt.timestamp AND
          ar.timestamp < mt.timestamp + interval '30 seconds' AND
          ar.conversation_id != mt.conversation_id AND
          ar.parent_task_request_id IS NULL
        GROUP BY mt.request_id, ar.conversation_id
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

    console.log('\n✨ Processing complete!')
  } catch (error) {
    console.error('Error processing tasks:', getErrorMessage(error))
  } finally {
    await pool.end()
  }
}

// Run the script
markTaskInvocations()
