#!/usr/bin/env bun
/**
 * Check AI Analysis Worker configuration
 */

import { config } from 'dotenv'

// Load environment variables
config()

console.log('AI Analysis Worker Configuration:')
console.log('================================')
console.log(`AI_WORKER_ENABLED: ${process.env.AI_WORKER_ENABLED}`)
console.log(`GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? 'Set' : 'Not set'}`)
console.log(`GEMINI_MODEL_NAME: ${process.env.GEMINI_MODEL_NAME || 'gemini-2.0-flash-exp (default)'}`)

console.log('\nWorker Configuration:')
console.log(`Poll Interval: ${process.env.AI_WORKER_POLL_INTERVAL_MS || '5000 (default)'}ms`)
console.log(`Max Concurrent Jobs: ${process.env.AI_WORKER_MAX_CONCURRENT_JOBS || '3 (default)'}`)

const isEnabled = process.env.AI_WORKER_ENABLED === 'true'
const hasApiKey = !!process.env.GEMINI_API_KEY

if (isEnabled && !hasApiKey) {
  console.log('\n❌ ERROR: AI_WORKER_ENABLED is true but GEMINI_API_KEY is not set!')
  console.log('The Analysis Worker will NOT start.')
  console.log('\nTo fix this:')
  console.log('1. Add your Gemini API key to .env: GEMINI_API_KEY=your-api-key')
  console.log('2. Or disable the worker: AI_WORKER_ENABLED=false')
} else if (isEnabled && hasApiKey) {
  console.log('\n✅ AI Analysis Worker is properly configured and will start.')
  console.log('\nWhen you run "bun run dev", you should see:')
  console.log('  ✓ AI Analysis Worker started')
} else {
  console.log('\n⚠️  AI Analysis Worker is disabled.')
  console.log('\nTo enable:')
  console.log('1. Set AI_WORKER_ENABLED=true in .env')
  console.log('2. Add GEMINI_API_KEY=your-api-key in .env')
}