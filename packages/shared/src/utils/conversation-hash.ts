/**
 * Conversation hashing utilities
 *
 * IMPORTANT: ConversationLinker is the source of truth for message hashing.
 * This file only contains:
 * - hashSystemPrompt: Used by ConversationLinker for system prompt hashing
 * - hashMessagesOnly: Wrapper around ConversationLinker.computeMessageHash
 * - extractMessageHashes: Dual hash system for conversation tracking
 * - generateConversationId: UUID generation for new conversations
 */

import { createHash } from 'crypto'
import type { ClaudeMessage } from '../types/claude.js'
import { stripSystemReminder } from './system-reminder.js'
import { ConversationLinker } from './conversation-linker.js'

// Constants for commonly used strings
const CLI_TOOL_PREFIX =
  'You are an interactive CLI tool that helps users with software engineering tasks'

/**
 * Filters out system reminder content from an array of content blocks
 * @param content - Array of content blocks
 * @returns Filtered content blocks
 * @private
 */
function filterSystemReminders(content: any[]): any[] {
  return content.filter(item => {
    // Skip text items that contain system-reminder blocks
    if (item.type === 'text' && typeof item.text === 'string') {
      // If the entire text is just a system-reminder, filter it out
      const stripped = stripSystemReminder(item.text)
      return stripped.trim().length > 0
    }
    return true
  })
}

/**
 * Deduplicates tool_use and tool_result items by their IDs
 * @param content - Array of content blocks
 * @returns Deduplicated content blocks
 * @private
 */
function deduplicateToolItems(content: any[]): any[] {
  const seenToolUseIds = new Set<string>()
  const seenToolResultIds = new Set<string>()

  return content.filter(item => {
    if (item.type === 'tool_use' && item.id) {
      if (seenToolUseIds.has(item.id)) {
        return false // Skip duplicate
      }
      seenToolUseIds.add(item.id)
      return true
    }
    if (item.type === 'tool_result' && item.tool_use_id) {
      if (seenToolResultIds.has(item.tool_use_id)) {
        return false // Skip duplicate
      }
      seenToolResultIds.add(item.tool_use_id)
      return true
    }
    return true // Keep all other types
  })
}

/**
 * Normalizes a single content item to a string representation
 * @param item - Content item to normalize
 * @param index - Index of the item in the array
 * @returns String representation of the item
 * @private
 */
function normalizeContentItem(item: any, index: number): string {
  switch (item.type) {
    case 'text': {
      // Strip system-reminder blocks from text content before hashing
      const cleanText = stripSystemReminder(item.text || '')
      return `[${index}]text:${cleanText.trim().replace(/\r\n/g, '\n')}`
    }
    case 'image': {
      // For images, hash the data to avoid storing large base64 strings
      const imageHash = item.source?.data
        ? createHash('sha256').update(item.source.data).digest('hex')
        : 'no-data'
      return `[${index}]image:${item.source?.media_type || 'unknown'}:${imageHash}`
    }
    case 'tool_use':
      return `[${index}]tool_use:${item.name}:${item.id}:${JSON.stringify(item.input || {})}`
    case 'tool_result': {
      let resultContent =
        typeof item.content === 'string' ? item.content : JSON.stringify(item.content || [])
      // Remove system-reminder blocks from tool_result content
      if (typeof item.content === 'string') {
        resultContent = stripSystemReminder(item.content).trim()
      }
      return `[${index}]tool_result:${item.tool_use_id}:${resultContent}`
    }
    default: {
      // For unknown types, only include type and essential content
      const essentialItem = { type: item.type, content: item.content, text: item.text }
      return `[${index}]${item.type}:${JSON.stringify(essentialItem)}`
    }
  }
}

/**
 * Normalizes message content to a consistent string format for hashing
 * @param content - String or array of content blocks
 * @returns Normalized string representation
 * @private
 */
function normalizeMessageContent(content: string | any[]): string {
  if (typeof content === 'string') {
    // Normalize string content to match array format for consistency
    // This ensures "hello" and [{type: "text", text: "hello"}] produce the same hash
    return `[0]text:${content.trim().replace(/\r\n/g, '\n')}`
  }

  // For array content, create a deterministic string representation
  const filteredContent = filterSystemReminders(content)
  const dedupedContent = deduplicateToolItems(filteredContent)

  // DO NOT sort - preserve the original order as it's semantically important
  return dedupedContent.map((item, index) => normalizeContentItem(item, index)).join('|')
}

// Regex patterns for removing volatile content from system prompts
const REGEX_PATTERNS = {
  // Matches <transient_context>...</transient_context> blocks
  TRANSIENT_CONTEXT: /<transient_context>[\s\S]*?<\/transient_context>/g,

  // Matches "gitStatus:" followed by content until double newline or end
  GIT_STATUS: /gitStatus:[\s\S]*?(?:\n\n|$)/g,

  // Matches standalone "Status:" sections containing git information
  STATUS_SECTION: /(?:^|\n)Status:\s*\n(?:[^\n]*\n)*?(?=\n\n|$)/gm,

  // Matches "Current branch:" lines
  CURRENT_BRANCH: /(?:^|\n)Current branch:.*$/gm,

  // Matches "Main branch:" lines (with optional text before colon)
  MAIN_BRANCH: /(?:^|\n)Main branch.*:.*$/gm,

  // Matches "Recent commits:" sections including all commit lines
  RECENT_COMMITS: /(?:^|\n)Recent commits:.*\n(?:(?!^\n).*\n)*/gm,

  // Matches 3 or more consecutive newlines
  MULTIPLE_NEWLINES: /\n{3,}/g,
}

