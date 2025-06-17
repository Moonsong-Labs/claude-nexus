#!/usr/bin/env node

import { config as dotenvConfig } from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load env first
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenvConfig({ path: join(__dirname, '.env') })

console.log('Environment check:')
console.log('STORAGE_ENABLED:', process.env.STORAGE_ENABLED)
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set')

// Now import after env is loaded
const { container } = await import('./services/proxy/src/container.js')
const pool = container.getDbPool()

console.log('\nContainer check:')
console.log('Pool exists:', !!pool)

if (pool) {
  try {
    const result = await pool.query('SELECT NOW()')
    console.log('Database connected:', result.rows[0].now)
  } catch (error) {
    console.error('Database error:', error.message)
  }
} else {
  console.log('No pool available')
}

process.exit(0)
