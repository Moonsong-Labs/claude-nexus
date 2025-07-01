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

async function debugTimeCalculation() {
  const conversationId = '43bc971f-3d37-4cba-96b8-53b3c08ceff6'
  const branch = 'compact_162636'
  
  try {
    // Get all requests for this conversation
    const result = await pool.query(`
      SELECT 
        request_id,
        timestamp,
        branch_id,
        body
      FROM api_requests 
      WHERE conversation_id = $1 
      ORDER BY timestamp
    `, [conversationId])

    console.log(`Found ${result.rows.length} requests in conversation`)
    console.log('\nAll branches:', [...new Set(result.rows.map(r => r.branch_id || 'main'))])
    
    // Filter by branch
    const branchRequests = result.rows.filter(r => 
      (branch === 'main' && (!r.branch_id || r.branch_id === 'main')) ||
      r.branch_id === branch
    )
    
    console.log(`\nFound ${branchRequests.length} requests in branch ${branch}`)
    
    // Show each request
    branchRequests.forEach((req, i) => {
      console.log(`\nRequest ${i + 1}:`)
      console.log(`  ID: ${req.request_id}`)
      console.log(`  Time: ${req.timestamp}`)
      console.log(`  Branch: ${req.branch_id || 'main'}`)
      
      // Check if body exists
      if (req.body) {
        console.log(`  Has body: yes`)
        if (req.body.last_message) {
          console.log(`  Last message role: ${req.body.last_message.role}`)
          const content = req.body.last_message.content
          if (typeof content === 'string') {
            console.log(`  Last message content (string): ${content.substring(0, 50)}...`)
          } else if (Array.isArray(content)) {
            console.log(`  Last message content (array): ${content.length} items`)
            content.forEach((item: any, idx: number) => {
              console.log(`    [${idx}] type: ${item.type}`)
              if (item.type === 'text' && item.text) {
                console.log(`    [${idx}] text: ${item.text.substring(0, 50)}...`)
              }
            })
          }
        } else {
          console.log(`  No last_message field`)
        }
      } else {
        console.log(`  Has body: no`)
      }
    })
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

debugTimeCalculation()