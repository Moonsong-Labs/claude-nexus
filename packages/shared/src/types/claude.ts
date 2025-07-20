/**
 * TypeScript interfaces for Claude API types
 *
 * This file contains type definitions for the Claude Messages API,
 * including request/response formats and streaming events.
 */

// ============================================================================
// Request Types
// ============================================================================

/**
 * Roles for messages in a Claude conversation
 */
export type ClaudeRole = 'user' | 'assistant' | 'system'

/**
 * Content block types that can appear in messages
 */
export type ClaudeContentType = 'text' | 'image' | 'tool_use' | 'tool_result'

/**
 * Base interface for all content blocks
 */
export interface ClaudeContentBase {
  type: ClaudeContentType
}

/**
 * Text content block
 */
export interface ClaudeTextContent extends ClaudeContentBase {
  type: 'text'
  text: string
}

/**
 * Image content block with base64-encoded data
 */
export interface ClaudeImageContent extends ClaudeContentBase {
  type: 'image'
  source: {
    type: 'base64'
    media_type: string // e.g., "image/jpeg", "image/png"
    data: string // base64-encoded image data
  }
}

/**
 * Tool use content block for function calling
 */
export interface ClaudeToolUseContent extends ClaudeContentBase {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown> // Tool-specific arguments
}

/**
 * Tool result content block for function responses
 */
export interface ClaudeToolResultContent extends ClaudeContentBase {
  type: 'tool_result'
  tool_use_id: string
  content?: string | ClaudeContent[]
  is_error?: boolean
}

/**
 * Union type for all content block types
 */
export type ClaudeContent =
  | ClaudeTextContent
  | ClaudeImageContent
  | ClaudeToolUseContent
  | ClaudeToolResultContent

/**
 * Message format for Claude conversations
 */
export interface ClaudeMessage {
  role: ClaudeRole
  content: string | ClaudeContent[]
}

/**
 * Tool definition for function calling
 */
export interface ClaudeTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
}

/**
 * System prompt with optional cache control
 */
export interface ClaudeSystemPrompt {
  type: 'text'
  text: string
  cache_control?: {
    type: 'ephemeral'
  }
}

/**
 * Tool choice options for controlling function calling behavior
 */
export interface ClaudeToolChoice {
  type: 'auto' | 'any' | 'tool'
  name?: string // Required when type is 'tool'
}

/**
 * Main request format for Claude Messages API
 */
export interface ClaudeMessagesRequest {
  model: string
  messages: ClaudeMessage[]
  system?: string | ClaudeSystemPrompt[]
  max_tokens: number
  metadata?: {
    user_id?: string
  }
  stop_sequences?: string[]
  stream?: boolean
  temperature?: number // 0-1
  top_k?: number
  top_p?: number
  tools?: ClaudeTool[]
  tool_choice?: ClaudeToolChoice
  thinking?: {
    budget_tokens?: number
    [key: string]: any // Allow additional thinking fields
  }
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Token usage information
 */
export interface ClaudeUsage {
  input_tokens: number
  output_tokens: number
  cache_tokens?: number // Tokens retrieved from cache
  cache_creation_input_tokens?: number // Tokens used to create cache
  cache_read_input_tokens?: number // Tokens read from cache
}

/**
 * Reasons why the model stopped generating
 */
export type ClaudeStopReason = 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null

/**
 * Main response format for Claude Messages API
 */
export interface ClaudeMessagesResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: ClaudeContent[]
  model: string
  stop_reason: ClaudeStopReason
  stop_sequence: string | null
  usage: ClaudeUsage
  error?: {
    type: string
    message: string
  }
}

/**
 * Error response format
 */
export interface ClaudeErrorResponse {
  error: {
    type: string
    message: string
  }
}

// ============================================================================
// Streaming Event Types
// ============================================================================

/**
 * Base interface for all streaming events
 */
export interface ClaudeStreamEventBase {
  type: string
}

/**
 * Event sent at the start of a streaming response
 */
export interface ClaudeMessageStartEvent extends ClaudeStreamEventBase {
  type: 'message_start'
  message: Omit<ClaudeMessagesResponse, 'content'> & {
    content: ClaudeContent[] // Initially empty
  }
}

/**
 * Event sent when a new content block begins
 */
export interface ClaudeContentBlockStartEvent extends ClaudeStreamEventBase {
  type: 'content_block_start'
  index: number
  content_block: ClaudeContent
}

/**
 * Delta types for streaming content updates
 */
export interface ClaudeTextDelta {
  type: 'text_delta'
  text: string
}

export interface ClaudeInputJsonDelta {
  type: 'input_json_delta'
  partial_json: string
}

export type ClaudeContentDelta = ClaudeTextDelta | ClaudeInputJsonDelta

/**
 * Event sent for incremental content updates
 */
export interface ClaudeContentBlockDeltaEvent extends ClaudeStreamEventBase {
  type: 'content_block_delta'
  index: number
  delta: ClaudeContentDelta
}

/**
 * Event sent when a content block is complete
 */
export interface ClaudeContentBlockStopEvent extends ClaudeStreamEventBase {
  type: 'content_block_stop'
  index: number
}

/**
 * Event sent for message-level updates
 */
export interface ClaudeMessageDeltaEvent extends ClaudeStreamEventBase {
  type: 'message_delta'
  delta: {
    stop_reason?: ClaudeStopReason
    stop_sequence?: string
  }
  usage?: ClaudeUsage // Cumulative usage
}

/**
 * Event sent when the message is complete
 */
export interface ClaudeMessageStopEvent extends ClaudeStreamEventBase {
  type: 'message_stop'
}

/**
 * Periodic ping event to keep connection alive
 */
export interface ClaudePingEvent extends ClaudeStreamEventBase {
  type: 'ping'
}

/**
 * Error event in streaming
 */
export interface ClaudeErrorEvent extends ClaudeStreamEventBase {
  type: 'error'
  error: {
    type: string
    message: string
  }
}

/**
 * Union type for all streaming events
 */
export type ClaudeStreamEvent =
  | ClaudeMessageStartEvent
  | ClaudeContentBlockStartEvent
  | ClaudeContentBlockDeltaEvent
  | ClaudeContentBlockStopEvent
  | ClaudeMessageDeltaEvent
  | ClaudeMessageStopEvent
  | ClaudePingEvent
  | ClaudeErrorEvent
