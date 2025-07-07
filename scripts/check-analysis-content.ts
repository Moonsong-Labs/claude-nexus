#!/usr/bin/env bun

/**
 * Script to check the content of a specific analysis
 */

import { Pool } from 'pg'
import { config } from 'dotenv'

// Load environment variables
config()

async function main() {
  const conversationId = process.argv[2] || 'daaacac7-759b-439d-90d9-81e8cd519c35'

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    const result = await pool.query(
      `
      SELECT id, conversation_id, branch_id, status, 
             analysis_content, analysis_data, 
             prompt_tokens, completion_tokens,
             completed_at
      FROM conversation_analyses
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
      [conversationId]
    )

    if (result.rows.length === 0) {
      console.log('No analysis found for conversation:', conversationId)
      return
    }

    const analysis = result.rows[0]
    console.log('\n=== Analysis Details ===')
    console.log(`ID: ${analysis.id}`)
    console.log(`Conversation: ${analysis.conversation_id}`)
    console.log(`Branch: ${analysis.branch_id}`)
    console.log(`Status: ${analysis.status}`)
    console.log(`Completed: ${analysis.completed_at}`)
    console.log(
      `Tokens: ${analysis.prompt_tokens} prompt, ${analysis.completion_tokens} completion`
    )

    console.log('\n=== Content Type ===')
    if (analysis.analysis_data) {
      console.log('✅ Has structured data (JSON parsed successfully)')
      const data = JSON.parse(analysis.analysis_data)
      console.log('Keys:', Object.keys(data))
    } else {
      console.log('❌ No structured data (JSON parse failed)')
    }

    if (analysis.analysis_content) {
      console.log('✅ Has text content')
      console.log(`Content length: ${analysis.analysis_content.length} characters`)
      console.log('\nFirst 200 characters:')
      console.log(analysis.analysis_content.substring(0, 200) + '...')
    } else {
      console.log('❌ No text content')
    }
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

main()
