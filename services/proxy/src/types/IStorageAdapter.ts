import type {
  ClaudeMessage,
  ClaudeMessagesRequest,
  ClaudeMessagesResponse,
} from '@claude-nexus/shared'

/**
 * Request data structure for storing API requests
 */
export interface StorageRequestData {
  id: string
  domain: string
  accountId?: string
  timestamp: Date
  method: string
  path: string
  headers: Record<string, string>
  body: ClaudeMessagesRequest | Record<string, unknown>
  request_type: string
  model: string
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  usage_data?: Record<string, unknown>
  tool_call_count?: number
  processing_time?: number
  status_code?: number
  currentMessageHash?: string
  parentMessageHash?: string | null
  conversationId?: string
  branchId?: string
  systemHash?: string | null
  messageCount?: number
  parentTaskRequestId?: string
  isSubtask?: boolean
  taskToolInvocation?: Record<string, unknown>
  parentRequestId?: string
}

/**
 * Response data structure for storing API responses
 */
export interface StorageResponseData {
  request_id: string
  status_code: number
  headers: Record<string, string>
  body: ClaudeMessagesResponse | Record<string, unknown>
  timestamp: Date
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  usage_data?: Record<string, unknown>
  tool_call_count?: number
  processing_time?: number
}

/**
 * Result of conversation linking operation
 */
export interface ConversationLinkResult {
  conversationId: string | null
  currentMessageHash: string
  parentMessageHash: string | null
  systemHash: string | null
  branchId: string
  parentRequestId?: string | null
  isSubtask?: boolean
  parentTaskRequestId?: string
  subtaskSequence?: number
}

/**
 * Storage adapter interface for persisting API requests and responses
 */
export interface IStorageAdapter {
  /**
   * Stores API request data
   */
  storeRequest(data: StorageRequestData): Promise<void>

  /**
   * Stores API response data
   */
  storeResponse(data: StorageResponseData): Promise<void>

  /**
   * Stores a streaming response chunk
   */
  storeStreamingChunk(requestId: string, chunkIndex: number, data: unknown): Promise<void>

  /**
   * Finds a conversation by parent message hash
   */
  findConversationByParentHash(parentHash: string, beforeTimestamp: Date): Promise<string | null>

  /**
   * Links a request to its conversation thread
   */
  linkConversation(
    domain: string,
    messages: ClaudeMessage[],
    systemPrompt:
      | string
      | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[]
      | undefined,
    requestId: string,
    referenceTime: Date
  ): Promise<ConversationLinkResult>

  /**
   * Processes Task tool invocations in a response
   */
  processTaskToolInvocations(
    requestId: string,
    responseBody: ClaudeMessagesResponse | Record<string, unknown>,
    domain: string
  ): Promise<void>

  /**
   * Gracefully closes the adapter and releases resources
   */
  close(): Promise<void>
}
