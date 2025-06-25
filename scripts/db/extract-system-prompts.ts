#!/usr/bin/env bun
/**
 * Extract and compare system prompts from the two requests
 */

import { Pool } from 'pg'
import { config } from 'dotenv'
import { writeFileSync } from 'fs'

config()

const CONNECTION_STRING = process.env.DATABASE_URL || ''

if (!CONNECTION_STRING) {
  console.error('Please set DATABASE_URL environment variable')
  process.exit(1)
}

async function main() {
  const pool = new Pool({ connectionString: CONNECTION_STRING })

  const requestIds = [
    'b5068a6b-ccfb-465b-a524-6dfb7f5233fb', // First request
    'd83ea021-04f2-4ab1-9344-68a454e5a0f2', // Second request
  ]

  try {
    const query = `
      SELECT 
        request_id,
        body
      FROM api_requests
      WHERE request_id = ANY($1::uuid[])
      ORDER BY timestamp ASC
    `

    const result = await pool.query(query, [requestIds])

    const req1 = result.rows[0]
    const req2 = result.rows[1]

    const system1 = req1.body.system
    const system2 = req2.body.system

    console.log('Extracting system prompts...\n')

    // Write raw system prompts to files
    if (typeof system1 === 'string') {
      writeFileSync('system1.txt', system1)
      console.log('Wrote system1.txt')
      console.log(`First 100 chars: "${system1.substring(0, 100)}..."`)
      console.log(
        `Starts with CLI tool prefix: ${system1.trim().startsWith('You are an interactive CLI tool')}`
      )
    } else {
      writeFileSync('system1.json', JSON.stringify(system1, null, 2))
      console.log('Wrote system1.json (array format)')
    }

    console.log()

    if (typeof system2 === 'string') {
      writeFileSync('system2.txt', system2)
      console.log('Wrote system2.txt')
      console.log(`First 100 chars: "${system2.substring(0, 100)}..."`)
      console.log(
        `Starts with CLI tool prefix: ${system2.trim().startsWith('You are an interactive CLI tool')}`
      )
    } else {
      writeFileSync('system2.json', JSON.stringify(system2, null, 2))
      console.log('Wrote system2.json (array format)')
    }

    console.log('\nComparing system prompts:')
    const identical = JSON.stringify(system1) === JSON.stringify(system2)
    console.log(`Identical: ${identical ? 'YES' : 'NO'}`)

    if (!identical && typeof system1 === 'string' && typeof system2 === 'string') {
      // Find first difference
      for (let i = 0; i < Math.min(system1.length, system2.length); i++) {
        if (system1[i] !== system2[i]) {
          console.log(`\nFirst difference at character ${i}:`)
          console.log(`Context: "${system1.substring(i - 20, i + 20)}"`)
          console.log(`         vs`)
          console.log(`         "${system2.substring(i - 20, i + 20)}"`)
          break
        }
      }
    }
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

main()
