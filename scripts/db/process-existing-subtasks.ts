#!/usr/bin/env bun
/**
 * Script to retroactively process existing Task tool invocations
 * and link sub-task conversations
 */

import { Pool } from 'pg'
import { getErrorMessage } from '@claude-nexus/shared'

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required')
  process.exit(1)
}

async function processExistingSubtasks() {
  const pool = new Pool({ connectionString: DATABASE_URL })

  try {
    console.log('🔍 Finding requests with Task tool invocations...')

    // Find all requests that have Task tool invocations in their response body
    const findTasksQuery = `
      SELECT request_id, response_body, conversation_id
      FROM api_requests
      WHERE response_body IS NOT NULL
        AND response_body->'content' IS NOT NULL
        AND task_tool_invocation IS NULL
    `

    const { rows: requests } = await pool.query(findTasksQuery)
    console.log(`Found ${requests.length} requests to process`)

    let processedCount = 0
    let linkedCount = 0

    // Process all requests in batches
    console.log('🔄 Processing Task invocations in batch...')
    
    // First, extract and store all task invocations
    const taskInvocationUpdates: Array<{ request_id: string; task_invocations: any }> = []
    const taskPromptMappings: Array<{ request_id: string; prompt: string; task_index: number }> = []
    
    for (const request of requests) {
      const { request_id, response_body } = request
      const content = response_body.content
      if (!Array.isArray(content)) continue

      const taskInvocations = content.filter(
        (item: any) => item.type === 'tool_use' && item.name === 'Task'
      )

      if (taskInvocations.length === 0) continue

      const taskDetails = taskInvocations.map((task: any, index: number) => {
        const detail = {
          id: task.id,
          name: task.name || 'Task',
          prompt: task.input?.prompt || '',
          description: task.input?.description || '',
        }
        
        // Track prompts for linking
        if (detail.prompt) {
          taskPromptMappings.push({
            request_id,
            prompt: detail.prompt.trim(),
            task_index: index
          })
        }
        
        return detail
      })

      taskInvocationUpdates.push({ request_id, task_invocations: taskDetails })
      processedCount++
    }

    // Batch update all task invocations
    if (taskInvocationUpdates.length > 0) {
      const updateTasksQuery = `
        UPDATE api_requests AS ar
        SET task_tool_invocation = updates.task_invocations::jsonb
        FROM (
          SELECT 
            unnest($1::text[]) as request_id,
            unnest($2::text[]) as task_invocations
        ) AS updates
        WHERE ar.request_id = updates.request_id::uuid
      `
      
      await pool.query(updateTasksQuery, [
        taskInvocationUpdates.map(u => u.request_id),
        taskInvocationUpdates.map(u => JSON.stringify(u.task_invocations))
      ])
      
      console.log(`✅ Updated ${taskInvocationUpdates.length} requests with Task invocations`)
    }

    // Now perform batch linking based on prompts AND timing
    if (taskPromptMappings.length > 0) {
      console.log('🔗 Performing batch subtask linking...')
      
      const batchLinkQuery = `
        WITH task_prompts AS (
          SELECT 
            unnest($1::text[]) as request_id,
            unnest($2::text[]) as prompt,
            unnest($3::int[]) as task_index
        ),
        parent_tasks AS (
          SELECT 
            tp.request_id,
            tp.prompt,
            tp.task_index,
            ar.timestamp,
            ar.conversation_id as parent_conversation_id
          FROM task_prompts tp
          JOIN api_requests ar ON ar.request_id = tp.request_id::uuid
        ),
        first_messages AS (
          SELECT DISTINCT ON (conversation_id)
            conversation_id,
            timestamp,
            body->'messages'->0->>'content' as string_content,
            body->'messages'->0->'content'->0->>'text' as array_content_0,
            body->'messages'->0->'content'->1->>'text' as array_content_1
          FROM api_requests
          ORDER BY conversation_id, timestamp
        ),
        matched_subtasks AS (
          SELECT DISTINCT
            pt.request_id as parent_request_id,
            pt.prompt,
            pt.task_index,
            fm.conversation_id as subtask_conversation_id
          FROM parent_tasks pt
          JOIN first_messages fm ON (
            fm.timestamp > pt.timestamp AND
            fm.timestamp < pt.timestamp + interval '30 seconds' AND
            fm.conversation_id != pt.parent_conversation_id AND
            (
              fm.string_content = pt.prompt OR
              fm.array_content_0 = pt.prompt OR
              fm.array_content_1 = pt.prompt
            )
          )
        ),
        updated AS (
          UPDATE api_requests ar
          SET 
            parent_task_request_id = ms.parent_request_id::uuid,
            is_subtask = true
          FROM matched_subtasks ms
          WHERE ar.conversation_id = ms.subtask_conversation_id
          AND ar.parent_task_request_id IS NULL
          RETURNING ar.conversation_id, ms.parent_request_id, ms.task_index
        )
        SELECT 
          parent_request_id,
          task_index,
          conversation_id
        FROM updated
      `
      
      const { rows: linkedResults } = await pool.query(batchLinkQuery, [
        taskPromptMappings.map(m => m.request_id),
        taskPromptMappings.map(m => m.prompt),
        taskPromptMappings.map(m => m.task_index)
      ])
      
      linkedCount = linkedResults.length
      
      // Update task invocations with linked conversation IDs
      if (linkedResults.length > 0) {
        // Group by parent request
        const linksByParent = linkedResults.reduce((acc: any, link: any) => {
          if (!acc[link.parent_request_id]) {
            acc[link.parent_request_id] = []
          }
          acc[link.parent_request_id].push({
            task_index: link.task_index,
            conversation_id: link.conversation_id
          })
          return acc
        }, {})
        
        // Update each parent's task invocations
        for (const [parentId, links] of Object.entries(linksByParent)) {
          const updateLinkedQuery = `
            UPDATE api_requests
            SET task_tool_invocation = (
              SELECT jsonb_agg(
                CASE 
                  WHEN elem_index - 1 = ANY($2::int[])
                  THEN jsonb_set(elem, '{linked_conversation_id}', to_jsonb(
                    $3::text[][$2::int[]::int[] ? (elem_index - 1)]
                  ))
                  ELSE elem
                END
              )
              FROM jsonb_array_elements(task_tool_invocation) WITH ORDINALITY AS t(elem, elem_index)
            )
            WHERE request_id = $1
          `
          
          const taskIndices = (links as any[]).map(l => l.task_index)
          const conversationIds = (links as any[]).map(l => l.conversation_id)
          
          await pool.query(updateLinkedQuery, [parentId, taskIndices, conversationIds])
        }
      }
      
      console.log(`✅ Linked ${linkedCount} sub-task conversations based on prompt matching`)
    }

    console.log('\n✨ Processing complete!')
    console.log(`   - Processed ${processedCount} requests with Task invocations`)
    console.log(`   - Linked ${linkedCount} sub-task conversations`)
  } catch (error) {
    console.error('Error processing sub-tasks:', getErrorMessage(error))
  } finally {
    await pool.end()
  }
}

// Run the script
processExistingSubtasks()
