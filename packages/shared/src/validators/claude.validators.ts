/**
 * Validation functions for Claude API types
 */

// Note: These validators are designed to work with both the shared package types
// and the proxy service types which may have slightly different definitions

/**
 * Type guard to check if a response is a Claude error response
 */
export function isClaudeError(response: unknown): response is any {
  return (
    response !== null &&
    typeof response === 'object' &&
    'error' in response &&
    typeof (response as any).error === 'object'
  )
}

/**
 * Type guard to check if data is a Claude streaming event
 */
export function isStreamEvent(data: unknown): data is any {
  return data !== null && typeof data === 'object' && 'type' in data
}

/**
 * Check if content blocks contain tool use
 */
export function hasToolUse(content: any[]): boolean {
  return content.some(c => c.type === 'tool_use')
}

/**
 * Validates if a request conforms to the Claude Messages API format
 * @returns true if the request is valid, false otherwise
 */
export function validateClaudeRequest(request: unknown): request is any {
  if (!request || typeof request !== 'object') {
    return false
  }

  const req = request as any

  // Required fields
  if (!req.model || typeof req.model !== 'string') {
    return false
  }
  if (!Array.isArray(req.messages) || req.messages.length === 0) {
    return false
  }
  if (!req.max_tokens || typeof req.max_tokens !== 'number') {
    return false
  }

  // Validate messages
  for (const message of req.messages) {
    if (!message.role || !['user', 'assistant', 'system'].includes(message.role)) {
      return false
    }
    if (!message.content && message.content !== '') {
      return false
    }
  }

  // Optional fields validation
  if (req.stream !== undefined && typeof req.stream !== 'boolean') {
    return false
  }
  if (
    req.temperature !== undefined &&
    (typeof req.temperature !== 'number' || req.temperature < 0 || req.temperature > 1)
  ) {
    return false
  }

  return true
}

/**
 * Count the total number of system messages in a request
 * Includes both the system prompt and any system role messages
 */
export function countSystemMessages(request: any): number {
  let count = 0

  // Handle system field - can be string or array
  if (request.system) {
    if (Array.isArray(request.system)) {
      count = request.system.length
    } else {
      count = 1
    }
  }

  // Add system messages from messages array
  count += request.messages.filter((m: any) => m.role === 'system').length
  return count
}
