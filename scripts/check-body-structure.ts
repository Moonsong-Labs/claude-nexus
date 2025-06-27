#!/usr/bin/env bun
import { Pool } from 'pg'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env' })

async function checkBodyStructure() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    console.log('Checking body structure variations...\n')

    // Check for different body structures
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_count,
        COUNT(body) as has_body,
        COUNT(body -> 'messages') as has_messages,
        COUNT(CASE WHEN jsonb_typeof(body -> 'messages') = 'array' THEN 1 END) as messages_is_array,
        COUNT(CASE WHEN body IS NOT NULL AND body -> 'messages' IS NULL THEN 1 END) as body_without_messages,
        COUNT(CASE WHEN request_type = 'query_evaluation' THEN 1 END) as query_eval_count,
        COUNT(CASE WHEN request_type = 'quota' THEN 1 END) as quota_count
      FROM api_requests
      WHERE conversation_id IS NOT NULL
    `)

    const stats = result.rows[0]
    console.log('Statistics:')
    console.log(`- Total requests with conversation_id: ${stats.total_count}`)
    console.log(`- Has body field: ${stats.has_body}`)
    console.log(`- Has body.messages: ${stats.has_messages}`)
    console.log(`- messages is array: ${stats.messages_is_array}`)
    console.log(`- Body without messages: ${stats.body_without_messages}`)
    console.log(`- Query evaluation requests: ${stats.query_eval_count}`)
    console.log(`- Quota requests: ${stats.quota_count}`)

    // Check some examples of bodies without messages
    if (parseInt(stats.body_without_messages) > 0) {
      console.log('\nExamples of bodies without messages:')
      const examples = await pool.query(`
        SELECT request_id, request_type, jsonb_typeof(body) as body_type, body
        FROM api_requests
        WHERE conversation_id IS NOT NULL
          AND body IS NOT NULL 
          AND body -> 'messages' IS NULL
        LIMIT 5
      `)

      for (const row of examples.rows) {
        console.log(`\nRequest ${row.request_id}:`)
        console.log(`- Type: ${row.request_type}`)
        console.log(`- Body type: ${row.body_type}`)
        console.log(`- Body keys: ${Object.keys(row.body || {}).join(', ')}`)
      }
    }
  } catch (error) {
    console.error('Error checking body structure:', error)
  } finally {
    await pool.end()
  }
}

checkBodyStructure()
