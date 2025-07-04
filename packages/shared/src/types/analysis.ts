/**
 * Types for the conversation analysis feature
 */

export type AnalysisJobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface AnalysisJob {
  id: string // UUID
  conversation_id: string // UUID
  status: AnalysisJobStatus
  attempts: number
  last_error?: string | null
  created_at: Date
  updated_at: Date
  processing_started_at?: Date | null
  completed_at?: Date | null
  duration_ms?: number | null
  prompt_tokens?: number | null
  completion_tokens?: number | null
}

export interface ConversationAnalysis {
  id: string // UUID
  conversation_id: string // UUID
  analysis_result?: any | null // TODO: Define more specific type for Gemini output
  model_used?: string | null
  prompt_tokens?: number | null
  completion_tokens?: number | null
  total_tokens?: number | null
  created_at: Date
  updated_at: Date
}

// Gemini API types
export interface GeminiAnalysisResult {
  summary: string
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed'
  key_topics?: string[]
  action_items?: string[]
  insights?: string[]
  metadata?: Record<string, any>
}

export interface GeminiUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

// Database row types
export interface ApiRequestRow {
  request_id: string
  timestamp: string | Date
  body: any
  response_body: any
  model: string
  input_tokens: number
  output_tokens: number
  message_count: number
}

// Message content types
export interface MessageContent {
  type: 'text' | 'tool_use' | 'tool_result' | string
  text?: string
  name?: string
  id?: string
  [key: string]: any
}

export interface Message {
  role: string
  content: string | MessageContent[]
}
