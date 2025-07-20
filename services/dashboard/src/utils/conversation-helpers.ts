import type { ConversationRequest } from '../types/conversation.js'
// Removed unused import - escapeHtml is not used in this file

/**
 * Extract the last message content from a request
 */
export function getLastMessageContent(req: ConversationRequest): string {
  try {
    // Check if we have the optimized last_message field
    if (req.last_message) {
      const lastMessage = req.last_message

      // Handle the last message directly
      if (typeof lastMessage.content === 'string') {
        const content = lastMessage.content.trim()
        return content.length > 80 ? content.substring(0, 77) + '...' : content
      } else if (Array.isArray(lastMessage.content)) {
        for (const block of lastMessage.content) {
          if (block.type === 'text' && block.text) {
            const content = block.text.trim()
            return content.length > 80 ? content.substring(0, 77) + '...' : content
          } else if (block.type === 'tool_use' && block.name) {
            return `🔧 Tool: ${block.name}${block.input?.prompt ? ' - ' + block.input.prompt.substring(0, 50) + '...' : ''}`
          } else if (block.type === 'tool_result' && block.tool_use_id) {
            return `✅ Tool Result${block.content ? ': ' + (typeof block.content === 'string' ? block.content : JSON.stringify(block.content)).substring(0, 50) + '...' : ''}`
          }
        }
      }

      // Fallback to role-based description
      if (lastMessage.role === 'assistant') {
        return '🤖 Assistant response'
      } else if (lastMessage.role === 'user') {
        return '👤 User message'
      } else if (lastMessage.role === 'system') {
        return '⚙️ System message'
      }
    }

    // Legacy fallback for old data structure
    if (!req.body || !req.body.messages || !Array.isArray(req.body.messages)) {
      return 'Request ID: ' + req.request_id
    }

    const messages = req.body.messages
    if (messages.length === 0) {
      return 'Request ID: ' + req.request_id
    }

    // Get the last message
    const lastMessage = messages[messages.length - 1]

    // Handle different message formats
    if (typeof lastMessage.content === 'string') {
      // Simple string content
      const content = lastMessage.content.trim()
      return content.length > 80 ? content.substring(0, 77) + '...' : content
    } else if (Array.isArray(lastMessage.content)) {
      // Array of content blocks
      for (const block of lastMessage.content) {
        if (block.type === 'text' && block.text) {
          const content = block.text.trim()
          return content.length > 80 ? content.substring(0, 77) + '...' : content
        } else if (block.type === 'tool_use' && block.name) {
          return `🔧 Tool: ${block.name}${block.input?.prompt ? ' - ' + block.input.prompt.substring(0, 50) + '...' : ''}`
        } else if (block.type === 'tool_result' && block.tool_use_id) {
          return `✅ Tool Result${block.content ? ': ' + (typeof block.content === 'string' ? block.content : JSON.stringify(block.content)).substring(0, 50) + '...' : ''}`
        }
      }
    }

    // Fallback to role-based description
    if (lastMessage.role === 'assistant') {
      return '🤖 Assistant response'
    } else if (lastMessage.role === 'user') {
      return '👤 User message'
    } else if (lastMessage.role === 'system') {
      return '⚙️ System message'
    }

    return 'Request ID: ' + req.request_id
  } catch (_error) {
    return 'Request ID: ' + req.request_id
  }
}

/**
 * Extract the response summary from a request
 */
export function getResponseSummary(req: ConversationRequest): string {
  try {
    if (!req.response_body) {
      return req.error ? '❌ Error response' : '⏳ No response'
    }

    const response = req.response_body

    // Handle different response formats
    if (typeof response === 'string') {
      // Simple string response
      const content = response.trim()
      return '🤖 ' + (content.length > 80 ? content.substring(0, 77) + '...' : content)
    } else if (response.content) {
      // Handle content array or string
      if (typeof response.content === 'string') {
        const content = response.content.trim()
        return '🤖 ' + (content.length > 80 ? content.substring(0, 77) + '...' : content)
      } else if (Array.isArray(response.content)) {
        // Array of content blocks
        for (const block of response.content) {
          if (block.type === 'text' && block.text) {
            const content = block.text.trim()
            return '🤖 ' + (content.length > 80 ? content.substring(0, 77) + '...' : content)
          } else if (block.type === 'tool_use' && block.name) {
            return `🤖 🔧 ${block.name}${block.input?.prompt ? ': ' + block.input.prompt.substring(0, 50) + '...' : ''}`
          }
        }
      }
    } else if (response.error) {
      // Error response
      return `❌ ${response.error.type || 'Error'}${response.error.message ? ': ' + response.error.message.substring(0, 50) + '...' : ''}`
    }

    // Fallback
    return '🤖 Response received'
  } catch (_error) {
    return '🤖 Response'
  }
}

/**
 * Check if the last message in the request is a user message with text content
 */
export function hasUserMessage(req: ConversationRequest): boolean {
  const lastMessage = req.last_message
  if (lastMessage?.role === 'user') {
    // Check if content has text type
    if (typeof lastMessage.content === 'string') {
      return lastMessage.content.trim().length > 0
    } else if (Array.isArray(lastMessage.content)) {
      return lastMessage.content.some(
        (item: any) => item.type === 'text' && item.text && item.text.trim().length > 0
      )
    }
  }
  return false
}

/**
 * Get the last message type and tool result status
 */
export function getLastMessageType(req: ConversationRequest): {
  lastMessageType: 'user' | 'assistant' | 'tool_result'
  toolResultStatus?: 'success' | 'error' | 'mixed'
} {
  let lastMessageType: 'user' | 'assistant' | 'tool_result' = 'assistant'
  let toolResultStatus: 'success' | 'error' | 'mixed' | undefined

  const lastMessage = req.last_message
  // Check if the last message in the request contains tool results
  if (lastMessage && lastMessage.content && Array.isArray(lastMessage.content)) {
    const toolResults = lastMessage.content.filter((item: any) => item.type === 'tool_result')

    if (toolResults.length > 0) {
      lastMessageType = 'tool_result'

      // Check for errors in tool results
      const hasError = toolResults.some((result: any) => result.is_error === true)
      const hasSuccess = toolResults.some((result: any) => result.is_error !== true)

      if (hasError && hasSuccess) {
        toolResultStatus = 'mixed'
      } else if (hasError) {
        toolResultStatus = 'error'
      } else {
        toolResultStatus = 'success'
      }
    }
  }

  // Override if last message is actually a user message
  if (hasUserMessage(req)) {
    lastMessageType = 'user'
    toolResultStatus = undefined
  }

  return { lastMessageType, toolResultStatus }
}

/**
 * Calculate context tokens for a request
 */
export function calculateContextTokens(req: ConversationRequest): number {
  if (req.response_body?.usage) {
    const usage = req.response_body.usage
    return (
      (usage.input_tokens || 0) +
      (usage.cache_read_input_tokens || 0) +
      (usage.cache_creation_input_tokens || 0)
    )
  }
  return 0
}
