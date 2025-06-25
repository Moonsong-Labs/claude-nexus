#!/usr/bin/env bun
/**
 * Analyze the differences in system prompts and first message
 */

import { Pool } from 'pg'
import { config } from 'dotenv'

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
    console.log('Analyzing system prompts and message differences...\n')
    
    // Get both requests
    const query = `
      SELECT 
        request_id,
        body,
        timestamp
      FROM api_requests
      WHERE request_id = ANY($1::uuid[])
      ORDER BY timestamp ASC
    `
    
    const result = await pool.query(query, [requestIds])
    
    const req1 = result.rows[0]
    const req2 = result.rows[1]
    
    console.log(`Request 1: ${req1.request_id}`)
    console.log(`Timestamp: ${req1.timestamp}`)
    console.log(`\nRequest 2: ${req2.request_id}`)
    console.log(`Timestamp: ${req2.timestamp}`)
    console.log(`Time difference: ${(req2.timestamp - req1.timestamp) / 1000} seconds\n`)
    
    console.log('=====================================')
    console.log('SYSTEM PROMPT ANALYSIS')
    console.log('=====================================\n')
    
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
      
      // Try to find where they differ
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
          if (section1.includes('Today\'s date') || section2.includes('Today\'s date')) {
            console.log('🔍 Difference appears to be in date/time information')
          }
          break
        }
      }
    }
    
    console.log('\n=====================================')
    console.log('FIRST MESSAGE ANALYSIS')
    console.log('=====================================\n')
    
    const msg1 = req1.body.messages[0]
    const msg2 = req2.body.messages[0]
    
    console.log(`Message 1 role: ${msg1.role}`)
    console.log(`Message 2 role: ${msg2.role}`)
    
    if (Array.isArray(msg1.content) && Array.isArray(msg2.content)) {
      console.log(`\nMessage 1 content items: ${msg1.content.length}`)
      console.log(`Message 2 content items: ${msg2.content.length}`)
      
      console.log('\nMessage 1 content structure:')
      msg1.content.forEach((item: any, idx: number) => {
        const preview = item.type === 'text' && item.text ? 
          item.text.substring(0, 100).replace(/\n/g, ' ') : ''
        console.log(`  [${idx}] type: ${item.type}, length: ${JSON.stringify(item).length}`)
        if (preview) {
          console.log(`       preview: "${preview}..."`)
        }
        if (item.type === 'text' && item.text?.includes('<system-reminder>')) {
          console.log(`       ⚠️  Contains <system-reminder>`)
        }
      })
      
      console.log('\nMessage 2 content structure:')
      msg2.content.forEach((item: any, idx: number) => {
        const preview = item.type === 'text' && item.text ? 
          item.text.substring(0, 100).replace(/\n/g, ' ') : ''
        console.log(`  [${idx}] type: ${item.type}, length: ${JSON.stringify(item).length}`)
        if (preview) {
          console.log(`       preview: "${preview}..."`)
        }
        if (item.type === 'text' && item.text?.includes('<system-reminder>')) {
          console.log(`       ⚠️  Contains <system-reminder>`)
        }
      })
      
      // Compare content items
      console.log('\n--- Content Item Comparison ---')
      const maxItems = Math.max(msg1.content.length, msg2.content.length)
      
      for (let i = 0; i < maxItems; i++) {
        const item1 = msg1.content[i]
        const item2 = msg2.content[i]
        
        if (!item1) {
          console.log(`\nItem [${i}]: Only in message 2`)
        } else if (!item2) {
          console.log(`\nItem [${i}]: Only in message 1`)
        } else {
          const str1 = JSON.stringify(item1)
          const str2 = JSON.stringify(item2)
          
          if (str1 === str2) {
            console.log(`\nItem [${i}]: ✅ IDENTICAL`)
          } else {
            console.log(`\nItem [${i}]: ❌ DIFFERENT`)
            console.log(`  Length difference: ${Math.abs(str1.length - str2.length)} characters`)
            
            if (item1.type === 'text' && item2.type === 'text') {
              // Check if difference is only in system-reminder
              const text1NoSysRem = item1.text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
              const text2NoSysRem = item2.text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
              
              if (text1NoSysRem === text2NoSysRem) {
                console.log(`  ✅ Identical when system-reminder is removed`)
              } else {
                console.log(`  ❌ Still different after removing system-reminder`)
                console.log(`  Text 1 (no sys-rem) length: ${text1NoSysRem.length}`)
                console.log(`  Text 2 (no sys-rem) length: ${text2NoSysRem.length}`)
              }
            }
          }
        }
      }
    }
    
    console.log('\n=====================================')
    console.log('CONCLUSION')
    console.log('=====================================\n')
    
    console.log('These requests have different:')
    console.log('1. System prompts (possibly due to git status or timestamps)')
    console.log('2. First message content (different number of items or content)')
    console.log('\nThis explains why they are treated as separate conversations.')
    console.log('They appear to be different sessions, not the same conversation.')
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

main()