/**
 * Type definitions for conversation-related data
 */

export interface ConversationRequest {
  request_id: string
  timestamp: string
  branch_id?: string
  model: string
  total_tokens: number
  error?: any
  current_message_hash?: string
  parent_message_hash?: string
  request_tokens?: number
  response_tokens?: number
  duration?: number
  duration_ms?: number
  hasToolUse?: boolean
  hasToolResult?: boolean
  messageTypeSummary?: string[]
  message_count?: number
  parent_task_request_id?: string
  is_subtask?: boolean
  task_tool_invocation?: any
  parent_request_id?: string
  body?: any
  last_message?: any
  response_body?: any
  account_id?: string
}

export interface ConversationSummary {
  conversation_id: string
  message_count: number
  first_message: Date
  last_message: Date
  total_tokens: number
  branches: string[]
  requests: ConversationRequest[]
}

export interface ApiRequest extends ConversationRequest {
  domain: string
  status_code?: number
  request_body?: any
  response_body?: any
  path?: string
  method?: string
  headers?: Record<string, string>
  input_tokens?: number
  output_tokens?: number
  request_type?: string
  tool_call_count?: number
  conversation_id?: string
}

export interface ConversationBranch {
  conversationId: string
  accountId?: string
  branch: string
  branchCount: number
  subtaskBranchCount: number
  compactBranchCount: number
  userBranchCount: number
  messageCount: number
  tokens: number
  firstMessage: Date
  lastMessage: Date
  domain: string
  latestRequestId?: string
  latestModel?: string
  latestContextTokens?: number
  isSubtask?: boolean
  parentTaskRequestId?: string
  parentConversationId?: string
  subtaskMessageCount?: number
}

export interface BranchDisplayInfo {
  displayText: string
  titleText: string
  hasMultipleBranches: boolean
  color: string
  fontWeight: string
}
