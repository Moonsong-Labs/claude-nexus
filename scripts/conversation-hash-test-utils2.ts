/**
 * Test-only utilities for conversation hashing
 * These functions preserve the legacy implementation for test compatibility
 */

import { createHash } from 'crypto'
import type { ClaudeMessage, ClaudeContent } from '../../types'

/**
 * Legacy hash function for test purposes - uses || separator
 */
export function hashMessageLegacy(message: ClaudeMessage): string {
  const parts = [message.role, normalizeMessageContentLegacy(message.content)]
  return createHash('sha256').update(parts.join('||')).digest('hex')
}

/**
 * Legacy hash function for conversation state - uses || separator
 */
export function hashConversationStateLegacy(messages: ClaudeMessage[]): string {
  const messageHashes = messages.map(msg => hashMessageLegacy(msg))
  return createHash('sha256').update(messageHashes.join('||')).digest('hex')
}

/**
 * Legacy hash function for conversation state with system prompt
 */
export function hashConversationStateWithSystemLegacy(
  messages: ClaudeMessage[],
  systemPrompt?: string | ClaudeContent[]
): string {
  const parts: string[] = []

  // Add system prompt if present
  if (systemPrompt) {
    const systemHash = hashSystemPromptLegacy(systemPrompt)
    if (systemHash) {
      parts.push(`system:${systemHash}`)
    }
  }

  // Add messages
  const messageHashes = messages.map(msg => hashMessageLegacy(msg))
  parts.push(...messageHashes)

  return createHash('sha256').update(parts.join('||')).digest('hex')
}

/**
 * Legacy function to extract message hashes from a conversation
 */
export function extractMessageHashesLegacy(messages: ClaudeMessage[]): {
  currentMessageHash: string
  parentMessageHash: string | null
} {
  if (!messages || messages.length === 0) {
    throw new Error('Cannot extract hashes from empty messages array')
  }

  const currentMessageHash = hashConversationStateLegacy(messages)
  const parentMessageHash =
    messages.length > 1 ? hashConversationStateLegacy(messages.slice(0, -1)) : null

  return {
    currentMessageHash,
    parentMessageHash,
  }
}

/**
 * Legacy function to hash system prompt
 */
function hashSystemPromptLegacy(systemPrompt: string | ClaudeContent[]): string | null {
  if (!systemPrompt) return null

  if (typeof systemPrompt === 'string') {
    const trimmed = systemPrompt.trim()
    if (!trimmed) return null
    return createHash('sha256').update(trimmed).digest('hex')
  }

  // For array system prompts
  if (Array.isArray(systemPrompt) && systemPrompt.length > 0) {
    const contentStr = systemPrompt
      .map(item => {
        if (item.type === 'text' && item.text) {
          return item.text.trim()
        }
        return ''
      })
      .filter(text => text.length > 0)
      .join('\n')

    if (contentStr) {
      return createHash('sha256').update(contentStr).digest('hex')
    }
  }

  return null
}

/**
 * Legacy function to normalize message content - uses || separator
 */
function normalizeMessageContentLegacy(content: string | ClaudeContent[]): string {
  if (typeof content === 'string') {
    return content.trim()
  }

  // Handle array content
  return content
    .map((item, index) => {
      if (item.type === 'text') {
        return `[${index}]text:${item.text}`
      } else if (item.type === 'tool_use') {
        const paramsStr = JSON.stringify(item.input || {})
        return `[${index}]tool_use:${item.name}:${item.id}:${paramsStr}`
      } else if (item.type === 'tool_result') {
        const contentStr =
          typeof item.content === 'string' ? item.content : JSON.stringify(item.content)
        return `[${index}]tool_result:${item.tool_use_id}:${contentStr}`
      }
      return ''
    })
    .filter(s => s.length > 0)
    .join('||') // Legacy separator
}
