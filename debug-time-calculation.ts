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
        total_tokens,
        duration_ms,
        body->'last_message' as last_message,
        response_body
      FROM api_requests 
      WHERE conversation_id = $1 
        AND (branch_id = $2 OR (branch_id IS NULL AND $2 = 'main'))
      ORDER BY timestamp
    `, [conversationId, branch])

    console.log(`Found ${result.rows.length} requests in conversation`)
    
    // Calculate time to reply manually
    let totalReplyTime = 0
    let replyCount = 0
    
    for (let i = 0; i < result.rows.length - 1; i++) {
      const currentReq = result.rows[i]
      const nextReq = result.rows[i + 1]
      
      // Check if current request has assistant response with text
      const hasAssistantText = currentReq.response_body?.content?.some(
        (item: any) => item.type === 'text' && item.text?.trim().length > 0
      )
      
      // Check if next request has user message with text
      const lastMessage = nextReq.last_message
      const hasUserText = lastMessage?.role === 'user' && (
        (typeof lastMessage.content === 'string' && lastMessage.content.trim().length > 0) ||
        (Array.isArray(lastMessage.content) && lastMessage.content.some(
          (item: any) => item.type === 'text' && item.text?.trim().length > 0
        ))
      )
      
      if (hasAssistantText && hasUserText) {
        const timeDiff = new Date(nextReq.timestamp).getTime() - new Date(currentReq.timestamp).getTime()
        totalReplyTime += timeDiff
        replyCount++
        
        console.log(`\nReply interval ${replyCount}:`)
        console.log(`  From: ${currentReq.timestamp} (${currentReq.request_id})`)
        console.log(`  To: ${nextReq.timestamp} (${nextReq.request_id})`)
        console.log(`  Duration: ${timeDiff}ms = ${timeDiff / 1000 / 60}min = ${timeDiff / 1000 / 60 / 60}h`)
      }
    }
    
    console.log(`\nTotal reply time: ${totalReplyTime}ms = ${totalReplyTime / 1000 / 60}min = ${totalReplyTime / 1000 / 60 / 60}h`)
    console.log(`Reply count: ${replyCount}`)
    console.log(`Average: ${replyCount > 0 ? totalReplyTime / replyCount / 1000 / 60 : 0}min`)
    
    // Also show total conversation duration
    if (result.rows.length > 0) {
      const firstTime = new Date(result.rows[0].timestamp).getTime()
      const lastTime = new Date(result.rows[result.rows.length - 1].timestamp).getTime()
      const totalDuration = lastTime - firstTime
      console.log(`\nTotal conversation duration: ${totalDuration / 1000 / 60}min = ${totalDuration / 1000 / 60 / 60}h`)
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

debugTimeCalculation()