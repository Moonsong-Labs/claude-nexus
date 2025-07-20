import { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { logger } from '../middleware/logger.js'

/**
 * TODO: This SSE implementation is not currently registered in the app routes.
 * The real-time dashboard updates feature documented in the API requires:
 * 1. Registering the /sse route in app.ts
 * 2. Implementing proxy-to-dashboard communication (e.g., Redis Pub/Sub)
 * 3. Calling broadcast functions from the proxy service
 *
 * See: docs/02-User-Guide/api-reference.md#server-sent-events
 */

// Type definitions
interface SSEConnection {
  write: (data: string) => Promise<void>
  close: () => void
}

interface SSEMessage {
  type: string
  domain?: string
  data: unknown
  timestamp?: string
}

// Constants
const HEARTBEAT_INTERVAL_MS = 30000 // 30 seconds
const MAX_CONNECTIONS_PER_DOMAIN = 100 // Prevent memory exhaustion

// Store active SSE connections
const sseConnections = new Map<string, Set<SSEConnection>>()

/**
 * SSE endpoint for real-time dashboard updates
 *
 * @param c - Hono context
 * @returns SSE stream response
 */
export async function handleSSE(c: Context) {
  const domain = c.req.query('domain')
  const connectionId = crypto.randomUUID()

  return streamSSE(c, async stream => {
    // Add this connection to the active connections
    const key = domain || 'global'
    if (!sseConnections.has(key)) {
      sseConnections.set(key, new Set())
    }

    // Check connection limit
    const connections = sseConnections.get(key)!
    if (connections.size >= MAX_CONNECTIONS_PER_DOMAIN) {
      logger.warn('SSE connection limit reached', {
        domain: key,
        limit: MAX_CONNECTIONS_PER_DOMAIN,
      })
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'error',
          message: 'Connection limit reached',
          timestamp: new Date().toISOString(),
        }),
      })
      stream.close()
      return
    }

    const connection: SSEConnection = {
      write: async (data: string) => {
        try {
          await stream.writeSSE({ data })
        } catch (error) {
          logger.debug('SSE write failed', { connectionId, error })
        }
      },
      close: () => stream.close(),
    }

    connections.add(connection)
    logger.info('SSE connection established', {
      connectionId,
      domain: key,
      activeConnections: connections.size,
    })

    // Send initial connection message
    await stream.writeSSE({
      data: JSON.stringify({
        type: 'connected',
        connectionId,
        timestamp: new Date().toISOString(),
      }),
    })

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(async () => {
      try {
        await stream.writeSSE({ data: '', id: '', event: 'heartbeat' })
      } catch (error) {
        logger.debug('SSE heartbeat failed', { error })
        clearInterval(heartbeat)
      }
    }, HEARTBEAT_INTERVAL_MS)

    // Clean up on disconnect
    const cleanup = () => {
      clearInterval(heartbeat)
      const connections = sseConnections.get(key)
      if (connections) {
        connections.delete(connection)
        logger.info('SSE connection closed', {
          connectionId,
          domain: key,
          remainingConnections: connections.size,
        })
        if (connections.size === 0) {
          sseConnections.delete(key)
        }
      }
    }

    // Handle client disconnect
    stream.onAbort(() => {
      cleanup()
    })

    // Keep the connection open by not returning
    // The connection stays open until client disconnects
  })
}

/**
 * Broadcast an event to all connected SSE clients
 *
 * @param event - Event to broadcast
 */
export function broadcastEvent(event: SSEMessage) {
  const message = JSON.stringify({
    type: event.type,
    data: event.data,
    timestamp: new Date().toISOString(),
  })

  // Send to domain-specific connections
  if (event.domain && sseConnections.has(event.domain)) {
    sseConnections.get(event.domain)!.forEach(async connection => {
      try {
        await connection.write(message)
      } catch (error) {
        // Remove dead connections
        logger.debug('Removing dead SSE connection', { domain: event.domain, error })
        sseConnections.get(event.domain!)!.delete(connection)
      }
    })
  }

  // Also send to global connections
  if (sseConnections.has('global')) {
    sseConnections.get('global')!.forEach(async connection => {
      try {
        await connection.write(message)
      } catch (error) {
        // Remove dead connections
        logger.debug('Removing dead global SSE connection', { error })
        sseConnections.get('global')!.delete(connection)
      }
    })
  }
}

/**
 * Broadcast conversation updates
 *
 * @param conversation - Conversation data to broadcast
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
    data: conversation,
  })
}

/**
 * Broadcast metrics updates
 *
 * @param metrics - Metrics data to broadcast
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
    data: metrics,
  })
}

/**
 * Get connection statistics for monitoring
 *
 * @returns Object with connection counts per domain
 */
export function getSSEStats(): Record<string, number> {
  const stats: Record<string, number> = {}
  sseConnections.forEach((connections, key) => {
    stats[key] = connections.size
  })
  stats.total = Object.values(stats).reduce((sum, count) => sum + count, 0)
  return stats
}
