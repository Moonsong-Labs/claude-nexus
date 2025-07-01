import { Pool } from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { calculateConversationMetrics, formatDuration } from './services/dashboard/src/utils/conversation-metrics.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function debugFullConversation() {
  const conversationId = '43bc971f-3d37-4cba-96b8-53b3c08ceff6'
  
  try {
    // Get ALL requests for this conversation
    const result = await pool.query(`
      SELECT 
        request_id,
        timestamp,
        branch_id,
        body,
        response_body,
        duration_ms,
        total_tokens,
        message_count
      FROM api_requests 
      WHERE conversation_id = $1 
      ORDER BY timestamp
    `, [conversationId])

    console.log(`Total requests in conversation: ${result.rows.length}`)
    
    // Group by branch
    const branches = new Map<string, any[]>()
    result.rows.forEach(req => {
      const branch = req.branch_id || 'main'
      if (!branches.has(branch)) {
        branches.set(branch, [])
      }
      branches.get(branch)!.push(req)
    })
    
    console.log('\nBranches:')
    branches.forEach((requests, branch) => {
      console.log(`  ${branch}: ${requests.length} requests`)
    })
    
    // Calculate metrics for compact branch
    const compactRequests = branches.get('compact_162636') || []
    console.log(`\nCalculating metrics for compact_162636 branch (${compactRequests.length} requests)`)
    
    const metrics = calculateConversationMetrics(compactRequests)
    
    console.log('\nMetrics:')
    console.log(`  Tool execution: ${formatDuration(metrics.toolExecution.totalMs)} (${metrics.toolExecution.count} tools)`)
    console.log(`  Time to reply: ${formatDuration(metrics.userReply.totalMs)} (${metrics.userReply.count} intervals)`)
    console.log(`  User interactions: ${metrics.userInteractions.count}`)
    
    if (metrics.userReply.intervals.length > 0) {
      console.log('\nReply intervals:')
      metrics.userReply.intervals.forEach((interval, i) => {
        console.log(`  ${i + 1}. ${formatDuration(interval.netDurationMs)} (raw: ${formatDuration(interval.rawDurationMs)}, tool: ${formatDuration(interval.toolExecutionMs)})`)
      })
    }
    
    // Now check what happens with main branch history included
    const mainBeforeCompact = result.rows.filter(r => {
      const isMain = !r.branch_id || r.branch_id === 'main'
      const compactStart = new Date(compactRequests[0]?.timestamp || Date.now())
      return isMain && new Date(r.timestamp) < compactStart
    })
    
    console.log(`\nMain branch requests before compact: ${mainBeforeCompact.length}`)
    
    const combinedRequests = [...mainBeforeCompact, ...compactRequests]
    console.log(`Combined requests: ${combinedRequests.length}`)
    
    const combinedMetrics = calculateConversationMetrics(combinedRequests)
    console.log('\nCombined metrics:')
    console.log(`  Tool execution: ${formatDuration(combinedMetrics.toolExecution.totalMs)} (${combinedMetrics.toolExecution.count} tools)`)
    console.log(`  Time to reply: ${formatDuration(combinedMetrics.userReply.totalMs)} (${combinedMetrics.userReply.count} intervals)`)
    console.log(`  User interactions: ${combinedMetrics.userInteractions.count}`)
    
    if (combinedMetrics.userReply.intervals.length > 0) {
      console.log('\nCombined reply intervals:')
      combinedMetrics.userReply.intervals.forEach((interval, i) => {
        const fromReq = combinedRequests.find(r => r.request_id === interval.assistantRequestId)
        const toReq = combinedRequests.find(r => r.request_id === interval.userRequestId)
        console.log(`  ${i + 1}. ${formatDuration(interval.netDurationMs)}`)
        console.log(`      From: ${fromReq?.timestamp} (${fromReq?.branch_id || 'main'})`)
        console.log(`      To: ${toReq?.timestamp} (${toReq?.branch_id || 'main'})`)
        console.log(`      Raw: ${formatDuration(interval.rawDurationMs)}, Tool: ${formatDuration(interval.toolExecutionMs)}`)
      })
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await pool.end()
  }
}

debugFullConversation()