/**
 * Removes transient/volatile context from system prompts to ensure stable hashing
 * @param systemPrompt - The system prompt content
 * @returns The stable part of the system prompt
 */
function getStableSystemPrompt(systemPrompt: string | any[]): string {
  if (typeof systemPrompt === 'string') {
    // Special case: If the system prompt starts with the CLI tool text,
    // only include this stable snippet to avoid dynamic content differences
    if (systemPrompt.trim().startsWith(CLI_TOOL_PREFIX)) {
      // Return just the stable prefix, ignoring all the dynamic content that follows
      return CLI_TOOL_PREFIX
    }

    let stable = systemPrompt

    // Remove transient_context blocks (future-proofing)
    stable = stable.replace(REGEX_PATTERNS.TRANSIENT_CONTEXT, '')

    // Remove system-reminder blocks
    stable = stripSystemReminder(stable)

    // Remove git-related sections that change frequently
    stable = stable.replace(REGEX_PATTERNS.GIT_STATUS, '\n\n')
    stable = stable.replace(REGEX_PATTERNS.STATUS_SECTION, '\n')
    stable = stable.replace(REGEX_PATTERNS.CURRENT_BRANCH, '')
    stable = stable.replace(REGEX_PATTERNS.MAIN_BRANCH, '')
    stable = stable.replace(REGEX_PATTERNS.RECENT_COMMITS, '\n')

    // Clean up multiple consecutive newlines
    stable = stable.replace(REGEX_PATTERNS.MULTIPLE_NEWLINES, '\n\n')

    return stable.trim()
  }

  // For array content, check if any text item contains the CLI tool prefix
  if (Array.isArray(systemPrompt)) {
    for (const item of systemPrompt) {
      if (
        item.type === 'text' &&
        typeof item.text === 'string' &&
        item.text.trim().startsWith(CLI_TOOL_PREFIX)
      ) {
        // Found CLI tool text - return normalized content with just the first item and the CLI prefix
        const stableContent = [
          systemPrompt[0], // Keep the first item (usually "You are Claude Code...")
          { type: 'text', text: CLI_TOOL_PREFIX }, // Replace the second item with just the prefix
        ]
        return normalizeMessageContent(stableContent)
      }
    }
  }

  // For array content without CLI prefix, apply normalization which already filters system-reminders
  return normalizeMessageContent(systemPrompt)
}

/**
 * Hashes only the messages without system prompt
 *
 * This function delegates to ConversationLinker which is the source of truth
 * for message hashing logic. It creates a minimal ConversationLinker instance
 * just to access the computeMessageHash method.
 *
 * @param messages - Array of Claude messages to hash
 * @returns SHA-256 hash of the normalized message content
 */
export function hashMessagesOnly(messages: ClaudeMessage[]): string {
  // Create a no-op logger for hash computation
  const mockLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }

  // Use ConversationLinker as the source of truth for hashing
  const linker = new ConversationLinker(
    async () => [], // Dummy query executor - we only need the hash method
    mockLogger,
    async () => null, // Dummy compact search executor
    undefined, // requestByIdExecutor
    undefined, // subtaskQueryExecutor
    undefined // subtaskSequenceQueryExecutor
  )
  return linker.computeMessageHash(messages)
}

/**
 * Hashes only the system prompt after removing volatile content
 *
 * Removes transient context like git status, branch info, and recent commits
 * to ensure stable hashing across different states of the same conversation.
 *
 * @param system - System prompt as string or array of content blocks
 * @returns SHA-256 hash of the stable system prompt content, or null if empty
 */
export function hashSystemPrompt(system?: string | any[]): string | null {
  if (!system) {
    return null
  }

  const stableSystemContent = getStableSystemPrompt(system)
  if (!stableSystemContent) {
    return null
  }

  return createHash('sha256').update(stableSystemContent, 'utf8').digest('hex')
}

/**
 * Extracts the current and parent conversation state hashes (dual hash system)
 *
 * For Claude conversations, we need to handle the pattern where:
 * - First request: [user_msg]
 * - Second request: [user_msg, assistant_response, user_msg2]
 * - Third request: [user_msg, assistant_response, user_msg2, assistant_response2, user_msg3]
 *
 * To find the parent, we look for a request whose full message list matches
 * a prefix of our current messages (excluding the last 2 messages - the latest exchange)
 *
 * NEW: Returns separate hashes for messages and system to enable conversation linking
 * that survives system prompt changes
 *
 * @param messages - Array of messages from the request
 * @param system - Optional system prompt (string or array of content blocks)
 * @returns Object containing message hashes and system hash
 */
export function extractMessageHashes(
  messages: ClaudeMessage[],
  system?: string | any[]
): {
  currentMessageHash: string
  parentMessageHash: string | null
  systemHash: string | null
} {
  if (!messages || messages.length === 0) {
    throw new Error('Cannot extract hashes from empty messages array')
  }

  // Hash messages only (no system) for conversation linking
  const currentMessageHash = hashMessagesOnly(messages)

  // Hash system separately for tracking context changes
  const systemHash = hashSystemPrompt(system)

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
    parentMessageHash = hashMessagesOnly(messages.slice(0, 1))
  } else {
    // Normal case: we have at least 3 messages
    // The parent request would have had all messages except the last 2
    // (removing the most recent user message and the assistant response before it)
    parentMessageHash = hashMessagesOnly(messages.slice(0, -2))
  }

  return { currentMessageHash, parentMessageHash, systemHash }
}

/**
 * Generates a new conversation ID using crypto.randomUUID
 *
 * @returns A v4 UUID string for uniquely identifying conversations
 */
export function generateConversationId(): string {
  return crypto.randomUUID()
}
