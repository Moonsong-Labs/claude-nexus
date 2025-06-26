#!/usr/bin/env bun
import { Pool } from 'pg'

/**
 * Test script to verify the optimized conversation query performance
 */
async function testConversationQuery() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })

  try {
    console.log('Testing optimized conversation query...\n')

    // First, let's check if the indexes exist
    console.log('Checking indexes...')
    const indexResult = await pool.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'api_requests' 
      AND indexname IN (
        'idx_requests_conversation_timestamp_id',
        'idx_requests_conversation_subtask',
        'idx_requests_request_id'
      )
      ORDER BY indexname
    `)

    if (indexResult.rows.length === 0) {
      console.warn('⚠️  Performance indexes not found. Run migration 004-optimize-conversation-window-functions.ts first.')
    } else {
      console.log('✅ Found performance indexes:')
      indexResult.rows.forEach(row => {
        console.log(`   - ${row.indexname}`)
      })
    }

    // Run EXPLAIN ANALYZE on the optimized query
    console.log('\nRunning EXPLAIN ANALYZE on optimized query...')
    const explainResult = await pool.query(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      WITH ranked_requests AS (
        -- Get all requests with ranking for latest request and first subtask per conversation
        SELECT 
          request_id,
          conversation_id,
          domain,
          account_id,
          timestamp,
          input_tokens,
          output_tokens,
          branch_id,
          model,
          is_subtask,
          parent_task_request_id,
          ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY timestamp DESC, request_id DESC) as rn,
          ROW_NUMBER() OVER (PARTITION BY conversation_id, is_subtask ORDER BY timestamp ASC, request_id ASC) as subtask_rn
        FROM api_requests
        WHERE conversation_id IS NOT NULL
      ),
      conversation_summary AS (
        -- Aggregate conversation data including latest request info
        SELECT 
          conversation_id,
          domain,
          account_id,
          MIN(timestamp) as first_message_time,
          MAX(timestamp) as last_message_time,
          COUNT(*) as message_count,
          SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) as total_tokens,
          COUNT(DISTINCT branch_id) as branch_count,
          ARRAY_AGG(DISTINCT model) FILTER (WHERE model IS NOT NULL) as models_used,
          MAX(CASE WHEN rn = 1 THEN request_id END) as latest_request_id,
          BOOL_OR(is_subtask) as is_subtask,
          -- Get the parent_task_request_id from the first subtask in the conversation
          MAX(CASE WHEN is_subtask = true AND subtask_rn = 1 THEN parent_task_request_id END) as parent_task_request_id,
          COUNT(CASE WHEN is_subtask THEN 1 END) as subtask_message_count
        FROM ranked_requests
        GROUP BY conversation_id, domain, account_id
      )
      SELECT 
        cs.*,
        parent_req.conversation_id as parent_conversation_id
      FROM conversation_summary cs
      LEFT JOIN api_requests parent_req ON cs.parent_task_request_id = parent_req.request_id
      ORDER BY last_message_time DESC
      LIMIT 50
    `)

    const plan = explainResult.rows[0]['QUERY PLAN'][0]
    console.log('\nQuery execution statistics:')
    console.log(`  - Total execution time: ${plan['Execution Time']}ms`)
    console.log(`  - Planning time: ${plan['Planning Time']}ms`)
    
    // Extract key metrics
    const totalTime = plan['Execution Time'] + plan['Planning Time']
    
    // Performance threshold
    const PERFORMANCE_THRESHOLD_MS = 1000
    
    if (totalTime < PERFORMANCE_THRESHOLD_MS) {
      console.log(`\n✅ Query performance is GOOD (${totalTime.toFixed(2)}ms < ${PERFORMANCE_THRESHOLD_MS}ms threshold)`)
    } else {
      console.log(`\n⚠️  Query performance needs attention (${totalTime.toFixed(2)}ms > ${PERFORMANCE_THRESHOLD_MS}ms threshold)`)
    }

    // Test the actual query execution
    console.log('\nExecuting actual query...')
    const startTime = Date.now()
    
    const result = await pool.query(`
      WITH ranked_requests AS (
        SELECT 
          request_id,
          conversation_id,
          domain,
          account_id,
          timestamp,
          input_tokens,
          output_tokens,
          branch_id,
          model,
          is_subtask,
          parent_task_request_id,
          ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY timestamp DESC, request_id DESC) as rn,
          ROW_NUMBER() OVER (PARTITION BY conversation_id, is_subtask ORDER BY timestamp ASC, request_id ASC) as subtask_rn
        FROM api_requests
        WHERE conversation_id IS NOT NULL
      ),
      conversation_summary AS (
        SELECT 
          conversation_id,
          domain,
          account_id,
          MIN(timestamp) as first_message_time,
          MAX(timestamp) as last_message_time,
          COUNT(*) as message_count,
          SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) as total_tokens,
          COUNT(DISTINCT branch_id) as branch_count,
          ARRAY_AGG(DISTINCT model) FILTER (WHERE model IS NOT NULL) as models_used,
          MAX(CASE WHEN rn = 1 THEN request_id END) as latest_request_id,
          BOOL_OR(is_subtask) as is_subtask,
          MAX(CASE WHEN is_subtask = true AND subtask_rn = 1 THEN parent_task_request_id END) as parent_task_request_id,
          COUNT(CASE WHEN is_subtask THEN 1 END) as subtask_message_count
        FROM ranked_requests
        GROUP BY conversation_id, domain, account_id
      )
      SELECT 
        cs.*,
        parent_req.conversation_id as parent_conversation_id
      FROM conversation_summary cs
      LEFT JOIN api_requests parent_req ON cs.parent_task_request_id = parent_req.request_id
      ORDER BY last_message_time DESC
      LIMIT 50
    `)
    
    const executionTime = Date.now() - startTime
    
    console.log(`\nQuery returned ${result.rows.length} conversations in ${executionTime}ms`)
    
    // Show sample results
    if (result.rows.length > 0) {
      console.log('\nSample conversation data:')
      const sample = result.rows[0]
      console.log(`  - Conversation ID: ${sample.conversation_id}`)
      console.log(`  - Domain: ${sample.domain}`)
      console.log(`  - Messages: ${sample.message_count}`)
      console.log(`  - Total tokens: ${sample.total_tokens}`)
      console.log(`  - Branches: ${sample.branch_count}`)
      console.log(`  - Is subtask: ${sample.is_subtask}`)
      console.log(`  - Subtask messages: ${sample.subtask_message_count}`)
    }

    // Verify data integrity
    console.log('\nVerifying data integrity...')
    
    // Check for conversations with multiple different parent_task_request_ids
    const integrityCheck = await pool.query(`
      SELECT 
        conversation_id,
        COUNT(DISTINCT parent_task_request_id) as parent_count
      FROM api_requests
      WHERE is_subtask = true
        AND parent_task_request_id IS NOT NULL
      GROUP BY conversation_id
      HAVING COUNT(DISTINCT parent_task_request_id) > 1
    `)
    
    if (integrityCheck.rows.length > 0) {
      console.log(`\n⚠️  Found ${integrityCheck.rows.length} conversations with multiple parent_task_request_ids`)
      console.log('   This is expected if conversations can have subtasks from different parents.')
    } else {
      console.log('✅ All subtask conversations have consistent parent_task_request_ids')
    }

    console.log('\n✅ Query optimization test completed successfully!')

  } catch (error) {
    console.error('Test failed:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Run test
testConversationQuery().catch(console.error)