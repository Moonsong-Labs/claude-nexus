/**
 * Type definitions for API routes
 */

// Response types
export interface StatsResponse {
  totalRequests: number
  totalTokens: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheCreationTokens: number
  totalCacheReadTokens: number
  averageResponseTime: number
  errorCount: number
  activeDomains: number
  requestsByModel: Record<string, number>
  requestsByType: Record<string, number>
}

export interface RequestSummary {
  requestId: string
  domain: string
  model: string
  timestamp: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  durationMs: number
  responseStatus: number
  error?: string
  requestType?: string
}

export interface RequestDetails extends RequestSummary {
  requestBody: unknown
  responseBody: unknown
  usageData?: unknown
  streamingChunks: StreamingChunk[]
  conversationId?: string
  branchId?: string
  parentRequestId?: string
}

export interface StreamingChunk {
  chunkIndex: number
  timestamp: string
  data: string
  tokenCount: number
}

export interface PaginationInfo {
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export interface Domain {
  domain: string
  requestCount: number
}

export interface ConversationSummary {
  conversationId: string
  domain: string
  accountId: string
  firstMessageTime: string
  lastMessageTime: string
  messageCount: number
  totalTokens: number
  branchCount: number
  subtaskBranchCount: number
  compactBranchCount: number
  userBranchCount: number
  modelsUsed: string[]
  latestRequestId: string
  latestModel: string
  latestContextTokens: number
  isSubtask: boolean
  parentTaskRequestId?: string
  parentConversationId?: string
  subtaskMessageCount: number
}

export interface TokenUsageWindow {
  accountId: string
  outputTokens: number
  inputTokens: number
  requestCount: number
  window: {
    start: Date
    end: Date
    hours: number
  }
  domain?: string
  model?: string
}

export interface DailyTokenUsage {
  date: string
  outputTokens: number
  inputTokens: number
  totalTokens: number
  requestCount: number
}

export interface TimeSeriesPoint {
  time: string
  outputTokens: number
  cumulativeUsage: number
  remaining: number
  percentageUsed: number
}

export interface AccountTokenUsage {
  accountId: string
  outputTokens: number
  inputTokens: number
  requestCount: number
  lastRequestTime: string
  remainingTokens: number
  percentageUsed: number
  domains: Array<{
    domain: string
    outputTokens: number
    requests: number
  }>
  miniSeries?: Array<{
    time: Date
    remaining: number
  }>
}

export interface HourlyUsageData {
  hour: string
  count: number
}

// Database query result types
export interface StatsQueryResult {
  total_requests: string
  total_tokens: string
  total_input_tokens: string
  total_output_tokens: string
  total_cache_creation_tokens: string
  total_cache_read_tokens: string
  avg_response_time: string
  error_count: string
  active_domains: string
}

export interface ModelCountResult {
  model: string
  count: string
}

export interface RequestTypeCountResult {
  request_type: string
  count: string
}