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

function hasVisibleText(message: any): boolean {
  if (!message?.content) {
    return false
  }

  if (typeof message.content === 'string') {
    return message.content.trim().length > 0
  }

  return message.content.some(
    (item: any) => item.type === 'text' && item.text && item.text.trim().length > 0
  )
}

async function debugReplyIntervals() {
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
        response_body,
        duration_ms
      FROM api_requests 
      WHERE conversation_id = $1 
        AND (branch_id = $2 OR (branch_id IS NULL AND $2 = 'main'))
      ORDER BY timestamp
    `, [conversationId, branch])

    console.log(`Found ${result.rows.length} requests in branch ${branch}`)
    
    // Find reply intervals
    const intervals: any[] = []
    
    for (let i = 0; i < result.rows.length; i++) {
      const request = result.rows[i]
      
      // Check if this request has an assistant response with visible text
      const hasAssistantText = request.response_body?.content?.some(
        (item: any) => item.type === 'text' && item.text && item.text.trim().length > 0
      )
      
      if (hasAssistantText) {
        console.log(`\nRequest ${i + 1} has assistant text response`)
        console.log(`  Time: ${request.timestamp}`)
        console.log(`  ID: ${request.request_id}`)
        
        // Look for the next user request with visible text
        for (let j = i + 1; j < result.rows.length; j++) {
          const nextRequest = result.rows[j]
          
          // Check if the next request has user content with visible text
          const lastMessage = nextRequest.body?.messages?.[nextRequest.body.messages.length - 1]
          
          if (lastMessage?.role === 'user' && hasVisibleText(lastMessage)) {
            console.log(`  Next user text at request ${j + 1}:`)
            console.log(`    Time: ${nextRequest.timestamp}`)
            console.log(`    ID: ${nextRequest.request_id}`)
            
            const timeDiff = new Date(nextRequest.timestamp).getTime() - new Date(request.timestamp).getTime()
            console.log(`    Time difference: ${timeDiff}ms = ${timeDiff / 1000 / 60}min = ${timeDiff / 1000 / 60 / 60}h`)
            
            intervals.push({
              from: i + 1,
              to: j + 1,
              duration: timeDiff
            })
            
            break
          }
        }
      }
    }
    
    console.log(`\n\nFound ${intervals.length} reply intervals`)
    
    const totalReplyTime = intervals.reduce((sum, interval) => sum + interval.duration, 0)
    console.log(`Total reply time: ${totalReplyTime}ms = ${totalReplyTime / 1000 / 60}min = ${totalReplyTime / 1000 / 60 / 60}h`)
    
    // Show each request briefly
    console.log('\n\nRequest summary:')
    result.rows.forEach((req, i) => {
      const lastMessage = req.body?.messages?.[req.body.messages.length - 1]
      const hasUserText = lastMessage?.role === 'user' && hasVisibleText(lastMessage)
      const hasAssistantText = req.response_body?.content?.some(
        (item: any) => item.type === 'text' && item.text && item.text.trim().length > 0
      )
      
      console.log(`${i + 1}. ${req.timestamp} - User text: ${hasUserText}, Assistant text: ${hasAssistantText}`)
    })
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

debugReplyIntervals()