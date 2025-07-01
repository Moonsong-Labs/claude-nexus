/**
 * Utilities for calculating conversation metrics including tool execution times
 * and user reply times (excluding tool execution periods)
 */

import type { ConversationRequest } from '../types/conversation.js'

interface ToolExecution {
  toolUseRequestId: string
  toolResultRequestId: string
  toolUseTimestamp: Date
  toolResultTimestamp: Date
  durationMs: number
  toolName?: string
}

interface ReplyInterval {
  assistantRequestId: string
  userRequestId: string
  assistantTimestamp: Date
  userTimestamp: Date
  rawDurationMs: number
  toolExecutionMs: number
  netDurationMs: number
}

export interface ConversationMetrics {
  toolExecution: {
    totalMs: number
    averageMs: number
    count: number
    executions: ToolExecution[]
  }
  userReply: {
    totalMs: number
    averageMs: number
    count: number
    intervals: ReplyInterval[]
  }
}

/**
 * Extract tool use content blocks from a message
 */
function extractToolUses(message: any): Array<{ id: string; name: string }> {
  if (!message?.content || typeof message.content === 'string') {
    return []
  }

  return message.content
    .filter((item: any) => item.type === 'tool_use' && item.id)
    .map((item: any) => ({ id: item.id, name: item.name || 'unknown' }))
}

/**
 * Extract tool result content blocks from a message
 */
function extractToolResults(message: any): string[] {
  if (!message?.content || typeof message.content === 'string') {
    return []
  }

  return message.content
    .filter((item: any) => item.type === 'tool_result' && item.tool_use_id)
    .map((item: any) => item.tool_use_id)
}

/**
 * Check if a message contains user-visible text (not just tool operations)
 */
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

/**
 * Find tool execution pairs across requests
 */
function findToolExecutions(requests: ConversationRequest[]): ToolExecution[] {
  const executions: ToolExecution[] = []
  const toolUseMap = new Map<string, { requestId: string; timestamp: Date; name: string }>()

  // First pass: collect all tool uses
  for (const request of requests) {
    const messages = request.body?.messages || []
    const timestamp = new Date(request.timestamp)

    for (const message of messages) {
      if (message.role === 'assistant') {
        const toolUses = extractToolUses(message)
        for (const tool of toolUses) {
          toolUseMap.set(tool.id, {
            requestId: request.request_id,
            timestamp,
            name: tool.name,
          })
        }
      }
    }
  }

  // Second pass: find matching tool results
  for (const request of requests) {
    const messages = request.body?.messages || []
    const timestamp = new Date(request.timestamp)

    for (const message of messages) {
      if (message.role === 'user') {
        const toolResults = extractToolResults(message)
        for (const toolId of toolResults) {
          const toolUse = toolUseMap.get(toolId)
          if (toolUse) {
            executions.push({
              toolUseRequestId: toolUse.requestId,
              toolResultRequestId: request.request_id,
              toolUseTimestamp: toolUse.timestamp,
              toolResultTimestamp: timestamp,
              durationMs: timestamp.getTime() - toolUse.timestamp.getTime(),
              toolName: toolUse.name,
            })
            // Remove to handle duplicates properly
            toolUseMap.delete(toolId)
          }
        }
      }
    }
  }

  return executions
}

/**
 * Find user reply intervals and calculate net duration excluding tool execution
 */
function findReplyIntervals(
  requests: ConversationRequest[],
  toolExecutions: ToolExecution[]
): ReplyInterval[] {
  const intervals: ReplyInterval[] = []

  // Find assistant messages with visible text
  const assistantRequests = requests.filter(req => {
    const messages = req.body?.messages || []
    const lastMessage = messages[messages.length - 1]
    return lastMessage?.role === 'assistant' && hasVisibleText(lastMessage)
  })

  // For each assistant message, find the next user message
  for (const assistantReq of assistantRequests) {
    const assistantTime = new Date(assistantReq.timestamp)
    const assistantIdx = requests.findIndex(r => r.request_id === assistantReq.request_id)

    // Look for next user message with visible text
    for (let i = assistantIdx + 1; i < requests.length; i++) {
      const userReq = requests[i]
      const messages = userReq.body?.messages || []
      const lastMessage = messages[messages.length - 1]

      if (lastMessage?.role === 'user' && hasVisibleText(lastMessage)) {
        const userTime = new Date(userReq.timestamp)
        const rawDuration = userTime.getTime() - assistantTime.getTime()

        // Calculate tool execution time that overlaps this interval
        let toolExecutionMs = 0
        for (const exec of toolExecutions) {
          // Tool execution must start after assistant message and complete before user message
          if (exec.toolUseTimestamp >= assistantTime && exec.toolResultTimestamp <= userTime) {
            toolExecutionMs += exec.durationMs
          }
        }

        intervals.push({
          assistantRequestId: assistantReq.request_id,
          userRequestId: userReq.request_id,
          assistantTimestamp: assistantTime,
          userTimestamp: userTime,
          rawDurationMs: rawDuration,
          toolExecutionMs,
          netDurationMs: rawDuration - toolExecutionMs,
        })

        break // Found the next user message, move to next assistant message
      }
    }
  }

  return intervals
}

/**
 * Calculate conversation metrics for tool execution and user reply times
 */
export function calculateConversationMetrics(requests: ConversationRequest[]): ConversationMetrics {
  // Sort requests by timestamp
  const sortedRequests = [...requests].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  // Find tool executions
  const toolExecutions = findToolExecutions(sortedRequests)

  // Find reply intervals
  const replyIntervals = findReplyIntervals(sortedRequests, toolExecutions)

  // Calculate tool execution metrics
  const toolTotalMs = toolExecutions.reduce((sum, exec) => sum + exec.durationMs, 0)
  const toolCount = toolExecutions.length

  // Calculate user reply metrics (using net duration)
  const replyTotalMs = replyIntervals.reduce((sum, interval) => sum + interval.netDurationMs, 0)
  const replyCount = replyIntervals.length

  return {
    toolExecution: {
      totalMs: toolTotalMs,
      averageMs: toolCount > 0 ? toolTotalMs / toolCount : 0,
      count: toolCount,
      executions: toolExecutions,
    },
    userReply: {
      totalMs: replyTotalMs,
      averageMs: replyCount > 0 ? replyTotalMs / replyCount : 0,
      count: replyCount,
      intervals: replyIntervals,
    },
  }
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`
  } else if (ms < 3600000) {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.round((ms % 60000) / 1000)
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  } else {
    const hours = Math.floor(ms / 3600000)
    const minutes = Math.round((ms % 3600000) / 60000)
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
}
