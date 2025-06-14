import { Context } from 'hono'
import { stream } from 'hono/streaming'

// Store active SSE connections
const sseConnections = new Map<string, Set<WriteableStream>>()

/**
 * SSE endpoint for real-time dashboard updates
 */
export async function handleSSE(c: Context) {
  const domain = c.req.query('domain')
  const connectionId = crypto.randomUUID()
  
  return stream(c, async (stream) => {
    // Set SSE headers
    c.header('Content-Type', 'text/event-stream')
    c.header('Cache-Control', 'no-cache')
    c.header('Connection', 'keep-alive')
    
    // Add this connection to the active connections
    const key = domain || 'global'
    if (!sseConnections.has(key)) {
      sseConnections.set(key, new Set())
    }
    sseConnections.get(key)!.add(stream)
    
    // Send initial connection message
    await stream.write(`data: ${JSON.stringify({ 
      type: 'connected', 
      connectionId,
      timestamp: new Date().toISOString() 
    })}\n\n`)
    
    // Keep connection alive with heartbeat
    const heartbeat = setInterval(async () => {
      try {
        await stream.write(`:heartbeat\n\n`)
      } catch (e) {
        // Connection closed
        clearInterval(heartbeat)
      }
    }, 30000) // Every 30 seconds
    
    // Clean up on disconnect
    c.req.raw.signal.addEventListener('abort', () => {
      clearInterval(heartbeat)
      sseConnections.get(key)?.delete(stream)
      if (sseConnections.get(key)?.size === 0) {
        sseConnections.delete(key)
      }
    })
    
    // Keep the connection open
    await stream.sleep(Infinity)
  })
}

/**
 * Broadcast an event to all connected SSE clients
 */
export function broadcastEvent(event: {
  type: string
  domain?: string
  data: any
}) {
  const message = `data: ${JSON.stringify({
    type: event.type,
    data: event.data,
    timestamp: new Date().toISOString()
  })}\n\n`
  
  // Send to domain-specific connections
  if (event.domain && sseConnections.has(event.domain)) {
    sseConnections.get(event.domain)!.forEach(async (stream) => {
      try {
        await stream.write(message)
      } catch (e) {
        // Remove dead connections
        sseConnections.get(event.domain)!.delete(stream)
      }
    })
  }
  
  // Also send to global connections
  if (sseConnections.has('global')) {
    sseConnections.get('global')!.forEach(async (stream) => {
      try {
        await stream.write(message)
      } catch (e) {
        // Remove dead connections
        sseConnections.get('global')!.delete(stream)
      }
    })
  }
}

/**
 * Broadcast conversation updates
 */
export function broadcastConversation(conversation: {
  id: string
  domain: string
  model: string
  tokens: number
  timestamp: string
}) {
  broadcastEvent({
    type: 'conversation',
    domain: conversation.domain,
    data: conversation
  })
}

/**
 * Broadcast metrics updates
 */
export function broadcastMetrics(metrics: {
  domain?: string
  requests: number
  tokens: number
  activeUsers: number
}) {
  broadcastEvent({
    type: 'metrics',
    domain: metrics.domain,
    data: metrics
  })
}

/**
 * Get connection stats
 */
export function getSSEStats() {
  const stats: Record<string, number> = {}
  sseConnections.forEach((connections, key) => {
    stats[key] = connections.size
  })
  return stats
}