#!/usr/bin/env bun
/**
 * Comprehensive analysis of request linking issues
 * Combines system prompt diff, message hash comparison, and hash filtering tests
 */

import { Pool } from 'pg'
import { config } from 'dotenv'
import {
  hashConversationStateWithSystem,
  hashMessage,
} from '../../packages/shared/src/utils/conversation-hash.js'

config()

// Use DEV_DATABASE_URL if available, otherwise fall back to DATABASE_URL
const CONNECTION_STRING = process.env.DEV_DATABASE_URL || process.env.DATABASE_URL || ''

if (!CONNECTION_STRING) {
  console.error('Please set DEV_DATABASE_URL or DATABASE_URL environment variable')
  console.error(
    'Example: DEV_DATABASE_URL="postgresql://user:password@host:port/nexus_query_dev" bun run scripts/db/analyze-request-linking.ts <request_id_1> <request_id_2>'
  )
  process.exit(1)
}

// Get request IDs from command line arguments
const args = process.argv.slice(2)
if (args.length !== 2) {
  console.error('Usage: bun run scripts/db/analyze-request-linking.ts <request_id_1> <request_id_2>')
  console.error('\nExample:')
  console.error('  bun run scripts/db/analyze-request-linking.ts b8dd8bee-76df-436c-be51-c32e92c70987 ee9ec976-5cf7-4795-9ab5-a82210bbd555')
  process.exit(1)
}

const requestIds = args

