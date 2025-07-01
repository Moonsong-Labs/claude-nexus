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
  userInteractions: {
    count: number
    requests: string[]
  }
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
 * Simple approach: tool execution time = tool_result timestamp - tool_use timestamp
 */
function findToolExecutions(requests: ConversationRequest[]): ToolExecution[] {
  const executions: ToolExecution[] = []

  // Map to store tool uses by their ID
  const toolUseMap = new Map<string, { request: ConversationRequest; toolName: string }>()

  // First pass: collect all tool uses
  requests.forEach(request => {
    // Check response_body for tool uses
    if (request.response_body?.content && Array.isArray(request.response_body.content)) {
      request.response_body.content.forEach((item: any) => {
        if (item.type === 'tool_use' && item.id) {
          toolUseMap.set(item.id, {
            request: request,
            toolName: item.name || 'unknown',
          })
        }
      })
    }
  })

  // Second pass: find tool results in request bodies (user sends tool results)
  requests.forEach(request => {
    // Tool results come from the user in the request body
    if (request.body?.messages && Array.isArray(request.body.messages)) {
      // Look at the last message (which should be the user's message)
      const lastMessage = request.body.messages[request.body.messages.length - 1]
      if (
        lastMessage?.role === 'user' &&
        lastMessage.content &&
        Array.isArray(lastMessage.content)
      ) {
        lastMessage.content.forEach((item: any) => {
          if (item.type === 'tool_result' && item.tool_use_id) {
            const toolUseInfo = toolUseMap.get(item.tool_use_id)
            if (toolUseInfo) {
              // Simple calculation: tool_result timestamp - tool_use timestamp
              const toolUseTime = new Date(toolUseInfo.request.timestamp)
              const toolResultTime = new Date(request.timestamp)
              const durationMs = toolResultTime.getTime() - toolUseTime.getTime()

              // Only include if duration is positive (result after use)
              if (durationMs > 0) {
                executions.push({
                  toolUseRequestId: toolUseInfo.request.request_id,
                  toolResultRequestId: request.request_id,
                  toolUseTimestamp: toolUseTime,
                  toolResultTimestamp: toolResultTime,
                  durationMs,
                  toolName: toolUseInfo.toolName,
                })
              }
            }
          }
        })
      }
    }
  })

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
 * Count user interactions from messages in the last request
 */
function countUserInteractionsFromLastRequest(lastRequest: ConversationRequest): {
  count: number
  requests: string[]
} {
  const messages = lastRequest.body?.messages || []
  let userCount = 0

  // Count user messages with visible text
  for (const message of messages) {
    if (message.role === 'user' && hasVisibleText(message)) {
      userCount++
    }
  }

  return {
    count: userCount,
    requests: [], // We don't have individual request IDs from just the messages
  }
}

/**
 * Count user interactions (requests with user messages containing visible text)
 */
function countUserInteractions(requests: ConversationRequest[]): {
  count: number
  requests: string[]
} {
  // Find the last request per branch (which should have full body)
  const lastRequestPerBranch = new Map<string, ConversationRequest>()

  for (const request of requests) {
    const branch = request.branch_id || 'main'
    if (
      request.body?.messages &&
      (!lastRequestPerBranch.has(branch) ||
        new Date(request.timestamp) > new Date(lastRequestPerBranch.get(branch)!.timestamp))
    ) {
      lastRequestPerBranch.set(branch, request)
    }
  }

  // If we have a last request with full body, use it
  if (lastRequestPerBranch.size > 0) {
    const lastRequest = Array.from(lastRequestPerBranch.values())[0]
    return countUserInteractionsFromLastRequest(lastRequest)
  }

  // Fallback to old method if no full body available
  const userRequests: string[] = []

  for (const request of requests) {
    const messages = request.body?.messages || []
    const lastMessage = messages[messages.length - 1]

    // Count requests where the last message is from user and has visible text
    if (lastMessage?.role === 'user' && hasVisibleText(lastMessage)) {
      userRequests.push(request.request_id)
    }
  }

  return {
    count: userRequests.length,
    requests: userRequests,
  }
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

  // Count user interactions
  const userInteractions = countUserInteractions(sortedRequests)

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
    userInteractions: userInteractions,
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
