#!/usr/bin/env bun
import { Pool } from 'pg'
import { config } from 'dotenv'

config()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function main() {
  try {
    const result = await pool.query(`
      SELECT 
        conversation_id, 
        COUNT(*) as request_count,
        SUM(total_tokens) as total_tokens,
        MIN(timestamp) as first_request,
        MAX(timestamp) as last_request,
        ARRAY_AGG(DISTINCT model) as models_used
      FROM api_requests 
      WHERE conversation_id IS NOT NULL 
      GROUP BY conversation_id 
      ORDER BY MAX(timestamp) DESC 
      LIMIT 10
    `)

    console.log('Recent conversations:')
    console.log('=====================')

    for (const row of result.rows) {
      console.log(`\nConversation ID: ${row.conversation_id}`)
      console.log(`  Requests: ${row.request_count}`)
      console.log(`  Total tokens: ${row.total_tokens || 0}`)
      console.log(`  Models: ${row.models_used.join(', ')}`)
      console.log(
        `  Duration: ${new Date(row.first_request).toLocaleString()} - ${new Date(row.last_request).toLocaleString()}`
      )
    }
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

main()
