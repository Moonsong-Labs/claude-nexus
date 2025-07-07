#!/usr/bin/env bun
/**
 * Manually process pending analyses
 */

import { Pool } from 'pg'
import { config } from 'dotenv'
import { AnalysisWorker } from '../services/proxy/src/workers/ai-analysis/AnalysisWorker.js'

config()

async function processPending() {
  const conversationId = process.argv[2]
  
  // Validate Gemini API key
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY is not set in .env')
    process.exit(1)
  }

  console.log('🤖 Starting manual analysis processing...')
  
  try {
    const worker = new AnalysisWorker()
    
    if (conversationId) {
      console.log(`Processing specific conversation: ${conversationId}`)
      // Process specific conversation by updating its status and running
      const pool = new Pool({ connectionString: process.env.DATABASE_URL })
      
      // Find pending analysis for this conversation
      const result = await pool.query(
        `SELECT id FROM conversation_analyses 
         WHERE conversation_id = $1 AND status = 'pending'
         LIMIT 1`,
        [conversationId]
      )
      
      if (result.rows.length === 0) {
        console.log('No pending analysis found for this conversation')
        await pool.end()
        return
      }
      
      const jobId = result.rows[0].id
      await pool.end()
      
      // Process this specific job
      await worker.processJob({ id: jobId })
    } else {
      console.log('Processing all pending analyses...')
      // Process all pending
      await worker.processPendingJobs()
    }
    
    console.log('✅ Processing complete')
  } catch (error) {
    console.error('❌ Processing failed:', error)
    process.exit(1)
  }
}

processPending().catch(console.error)