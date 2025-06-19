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
    // Normalize string content to match array format for consistency
    // This ensures "hello" and [{type: "text", text: "hello"}] produce the same hash
    return `[0]text:${content.trim().replace(/\r\n/g, '\n')}`
  }

  // For array content, create a deterministic string representation
  // DO NOT sort - preserve the original order as it's semantically important
  return content
    .map((item, index) => {
      // Extract only the essential fields, ignoring cache_control and other metadata
      switch (item.type) {
        case 'text':
          return `[${index}]text:${item.text?.trim().replace(/\r\n/g, '\n') || ''}`
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
 * Generates a hash for an entire conversation state (all messages)
 * @param messages - Array of messages
 * @returns A hash representing the full conversation state
 */
export function hashConversationState(messages: ClaudeMessage[]): string {
  if (!messages || messages.length === 0) {
    return ''
  }

  // Create a deterministic representation of all messages
  const conversationString = messages
    .map((msg, index) => `[${index}]${msg.role}:${normalizeMessageContent(msg.content)}`)
    .join('||')

  return createHash('sha256').update(conversationString, 'utf8').digest('hex')
}

/**
 * Extracts the current and parent conversation state hashes
 *
 * For Claude conversations, we need to handle the pattern where:
 * - First request: [user_msg]
 * - Second request: [user_msg, assistant_response, user_msg2]
 * - Third request: [user_msg, assistant_response, user_msg2, assistant_response2, user_msg3]
 *
 * To find the parent, we look for a request whose full message list matches
 * a prefix of our current messages (excluding the last 2 messages - the latest exchange)
 *
 * @param messages - Array of messages from the request
 * @returns Object containing current state hash and parent state hash
 */
export function extractMessageHashes(messages: ClaudeMessage[]): {
  currentMessageHash: string
  parentMessageHash: string | null
} {
  if (!messages || messages.length === 0) {
    throw new Error('Cannot extract hashes from empty messages array')
  }

  // Current hash is the hash of the entire conversation state
  const currentMessageHash = hashConversationState(messages)

  // For parent hash, we need to find the previous request state
  // If we have 3+ messages, the parent likely had all messages except the last 2 (user + assistant)
  // If we have 1-2 messages, this is likely a new conversation
  let parentMessageHash: string | null = null

  if (messages.length === 1) {
    // First message in conversation, no parent
    parentMessageHash = null
  } else if (messages.length === 2) {
    // This shouldn't happen in normal Claude conversations (should be user -> assistant -> user)
    // But handle it anyway - parent would be first message only
    parentMessageHash = hashConversationState(messages.slice(0, 1))
  } else {
    // Normal case: we have at least 3 messages
    // The parent request would have had all messages except the last 2
    // (removing the most recent user message and the assistant response before it)
    parentMessageHash = hashConversationState(messages.slice(0, -2))
  }

  return { currentMessageHash, parentMessageHash }
}

/**
 * Generates a new conversation ID
 * Uses crypto.randomUUID for a v4 UUID
 */
export function generateConversationId(): string {
  return crypto.randomUUID()
}
