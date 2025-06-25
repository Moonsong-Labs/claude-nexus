#!/usr/bin/env bun
/**
 * Generate and compare message hashes step by step for debugging
 */

import { Pool } from 'pg'
import { config } from 'dotenv'
import { hashConversationStateWithSystem } from '../../packages/shared/src/utils/conversation-hash'

config()

// Use the development database - you need to provide the correct connection string
const DEV_CONNECTION_STRING = process.env.DEV_DATABASE_URL || process.env.DATABASE_URL || ''

if (!DEV_CONNECTION_STRING) {
  console.error('Please set DEV_DATABASE_URL or DATABASE_URL environment variable')
  console.error(
    'Example: DEV_DATABASE_URL="postgresql://user:password@host:port/nexus_query_dev" bun run scripts/db/compare-message-hashes.ts'
  )
  process.exit(1)
}

async function main() {
  const pool = new Pool({ connectionString: DEV_CONNECTION_STRING })

  const requestIds = [
    'b5068a6b-ccfb-465b-a524-6dfb7f5233fb', // First request (127 messages)
    'd83ea021-04f2-4ab1-9344-68a454e5a0f2', // Second request (129 messages)
  ]

  try {
    console.log('Comparing message hashes step by step...\n')
    console.log('Database:', DEV_CONNECTION_STRING)
    console.log('=====================================\n')

    // Get both requests
    const query = `
      SELECT 
        request_id,
        body,
        message_count,
        current_message_hash,
        parent_message_hash
      FROM api_requests
      WHERE request_id = ANY($1::uuid[])
      ORDER BY timestamp ASC
    `

    const result = await pool.query(query, [requestIds])

    if (result.rows.length !== 2) {
      console.error(`Expected 2 requests, found ${result.rows.length}`)
      return
    }

    const req1 = result.rows[0]
    const req2 = result.rows[1]

    console.log(`Request 1: ${req1.request_id}`)
    console.log(`  Messages: ${req1.message_count}`)
    console.log(`  Stored current hash: ${req1.current_message_hash}`)
    console.log(`  Stored parent hash: ${req1.parent_message_hash || 'NULL'}\n`)

    console.log(`Request 2: ${req2.request_id}`)
    console.log(`  Messages: ${req2.message_count}`)
    console.log(`  Stored current hash: ${req2.current_message_hash}`)
    console.log(`  Stored parent hash: ${req2.parent_message_hash || 'NULL'}\n`)

    console.log('=====================================')
    console.log('Message-by-message hash comparison:')
    console.log('=====================================\n')

    const messages1 = req1.body.messages
    const messages2 = req2.body.messages
    const system1 = req1.body.system
    const system2 = req2.body.system

    // First, check if systems are identical
    const systemsIdentical = JSON.stringify(system1) === JSON.stringify(system2)
    console.log(`System prompts identical: ${systemsIdentical ? 'YES' : 'NO'}\n`)

    // Compare message by message
    const maxMessages = Math.max(messages1.length, messages2.length)
    let lastMatchingHash = null
    let lastMatchingIndex = -1

    for (let i = 0; i < maxMessages; i++) {
      const msgNum = i + 1

      // Calculate cumulative hash up to this message
      const msgs1UpToHere = messages1.slice(0, i + 1)
      const msgs2UpToHere = messages2.slice(0, i + 1)

      let hash1 = null
      let hash2 = null

      if (i < messages1.length) {
        hash1 = hashConversationStateWithSystem(msgs1UpToHere, system1)
      }

      if (i < messages2.length) {
        hash2 = hashConversationStateWithSystem(msgs2UpToHere, system2)
      }

      // Print the comparison
      if (hash1 && hash2) {
        const match = hash1 === hash2
        console.log(
          `Message ${msgNum.toString().padStart(3)}: Req ${req1.request_id.substring(0, 8)}: ${hash1.substring(0, 16)}..., Req ${req2.request_id.substring(0, 8)}: ${hash2.substring(0, 16)}... ${match ? '✅ MATCH' : '❌ DIFFER'}`
        )

        if (match) {
          lastMatchingHash = hash1
          lastMatchingIndex = i
        } else if (lastMatchingIndex === i - 1) {
          process.exit(1)
          // This is the first message that differs, let's show more detail
          console.log('\n🔍 First difference detected at message', msgNum)
          console.log('   Last matching hash was at message', lastMatchingIndex + 1)

          // Check message content
          const msg1 = messages1[i]
          const msg2 = messages2[i]

          if (msg1 && msg2) {
            console.log(`\n   Message ${msgNum} details:`)
            console.log(`   Req1 - Role: ${msg1.role}`)
            console.log(`   Req2 - Role: ${msg2.role}`)

            if (msg1.role === msg2.role) {
              const content1 = JSON.stringify(msg1.content)
              const content2 = JSON.stringify(msg2.content)
              console.log(`   Req1 - Content length: ${content1.length}`)
              console.log(`   Req2 - Content length: ${content2.length}`)

              if (content1 === content2) {
                console.log(
                  '   Content is IDENTICAL - difference must be in cumulative state or system prompt'
                )
              } else {
                console.log('   Content is DIFFERENT')
              }
            }
          }
          console.log()
        }
      } else if (hash1 && !hash2) {
        console.log(
          `Message ${msgNum.toString().padStart(3)}: Req ${req1.request_id.substring(0, 8)}: ${hash1.substring(0, 16)}..., Req ${req2.request_id.substring(0, 8)}: (no message)`
        )
      } else if (!hash1 && hash2) {
        console.log(
          `Message ${msgNum.toString().padStart(3)}: Req ${req1.request_id.substring(0, 8)}: (no message),     Req ${req2.request_id.substring(0, 8)}: ${hash2.substring(0, 16)}...`
        )
      }
    }

    console.log('\n=====================================')
    console.log('Summary:')
    console.log('=====================================\n')

    if (lastMatchingIndex >= 0) {
      console.log(`✅ Messages 1-${lastMatchingIndex + 1} have matching hashes`)
      console.log(`❌ Messages start to differ at message ${lastMatchingIndex + 2}`)
      console.log(`\nLast matching hash: ${lastMatchingHash?.substring(0, 32)}...`)

      // Check if this matches what we expect for linking
      if (lastMatchingIndex === 126) {
        // Message 127 (0-indexed)
        console.log('\n🎯 This is exactly where we expect them to match for conversation linking!')
        console.log(`   Request 2 parent hash should be: ${lastMatchingHash}`)
        console.log(`   Request 2 actual parent hash is: ${req2.parent_message_hash}`)
        console.log(
          `   Match: ${lastMatchingHash === req2.parent_message_hash ? 'YES ✅' : 'NO ❌'}`
        )

        if (lastMatchingHash !== req2.parent_message_hash) {
          console.log('\n⚠️  The parent hash in the database does not match the computed hash!')
          console.log('   This explains why the requests are not linking.')
          console.log('   Running rebuild-conversations.ts should fix this.')
        }
      }
    } else {
      console.log(
        '❌ No matching messages found - these appear to be completely different conversations'
      )
    }
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

main()
