/**
 * Types for AI conversation analysis feature
 */

export interface ConversationAnalysisRequest {
  conversationId: string
  includeBranches?: boolean
  maxTokens?: number // Default: 900000
}

export interface ConversationAnalysisResponse {
  summary: string
  keyTopics: string[]
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed'
  userIntent: string
  outcomes: string[]
  actionItems: string[]
  technicalDetails?: {
    language?: string
    frameworks?: string[]
    errors?: string[]
  }
  conversationQuality?: {
    clarity: number // 1-10
    completeness: number // 1-10
    resolution: boolean
  }
  metadata: {
    messageCount: number
    truncated: boolean
    analyzedAt: string
    tokenCount: number
    modelUsed: string
  }
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  messageNumber?: number
  tools?: Array<{
    name: string
    input?: any
    output?: any
  }>
}

export interface TruncationStrategy {
  maxTokens: number
  preserveFirst: number // 5 messages
  preserveLast: number // 20 messages
  placeholderText: string
}

export interface AnalysisError {
  type: 'conversation_not_found' | 'analysis_failed' | 'invalid_response' | 'token_limit_exceeded'
  message: string
  details?: any
}
