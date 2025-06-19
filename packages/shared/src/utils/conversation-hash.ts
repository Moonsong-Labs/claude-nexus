import { createHash } from 'crypto'
import type { ClaudeMessage } from '../types/claude.js'

/**
 * Generates a deterministic SHA-256 hash for a Claude message
 * @param message - The message to hash
 * @returns A 64-character hex string hash
 */
export function hashMessage(message: ClaudeMessage): string {
  // Normalize the message for consistent hashing
  const normalizedContent = normalizeMessageContent(message.content)

  // Create a deterministic string representation
  const messageString = `${message.role}:${normalizedContent}`

  // Generate SHA-256 hash
  return createHash('sha256').update(messageString, 'utf8').digest('hex')
}

/**
 * Normalizes message content for consistent hashing
 * Handles both string and array content types
 */
function normalizeMessageContent(content: string | any[]): string {
  if (typeof content === 'string') {
    // Trim whitespace and normalize line endings
    return content.trim().replace(/\r\n/g, '\n')
  }

  // For array content, create a deterministic string representation
  // DO NOT sort - preserve the original order as it's semantically important
  return content
    .map((item, index) => {
      // Extract only the essential fields, ignoring cache_control and other metadata
      switch (item.type) {
        case 'text':
          return `[${index}]text:${item.text?.trim() || ''}`
        case 'image':
          // For images, hash the data to avoid storing large base64 strings
          const imageHash = item.source?.data
            ? createHash('sha256').update(item.source.data).digest('hex')
            : 'no-data'
          return `[${index}]image:${item.source?.media_type || 'unknown'}:${imageHash}`
        case 'tool_use':
          return `[${index}]tool_use:${item.name}:${item.id}:${JSON.stringify(item.input || {})}`
        case 'tool_result':
          const resultContent =
            typeof item.content === 'string' ? item.content : JSON.stringify(item.content || [])
          return `[${index}]tool_result:${item.tool_use_id}:${resultContent}`
        default:
          // For unknown types, only include type and essential content
          const essentialItem = { type: item.type, content: item.content, text: item.text }
          return `[${index}]${item.type}:${JSON.stringify(essentialItem)}`
      }
    })
    .join('|')
}

/**
 * Extracts the current and parent message hashes from a request
 * @param messages - Array of messages from the request
 * @returns Object containing current and parent message hashes
 */
export function extractMessageHashes(messages: ClaudeMessage[]): {
  currentMessageHash: string
  parentMessageHash: string | null
} {
  if (!messages || messages.length === 0) {
    throw new Error('Cannot extract hashes from empty messages array')
  }

  // Hash the last message (current)
  const currentMessageHash = hashMessage(messages[messages.length - 1])

  // Hash the second-to-last message (parent) if it exists
  const parentMessageHash = messages.length > 1 ? hashMessage(messages[messages.length - 2]) : null

  return { currentMessageHash, parentMessageHash }
}

/**
 * Generates a new conversation ID
 * Uses crypto.randomUUID for a v4 UUID
 */
export function generateConversationId(): string {
  return crypto.randomUUID()
}