async function main() {
  const pool = new Pool({ connectionString: CONNECTION_STRING })

  try {
    console.log('==========================================')
    console.log('Request Linking Comprehensive Analysis')
    console.log('==========================================')
    console.log(`Database: ${CONNECTION_STRING.replace(/:[^@]+@/, ':****@')}`)
    console.log(`Request 1: ${requestIds[0]}`)
    console.log(`Request 2: ${requestIds[1]}`)
    console.log()

    // Get both requests
    const query = `
      SELECT 
        request_id,
        body,
        message_count,
        current_message_hash,
        parent_message_hash,
        conversation_id,
        branch_id,
        timestamp
      FROM api_requests
      WHERE request_id = ANY($1::uuid[])
      ORDER BY timestamp ASC
    `

    const result = await pool.query(query, [requestIds])

    if (result.rows.length !== 2) {
      console.error(`Expected 2 requests, found ${result.rows.length}`)
      if (result.rows.length === 0) {
        console.error('No requests found with the provided IDs')
      } else if (result.rows.length === 1) {
        console.error(`Only found request: ${result.rows[0].request_id}`)
      }
      return
    }

    const req1 = result.rows[0]
    const req2 = result.rows[1]

    // Basic request information
    console.log('==========================================')
    console.log('REQUEST INFORMATION')
    console.log('==========================================\n')

    console.log(`Request 1:`)
    console.log(`  ID: ${req1.request_id}`)
    console.log(`  Timestamp: ${req1.timestamp}`)
    console.log(`  Messages: ${req1.message_count}`)
    console.log(`  Conversation: ${req1.conversation_id || 'NULL'}`)
    console.log(`  Branch: ${req1.branch_id || 'NULL'}`)
    console.log(`  Current hash: ${req1.current_message_hash}`)
    console.log(`  Parent hash: ${req1.parent_message_hash || 'NULL'}\n`)

    console.log(`Request 2:`)
    console.log(`  ID: ${req2.request_id}`)
    console.log(`  Timestamp: ${req2.timestamp}`)
    console.log(`  Messages: ${req2.message_count}`)
    console.log(`  Conversation: ${req2.conversation_id || 'NULL'}`)
    console.log(`  Branch: ${req2.branch_id || 'NULL'}`)
    console.log(`  Current hash: ${req2.current_message_hash}`)
    console.log(`  Parent hash: ${req2.parent_message_hash || 'NULL'}\n`)

    console.log(`Time difference: ${Math.round((req2.timestamp - req1.timestamp) / 1000)} seconds`)
    console.log(`Same conversation: ${req1.conversation_id === req2.conversation_id ? 'YES' : 'NO'}`)

    // 1. SYSTEM PROMPT ANALYSIS
    console.log('\n==========================================')
    console.log('1. SYSTEM PROMPT ANALYSIS')
    console.log('==========================================\n')

    const system1 = req1.body.system
    const system2 = req2.body.system

    // Handle both string and array system prompts
    const sys1Str = typeof system1 === 'string' ? system1 : JSON.stringify(system1)
    const sys2Str = typeof system2 === 'string' ? system2 : JSON.stringify(system2)

    console.log(`System 1 type: ${typeof system1}`)
    console.log(`System 2 type: ${typeof system2}`)
    console.log(`System 1 length: ${sys1Str.length}`)
    console.log(`System 2 length: ${sys2Str.length}`)
    console.log(`Length difference: ${Math.abs(sys1Str.length - sys2Str.length)} characters\n`)

    if (sys1Str === sys2Str) {
      console.log('✅ System prompts are IDENTICAL\n')
    } else {
      console.log('❌ System prompts are DIFFERENT\n')

      // Find where they differ
      for (let i = 0; i < Math.min(sys1Str.length, sys2Str.length); i++) {
        if (sys1Str[i] !== sys2Str[i]) {
          console.log(`First difference at position ${i}:`)
          const start = Math.max(0, i - 100)
          const end = Math.min(i + 100, Math.min(sys1Str.length, sys2Str.length))

          console.log('\nContext from System 1:')
          console.log(`"...${sys1Str.substring(start, end).replace(/\n/g, '\\n')}..."`)
          console.log('\nContext from System 2:')
          console.log(`"...${sys2Str.substring(start, end).replace(/\n/g, '\\n')}..."`)

          // Check for common differences
          const section1 = sys1Str.substring(i - 50, i + 200)
          const section2 = sys2Str.substring(i - 50, i + 200)

          if (section1.includes('gitStatus') || section2.includes('gitStatus')) {
            console.log('\n🔍 Difference appears to be in git status section')
          }
          if (section1.includes('Current branch') || section2.includes('Current branch')) {
            console.log('🔍 Difference appears to be in git branch information')
          }
          if (section1.includes('Recent commits') || section2.includes('Recent commits')) {
            console.log('🔍 Difference appears to be in git commits section')
          }
          if (section1.includes("Today's date") || section2.includes("Today's date")) {
            console.log('🔍 Difference appears to be in date/time information')
          }
          break
        }
      }
    }

    // 2. MESSAGE HASH COMPARISON
    console.log('\n==========================================')
    console.log('2. MESSAGE HASH COMPARISON')
    console.log('==========================================\n')

    const messages1 = req1.body.messages
    const messages2 = req2.body.messages

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
          `Message ${msgNum.toString().padStart(3)}: ${hash1.substring(0, 16)}... vs ${hash2.substring(0, 16)}... ${match ? '✅ MATCH' : '❌ DIFFER'}`
        )

        if (match) {
          lastMatchingHash = hash1
          lastMatchingIndex = i
        } else if (lastMatchingIndex === i - 1) {
          // This is the first message that differs
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
          `Message ${msgNum.toString().padStart(3)}: ${hash1.substring(0, 16)}... vs (no message)`
        )
      } else if (!hash1 && hash2) {
        console.log(
          `Message ${msgNum.toString().padStart(3)}: (no message)     vs ${hash2.substring(0, 16)}...`
        )
      }
    }

    // 3. HASH FILTERING ANALYSIS
    console.log('\n==========================================')
    console.log('3. HASH FILTERING ANALYSIS')
    console.log('==========================================\n')

    // Analyze first message for system-reminder content
    const msg1 = messages1[0]
    const msg2 = messages2[0]

    console.log('First message content analysis:\n')

    // Helper function to filter content
    const filterContent = (content: any[]) => {
      return content.filter(item => {
        if (item.type === 'text' && typeof item.text === 'string') {
          return !item.text.trim().startsWith('<system-reminder>')
        }
        return true
      })
    }

    // Show content structure for request 1
    console.log('Request 1 - First message:')
    if (Array.isArray(msg1.content)) {
      msg1.content.forEach((item: any, idx: number) => {
        if (item.type === 'text' && item.text) {
          const hasSystemReminder = item.text.trim().startsWith('<system-reminder>')
          console.log(
            `  [${idx}] type: text, starts with <system-reminder>: ${hasSystemReminder ? 'YES (filtered out)' : 'NO'}`
          )
          if (hasSystemReminder) {
            console.log(
              `       Preview: "${item.text.substring(0, 80).replace(/\n/g, ' ')}..."`
            )
          }
        } else {
          console.log(`  [${idx}] type: ${item.type}`)
        }
      })
    }

    console.log('\nRequest 2 - First message:')
    if (Array.isArray(msg2.content)) {
      msg2.content.forEach((item: any, idx: number) => {
        if (item.type === 'text' && item.text) {
          const hasSystemReminder = item.text.trim().startsWith('<system-reminder>')
          console.log(
            `  [${idx}] type: text, starts with <system-reminder>: ${hasSystemReminder ? 'YES (filtered out)' : 'NO'}`
          )
          if (hasSystemReminder) {
            console.log(
              `       Preview: "${item.text.substring(0, 80).replace(/\n/g, ' ')}..."`
            )
          }
        } else {
          console.log(`  [${idx}] type: ${item.type}`)
        }
      })
    }

    // Test filtering
    const filtered1 = filterContent(msg1.content)
    const filtered2 = filterContent(msg2.content)

    console.log(`\nFiltering results:`)
    console.log(`Request 1: ${msg1.content.length} items -> ${filtered1.length} after filtering`)
    console.log(`Request 2: ${msg2.content.length} items -> ${filtered2.length} after filtering`)

    // Compare filtered content
    const filteredStr1 = JSON.stringify(filtered1)
    const filteredStr2 = JSON.stringify(filtered2)
    console.log(`\nFiltered content identical: ${filteredStr1 === filteredStr2 ? 'YES' : 'NO'}`)

    if (filteredStr1 !== filteredStr2) {
      // Find where they differ
      for (let i = 0; i < Math.min(filtered1.length, filtered2.length); i++) {
        if (JSON.stringify(filtered1[i]) !== JSON.stringify(filtered2[i])) {
          console.log(`\nFirst difference at filtered item ${i}:`)
          console.log('Item 1:', JSON.stringify(filtered1[i]).substring(0, 150) + '...')
          console.log('Item 2:', JSON.stringify(filtered2[i]).substring(0, 150) + '...')
          break
        }
      }
    }

    // Test hash computation
    console.log('\n\nHash computation tests:')
    const hash1_msg1 = hashMessage(msg1)
    const hash2_msg1 = hashMessage(msg2)
    console.log(`First message hash only:`)
    console.log(`  Request 1: ${hash1_msg1}`)
    console.log(`  Request 2: ${hash2_msg1}`)
    console.log(`  Match: ${hash1_msg1 === hash2_msg1 ? 'YES' : 'NO'}`)

    // 4. COMPREHENSIVE SUMMARY
    console.log('\n==========================================')
    console.log('COMPREHENSIVE SUMMARY')
    console.log('==========================================\n')

    console.log('Request Linking Analysis Results:\n')

    // Conversation status
    if (req1.conversation_id === req2.conversation_id) {
      console.log('✅ Requests ARE linked in the same conversation')
      console.log(`   Conversation ID: ${req1.conversation_id}`)
      console.log(`   Branch: ${req1.branch_id || 'main'} -> ${req2.branch_id || 'main'}`)
    } else {
      console.log('❌ Requests are NOT linked in the same conversation')
      console.log(`   Request 1 conversation: ${req1.conversation_id || 'NULL'}`)
      console.log(`   Request 2 conversation: ${req2.conversation_id || 'NULL'}`)
    }

    console.log('\nHash Analysis:')
    if (lastMatchingIndex >= 0) {
      console.log(`✅ Messages 1-${lastMatchingIndex + 1} have matching hashes`)
      console.log(`❌ Messages start to differ at message ${lastMatchingIndex + 2}`)
      console.log(`\nLast matching hash: ${lastMatchingHash?.substring(0, 32)}...`)

      // Check if this matches the parent hash
      const expectedMessages = req1.message_count - 1
      if (lastMatchingIndex === expectedMessages) {
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

    console.log('\nRoot Causes:')
    const causes = []
    
    if (sys1Str !== sys2Str) {
      causes.push('1. System prompts are different (possibly git status, timestamps, etc.)')
    }
    
    if (filteredStr1 !== filteredStr2) {
      causes.push('2. Message content differs even after filtering system-reminders')
    }
    
    if (lastMatchingHash && req2.parent_message_hash && lastMatchingHash !== req2.parent_message_hash) {
      causes.push('3. Parent hash mismatch - database hash doesn\'t match computed hash')
    }
    
    if (causes.length === 0) {
      causes.push('No obvious issues found - requests should be linking correctly')
    }
    
    causes.forEach(cause => console.log(`   ${cause}`))

    console.log('\nRecommendations:')
    if (lastMatchingHash && req2.parent_message_hash && lastMatchingHash !== req2.parent_message_hash) {
      console.log('   • Run rebuild-conversations.ts to recalculate conversation hashes')
    }
    if (sys1Str !== sys2Str) {
      console.log('   • System prompt differences are expected between sessions')
    }
    if (filteredStr1 !== filteredStr2) {
      console.log('   • Check if requests are from different conversation branches')
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

main()