import { fromPreTrained } from '@lenml/tokenizer-gemini'
import { ANALYSIS_PROMPT_CONFIG } from '../config/index.js'

// Define a Message type if not already available
export interface Message {
  role: 'user' | 'model'
  content: string
}

// Helper type for tokenized messages
type TokenizedMessage = {
  message: Message
  index: number
  tokenCount: number
}

// Constants for truncation behavior
const TRUNCATION_MARKER = '[...conversation truncated...]'
const CONTENT_TRUNCATION_MARKER = '\n...[CONTENT TRUNCATED]...'

// Lazy-load tokenizer for better performance
let tokenizer: ReturnType<typeof fromPreTrained> | null = null
function getTokenizer() {
  if (!tokenizer) {
    tokenizer = fromPreTrained()
  }
  return tokenizer
}

/**
 * Tokenizes all messages and calculates token counts.
 * @param messages Array of messages to tokenize
 * @returns Array of tokenized messages with metadata
 */
function tokenizeMessages(messages: Message[]): TokenizedMessage[] {
  const tokenizer = getTokenizer()
  return messages.map((msg, i) => ({
    message: msg,
    index: i,
    tokenCount: tokenizer.encode(JSON.stringify(msg)).length,
  }))
}

/**
 * Calculates the total token count for an array of tokenized messages.
 * @param tokenizedMessages Array of tokenized messages
 * @returns Total token count
 */
function calculateTotalTokens(tokenizedMessages: TokenizedMessage[]): number {
  return tokenizedMessages.reduce((sum, msg) => sum + msg.tokenCount, 0)
}

/**
 * Truncates a single message that exceeds the token limit.
 * @param message The message to truncate
 * @param maxTokens Maximum allowed tokens
 * @returns Truncated message
 */
function truncateSingleMessage(message: Message, maxTokens: number): Message {
  const estimatedChars = maxTokens * ANALYSIS_PROMPT_CONFIG.ESTIMATED_CHARS_PER_TOKEN
  return {
    ...message,
    content: message.content.slice(0, estimatedChars) + CONTENT_TRUNCATION_MARKER,
  }
}

/**
 * Adjusts the tail messages to fit within the token limit by removing messages from the start.
 * @param tailSlice Array of tail messages
 * @param maxTokens Maximum allowed tokens
 * @returns Adjusted tail messages that fit within the limit
 */
function adjustTailToFitLimit(
  tailSlice: TokenizedMessage[],
  maxTokens: number
): TokenizedMessage[] {
  const adjustedTail = [...tailSlice]
  let tailTokenCount = calculateTotalTokens(adjustedTail)

  // Remove messages from the start of the tail until it fits
  while (tailTokenCount > maxTokens && adjustedTail.length > 1) {
    const removed = adjustedTail.shift()
    if (removed) {
      tailTokenCount -= removed.tokenCount
    }
  }

  return adjustedTail
}

/**
 * Selects messages that fit within a token budget.
 * @param messages Array of tokenized messages
 * @param tokenBudget Maximum tokens allowed
 * @returns Array of messages that fit within the budget
 */
function selectMessagesWithinBudget(
  messages: TokenizedMessage[],
  tokenBudget: number
): TokenizedMessage[] {
  const selected: TokenizedMessage[] = []
  let currentTokens = 0

  for (const msg of messages) {
    if (currentTokens + msg.tokenCount <= tokenBudget) {
      selected.push(msg)
      currentTokens += msg.tokenCount
    } else {
      break
    }
  }

  return selected
}

/**
 * Assembles the final message list with proper truncation marker placement.
 * @param headMessages Selected head messages
 * @param tailMessages Selected tail messages
 * @param originalMessageCount Total number of original messages
 * @returns Final message array with truncation marker if needed
 */
function assembleMessagesWithTruncationMarker(
  headMessages: TokenizedMessage[],
  tailMessages: TokenizedMessage[],
  originalMessageCount: number
): Message[] {
  // Create a map to handle overlaps and maintain order
  const finalMessageMap = new Map<number, Message>()
  headMessages.forEach(msg => finalMessageMap.set(msg.index, msg.message))
  tailMessages.forEach(msg => finalMessageMap.set(msg.index, msg.message))

  // Sort messages by original index
  const sortedMessages = Array.from(finalMessageMap.entries()).sort(
    ([indexA], [indexB]) => indexA - indexB
  )

  const result: Message[] = []
  let lastIndex = -1
  const truncationMarker: Message = { role: 'user', content: TRUNCATION_MARKER }
  let truncationMarkerInserted = false

  // Insert messages with truncation marker where there are gaps
  for (const [index, message] of sortedMessages) {
    if (lastIndex !== -1 && index > lastIndex + 1) {
      result.push(truncationMarker)
      truncationMarkerInserted = true
    }
    result.push(message)
    lastIndex = index
  }

  // Handle cases where truncation occurred but no marker was inserted
  if (originalMessageCount > result.length && !truncationMarkerInserted && result.length > 0) {
    // Insert at the beginning if no head messages were kept
    if (headMessages.length === 0 && result.length > 0) {
      const firstKeptIndex = sortedMessages[0]?.[0] || 0
      if (firstKeptIndex > 0) {
        result.unshift(truncationMarker)
      }
    } else if (headMessages.length > 0 && headMessages.length < result.length) {
      // Insert after the head messages
      result.splice(headMessages.length, 0, truncationMarker)
    }
  }

  return result
}

/**
 * Truncates a conversation to fit within a token limit, preserving the
 * first and last messages as per the configured strategy.
 *
 * Priority is given to the tail messages. If the combined head and tail
 * still exceed the limit, head messages are dropped. If the tail alone
 * exceeds the limit, tail messages are dropped from the start of the tail.
 *
 * Handles edge cases including:
 * - Conversations shorter than head+tail size (avoids duplication)
 * - Single messages that exceed the token limit
 * - Proper insertion of truncation markers
 */
export function truncateConversation(messages: Message[]): Message[] {
  const { MAX_PROMPT_TOKENS, TRUNCATION_STRATEGY } = ANALYSIS_PROMPT_CONFIG
  const { HEAD_MESSAGES, TAIL_MESSAGES } = TRUNCATION_STRATEGY

  // Step 1: Pre-tokenize all messages for efficiency
  const tokenizedMessages = tokenizeMessages(messages)
  const totalTokenCount = calculateTotalTokens(tokenizedMessages)

  // Early return if all messages fit within the limit
  if (totalTokenCount <= MAX_PROMPT_TOKENS) {
    return messages
  }

  // Step 2: Define head and tail slices from the tokenized array
  const headSlice = tokenizedMessages.slice(0, HEAD_MESSAGES)
  const tailSlice = tokenizedMessages.slice(-TAIL_MESSAGES)

  // Step 3: Adjust tail to fit within token limit
  const adjustedTail = adjustTailToFitLimit(tailSlice, MAX_PROMPT_TOKENS)
  const tailTokenCount = calculateTotalTokens(adjustedTail)

  // Handle special case: single message that's too big
  if (adjustedTail.length === 1 && tailTokenCount > MAX_PROMPT_TOKENS) {
    return [truncateSingleMessage(adjustedTail[0].message, MAX_PROMPT_TOKENS)]
  }

  // Step 4: Fit as much of the head as possible within remaining token budget
  const headTokenBudget = MAX_PROMPT_TOKENS - tailTokenCount
  const finalHead = selectMessagesWithinBudget(headSlice, headTokenBudget)

  // Step 5: Assemble final messages with truncation marker
  return assembleMessagesWithTruncationMarker(finalHead, adjustedTail, tokenizedMessages.length)
}
