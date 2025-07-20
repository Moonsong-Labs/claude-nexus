/**
 * Type definitions for conversation-related data structures used in the dashboard.
 *
 * Note: These types use snake_case to match the PostgreSQL database schema.
 * Properties typed as `unknown` represent JSONB fields from the database that
 * can contain various Claude API request/response structures.
 */

import type {
  ClaudeMessage,
  ClaudeMessagesRequest,
  ClaudeMessagesResponse,
} from '@claude-nexus/shared'

/**
 * Represents a single request in a conversation chain.
 * Each request is linked to others via message hashes to form conversation trees.
 */
export interface ConversationRequest {
  /** Unique identifier for this request */
  request_id: string
  /** ISO timestamp when the request was made */
  timestamp: string
  /** Branch identifier within the conversation (e.g., 'main', 'subtask_1') */
  branch_id?: string
  /** Claude model used for this request (e.g., 'claude-3-opus-20240229') */
  model: string
  /** Total tokens consumed (input + output) */
  total_tokens: number
  /** Error message if the request failed */
  error?: string | null
  /** SHA-256 hash of the current message for conversation linking */
  current_message_hash?: string
  /** SHA-256 hash of the parent message for conversation chain building */
  parent_message_hash?: string
  /** Number of input tokens in the request */
  request_tokens?: number
  /** Number of output tokens in the response */
  response_tokens?: number
  /** Duration in seconds (deprecated, use duration_ms) */
  duration?: number
  /** Duration in milliseconds */
  duration_ms?: number
  /** Whether the response contains tool_use blocks */
  hasToolUse?: boolean
  /** Whether the request contains tool_result blocks */
  hasToolResult?: boolean
  /** Summary of message types in the conversation */
  messageTypeSummary?: string[]
  /** Number of messages in this request */
  message_count?: number
  /** ID of the parent task if this is a subtask */
  parent_task_request_id?: string
  /** Whether this request is a subtask spawned by Task tool */
  is_subtask?: boolean
  /** Array of Task tool invocations from the response */
  task_tool_invocation?: unknown[]
  /** Direct link to the parent request in the conversation */
  parent_request_id?: string
  /** Request body sent to Claude API (JSONB) */
  body?: ClaudeMessagesRequest
  /** Last message extracted from the request body */
  last_message?: ClaudeMessage
  /** Response body received from Claude API (JSONB) */
  response_body?: ClaudeMessagesResponse
  /** Account identifier from credential files */
  account_id?: string
}

/**
 * Summary of a conversation including all its branches and requests.
 * Used for displaying conversation overviews in the dashboard.
 */
export interface ConversationSummary {
  /** Unique identifier for the conversation */
  conversation_id: string
  /** Total number of messages across all branches */
  message_count: number
  /** Timestamp of the first message in the conversation */
  first_message: Date
  /** Timestamp of the most recent message */
  last_message: Date
  /** Total tokens consumed across all requests */
  total_tokens: number
  /** List of branch identifiers in this conversation */
  branches: string[]
  /** All requests in this conversation, ordered chronologically */
  requests: ConversationRequest[]
}

/**
 * Represents a branch within a conversation.
 * Conversations can have multiple branches when users explore different paths.
 */
export interface ConversationBranch {
  /** Unique identifier for the conversation */
  conversationId: string
  /** Account identifier from credential files */
  accountId?: string
  /** Branch identifier (e.g., 'main', 'subtask_1', 'compact_143022') */
  branch: string
  /** Total number of branches in this conversation */
  branchCount: number
  /** Number of subtask branches spawned by Task tool */
  subtaskBranchCount: number
  /** Number of compact branches created for context overflow */
  compactBranchCount: number
  /** Number of user-created branches (non-subtask, non-compact) */
  userBranchCount: number
  /** Total messages in this branch */
  messageCount: number
  /** Total tokens consumed in this branch */
  tokens: number
  /** Timestamp of the first message in this branch */
  firstMessage: Date
  /** Timestamp of the most recent message in this branch */
  lastMessage: Date
  /** Domain where this conversation originated */
  domain: string
  /** ID of the most recent request in this branch */
  latestRequestId?: string
  /** Model used in the most recent request */
  latestModel?: string
  /** Context tokens from the most recent request */
  latestContextTokens?: number
  /** Whether this branch is a subtask */
  isSubtask?: boolean
  /** ID of the parent task if this is a subtask branch */
  parentTaskRequestId?: string
  /** Parent conversation ID if this is a subtask */
  parentConversationId?: string
  /** Number of messages if this is a subtask branch */
  subtaskMessageCount?: number
}

/**
 * Display configuration for rendering conversation branches in the UI.
 * Contains styling and labeling information for visual differentiation.
 */
export interface BranchDisplayInfo {
  /** Text to display for the branch (e.g., 'main', 'branch 2 of 3') */
  displayText: string
  /** Tooltip text with additional branch information */
  titleText: string
  /** Whether the conversation has multiple branches */
  hasMultipleBranches: boolean
  /** CSS color value for the branch display */
  color: string
  /** CSS font-weight value for the branch text */
  fontWeight: string
}
