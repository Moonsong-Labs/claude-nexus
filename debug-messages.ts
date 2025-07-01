import { Pool } from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function debugMessages() {
  const conversationId = '43bc971f-3d37-4cba-96b8-53b3c08ceff6'
  const branch = 'compact_162636'
  
  try {
    // Get all requests for this conversation
    const result = await pool.query(`
      SELECT 
        request_id,
        timestamp,
        branch_id,
        body,
        response_body
      FROM api_requests 
      WHERE conversation_id = $1 
        AND (branch_id = $2 OR (branch_id IS NULL AND $2 = 'main'))
      ORDER BY timestamp
      LIMIT 3
    `, [conversationId, branch])

    console.log(`Checking first 3 requests:`)
    
    result.rows.forEach((req, i) => {
      console.log(`\n=== Request ${i + 1} ===`)
      console.log(`ID: ${req.request_id}`)
      console.log(`Time: ${req.timestamp}`)
      
      // Check body structure
      if (req.body) {
        console.log('\nBody structure:')
        console.log(`  Has messages: ${req.body.messages ? 'yes' : 'no'}`)
        if (req.body.messages && Array.isArray(req.body.messages)) {
          console.log(`  Messages count: ${req.body.messages.length}`)
          // Show last message
          if (req.body.messages.length > 0) {
            const lastMsg = req.body.messages[req.body.messages.length - 1]
            console.log(`  Last message role: ${lastMsg.role}`)
            if (typeof lastMsg.content === 'string') {
              console.log(`  Last message content: ${lastMsg.content.substring(0, 100)}...`)
            } else if (Array.isArray(lastMsg.content)) {
              console.log(`  Last message content items: ${lastMsg.content.length}`)
              lastMsg.content.forEach((item: any, idx: number) => {
                if (item.type === 'text') {
                  console.log(`    [${idx}] text: ${item.text?.substring(0, 50)}...`)
                } else {
                  console.log(`    [${idx}] type: ${item.type}`)
                }
              })
            }
          }
        }
      }
      
      // Check response body
      if (req.response_body) {
        console.log('\nResponse body structure:')
        console.log(`  Has content: ${req.response_body.content ? 'yes' : 'no'}`)
        if (req.response_body.content && Array.isArray(req.response_body.content)) {
          console.log(`  Content items: ${req.response_body.content.length}`)
          req.response_body.content.forEach((item: any, idx: number) => {
            if (item.type === 'text') {
              console.log(`    [${idx}] text: ${item.text?.substring(0, 50)}...`)
            } else {
              console.log(`    [${idx}] type: ${item.type}`)
            }
          })
        }
      }
    })
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

debugMessages()