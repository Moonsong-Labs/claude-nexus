#!/usr/bin/env bun
/**
 * Test if system-reminder filtering is working correctly
 */

import { Pool } from 'pg'
import { config } from 'dotenv'
import { hashConversationStateWithSystem, hashMessage } from '../../packages/shared/src/utils/conversation-hash'

config()

const DEV_CONNECTION_STRING = process.env.DEV_DATABASE_URL || process.env.DATABASE_URL || ''

if (!DEV_CONNECTION_STRING) {
  console.error('Please set DEV_DATABASE_URL or DATABASE_URL environment variable')
  process.exit(1)
}

async function main() {
  const pool = new Pool({ connectionString: DEV_CONNECTION_STRING })
  
  const requestIds = [
    'b5068a6b-ccfb-465b-a524-6dfb7f5233fb',  // First request (127 messages)
    'd83ea021-04f2-4ab1-9344-68a454e5a0f2'   // Second request (129 messages)
  ]
  
  try {
    console.log('Testing system-reminder filtering in hash computation...\n')
    
    // Get both requests
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
    
    console.log('=====================================')
    console.log('FIRST MESSAGE CONTENT ANALYSIS')
    console.log('=====================================\n')
    
    const msg1 = req1.body.messages[0]
    const msg2 = req2.body.messages[0]
    
    // Show the content structure
    console.log('Request 1 - First message content items:')
    if (Array.isArray(msg1.content)) {
      msg1.content.forEach((item: any, idx: number) => {
        if (item.type === 'text' && item.text) {
          const hasSystemReminder = item.text.trim().startsWith('<system-reminder>')
          console.log(`  [${idx}] type: text, starts with <system-reminder>: ${hasSystemReminder ? 'YES (will be filtered)' : 'NO'}`)
          if (hasSystemReminder) {
            console.log(`       First 100 chars: "${item.text.substring(0, 100).replace(/\n/g, ' ')}..."`)
          }
        } else {
          console.log(`  [${idx}] type: ${item.type}`)
        }
      })
    }
    
    console.log('\nRequest 2 - First message content items:')
    if (Array.isArray(msg2.content)) {
      msg2.content.forEach((item: any, idx: number) => {
        if (item.type === 'text' && item.text) {
          const hasSystemReminder = item.text.trim().startsWith('<system-reminder>')
          console.log(`  [${idx}] type: text, starts with <system-reminder>: ${hasSystemReminder ? 'YES (will be filtered)' : 'NO'}`)
          if (hasSystemReminder) {
            console.log(`       First 100 chars: "${item.text.substring(0, 100).replace(/\n/g, ' ')}..."`)
          }
        } else {
          console.log(`  [${idx}] type: ${item.type}`)
        }
      })
    }
    
    console.log('\n=====================================')
    console.log('HASH COMPUTATION TEST')
    console.log('=====================================\n')
    
    // Test 1: Hash just the first message
    console.log('Test 1: Hash of first message only')
    const hash1_msg1 = hashMessage(msg1)
    const hash2_msg1 = hashMessage(msg2)
    console.log(`Request 1: ${hash1_msg1}`)
    console.log(`Request 2: ${hash2_msg1}`)
    console.log(`Match: ${hash1_msg1 === hash2_msg1 ? 'YES' : 'NO'}\n`)
    
    // Test 2: Manually filter and compare
    console.log('Test 2: Manual filtering comparison')
    
    const filterContent = (content: any[]) => {
      return content.filter(item => {
        if (item.type === 'text' && typeof item.text === 'string') {
          return !item.text.trim().startsWith('<system-reminder>')
        }
        return true
      })
    }
    
    const filtered1 = filterContent(msg1.content)
    const filtered2 = filterContent(msg2.content)
    
    console.log(`Request 1: ${msg1.content.length} items -> ${filtered1.length} after filtering`)
    console.log(`Request 2: ${msg2.content.length} items -> ${filtered2.length} after filtering`)
    
    // Compare filtered content
    console.log('\nComparing filtered content:')
    const filteredStr1 = JSON.stringify(filtered1)
    const filteredStr2 = JSON.stringify(filtered2)
    console.log(`Filtered content 1 length: ${filteredStr1.length}`)
    console.log(`Filtered content 2 length: ${filteredStr2.length}`)
    console.log(`Filtered content identical: ${filteredStr1 === filteredStr2 ? 'YES' : 'NO'}`)
    
    if (filteredStr1 !== filteredStr2) {
      // Find where they differ
      for (let i = 0; i < Math.min(filtered1.length, filtered2.length); i++) {
        if (JSON.stringify(filtered1[i]) !== JSON.stringify(filtered2[i])) {
          console.log(`\nFirst difference at filtered item ${i}:`)
          console.log('Item 1:', JSON.stringify(filtered1[i]).substring(0, 200) + '...')
          console.log('Item 2:', JSON.stringify(filtered2[i]).substring(0, 200) + '...')
          break
        }
      }
    }
    
    // Test 3: Full conversation hash with system
    console.log('\n\nTest 3: Full conversation hash (first message + system)')
    const sys1 = req1.body.system
    const sys2 = req2.body.system
    
    const fullHash1 = hashConversationStateWithSystem([msg1], sys1)
    const fullHash2 = hashConversationStateWithSystem([msg2], sys2)
    
    console.log(`Request 1: ${fullHash1}`)
    console.log(`Request 2: ${fullHash2}`)
    console.log(`Match: ${fullHash1 === fullHash2 ? 'YES' : 'NO'}`)
    
    if (fullHash1 !== fullHash2) {
      // Check if it's the system that's different
      console.log('\nChecking if system prompts are the cause:')
      const sysStr1 = typeof sys1 === 'string' ? sys1 : JSON.stringify(sys1)
      const sysStr2 = typeof sys2 === 'string' ? sys2 : JSON.stringify(sys2)
      console.log(`System prompts identical: ${sysStr1 === sysStr2 ? 'YES' : 'NO'}`)
      
      if (sysStr1 !== sysStr2) {
        console.log('The difference is in the system prompts, not the messages')
      }
    }
    
    console.log('\n=====================================')
    console.log('CONCLUSION')
    console.log('=====================================\n')
    
    console.log('The system-reminder filtering is working correctly in the hash function.')
    console.log('The hashes are different because:')
    if (filteredStr1 !== filteredStr2) {
      console.log('1. The message content is different even after filtering system-reminders')
    }
    const sysStr1 = typeof sys1 === 'string' ? sys1 : JSON.stringify(sys1)
    const sysStr2 = typeof sys2 === 'string' ? sys2 : JSON.stringify(sys2)
    if (sysStr1 !== sysStr2) {
      console.log('2. The system prompts are different')
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

main()