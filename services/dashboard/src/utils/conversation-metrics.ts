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
 * This function now works with the optimized query where only the last request per branch has full body
 */
function findToolExecutions(requests: ConversationRequest[]): ToolExecution[] {
  const executions: ToolExecution[] = []

  // First, check all requests for response_body with tool uses
  // This is the most reliable source since response bodies are always included
  const toolUsesByRequest = new Map<string, Array<{ id: string; name: string }>>()

  requests.forEach(request => {
    if (request.response_body?.content && Array.isArray(request.response_body.content)) {
      const toolUses: Array<{ id: string; name: string }> = []
      request.response_body.content.forEach((item: any) => {
        if (item.type === 'tool_use' && item.id) {
          toolUses.push({
            id: item.id,
            name: item.name || 'unknown',
          })
        }
      })
      if (toolUses.length > 0) {
        toolUsesByRequest.set(request.request_id, toolUses)
      }
    }
  })

  // Now look for tool results in subsequent requests
  // We need to check the requests that have full body data
  const requestsWithBody = requests.filter(r => r.body?.messages)

  requestsWithBody.forEach(request => {
    const messages = request.body.messages || []

    // Look for tool results in user messages
    messages.forEach(message => {
      if (message.role === 'user') {
        const toolResults = extractToolResults(message)

        toolResults.forEach(toolResultId => {
          // Find which request had this tool use
          let foundToolUse = false

          for (const [toolUseRequestId, toolUses] of toolUsesByRequest.entries()) {
            const matchingTool = toolUses.find(t => t.id === toolResultId)
            if (matchingTool) {
              // Find the requests to get timestamps
              const toolUseRequest = requests.find(r => r.request_id === toolUseRequestId)
              if (toolUseRequest) {
                const toolUseTime = new Date(toolUseRequest.timestamp)
                const toolResultTime = new Date(request.timestamp)

                // Only add if result comes after use
                if (toolResultTime > toolUseTime) {
                  executions.push({
                    toolUseRequestId: toolUseRequestId,
                    toolResultRequestId: request.request_id,
                    toolUseTimestamp: toolUseTime,
                    toolResultTimestamp: toolResultTime,
                    durationMs: toolResultTime.getTime() - toolUseTime.getTime(),
                    toolName: matchingTool.name,
                  })
                  foundToolUse = true
                  break
                }
              }
            }
          }

          // If we didn't find the tool use in response bodies, check message history
          if (!foundToolUse) {
            // Look through all assistant messages in the conversation for this tool use
            for (let i = messages.length - 1; i >= 0; i--) {
              const msg = messages[i]
              if (msg.role === 'assistant') {
                const toolUses = extractToolUses(msg)
                const matchingTool = toolUses.find(t => t.id === toolResultId)
                if (matchingTool) {
                  // Estimate timing based on message position
                  // This is less accurate but better than nothing
                  const messageRatio = i / messages.length
                  const firstRequestTime = new Date(requests[0].timestamp).getTime()
                  const lastRequestTime = new Date(
                    requests[requests.length - 1].timestamp
                  ).getTime()
                  const estimatedToolUseTime =
                    firstRequestTime + (lastRequestTime - firstRequestTime) * messageRatio

                  executions.push({
                    toolUseRequestId: request.request_id, // We don't know the exact request
                    toolResultRequestId: request.request_id,
                    toolUseTimestamp: new Date(estimatedToolUseTime),
                    toolResultTimestamp: new Date(request.timestamp),
                    durationMs: new Date(request.timestamp).getTime() - estimatedToolUseTime,
                    toolName: matchingTool.name,
                  })
                  break
                }
              }
            }
          }
        })
      }
    })
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
