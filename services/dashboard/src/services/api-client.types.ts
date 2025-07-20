/**
 * Type definitions for the Proxy API client
 */

export interface StatsResponse {
  totalRequests: number
  totalTokens: number
  totalInputTokens: number
  totalOutputTokens: number
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
  conversationId?: string
}

export interface RequestsResponse {
  requests: RequestSummary[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

export interface RequestDetails extends RequestSummary {
  requestBody: unknown
  responseBody: unknown
  streamingChunks: Array<{
    chunkIndex: number
    timestamp: string
    data: string
    tokenCount: number
  }>
  parentRequestId?: string
  branchId?: string
  requestHeaders?: Record<string, string>
  responseHeaders?: Record<string, string>
  telemetry?: unknown
  method?: string
  endpoint?: string
  streaming?: boolean
}

export interface DomainsResponse {
  domains: Array<{
    domain: string
    requestCount: number
  }>
}

export interface TokenUsageWindow {
  accountId: string
  domain: string
  model: string
  windowStart: string
  windowEnd: string
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalRequests: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
}

export interface DailyUsage {
  date: string
  accountId: string
  domain: string
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalRequests: number
}

export interface RateLimitConfig {
  id: number
  accountId?: string
  domain?: string
  model?: string
  windowMinutes: number
  tokenLimit: number
  requestLimit?: number
  fallbackModel?: string
  enabled: boolean
}

export interface ConversationSummary {
  conversationId: string
  domain: string
  accountId?: string
  firstMessageTime: string
  lastMessageTime: string
  messageCount: number
  totalTokens: number
  branchCount: number
  subtaskBranchCount?: number
  compactBranchCount?: number
  userBranchCount?: number
  modelsUsed: string[]
  latestRequestId?: string
  latestModel?: string
  latestContextTokens?: number
  isSubtask?: boolean
  parentTaskRequestId?: string
  parentConversationId?: string
  subtaskMessageCount?: number
}

export interface TokenUsageTimeSeriesResponse {
  accountId: string
  windowHours: number
  intervalMinutes: number
  tokenLimit: number
  timeSeries: Array<{
    time: string
    outputTokens: number
    cumulativeUsage: number
    remaining: number
    percentageUsed: number
  }>
}

export interface AccountsTokenUsageResponse {
  accounts: Array<{
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
    miniSeries: Array<{
      time: string
      remaining: number
    }>
  }>
  tokenLimit: number
}
