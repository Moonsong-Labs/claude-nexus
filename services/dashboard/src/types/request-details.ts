/**
 * Type definitions for request details page
 */

import type { ParsedMessage } from '../utils/conversation.js'

export interface RequestDetailsData {
  requestId: string
  domain: string
  model: string
  timestamp: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  durationMs: number | null
  responseStatus: number
  error: string | null
  requestType: string
  conversationId: string | null
  branchId: string | null
  parentRequestId: string | null
  requestBody: Record<string, unknown> | null
  responseBody: Record<string, unknown> | null
  streamingChunks: StreamingChunk[]
  requestHeaders?: Record<string, string>
  responseHeaders?: Record<string, string>
  telemetry?: Record<string, unknown>
  method: string
  endpoint: string
  streaming: boolean
}

export interface StreamingChunk {
  chunkIndex: number
  timestamp: string
  data: string
  tokenCount: number
}

export interface NavigationButtonProps {
  messageIndex: number
  userMessageIndices: number[]
  currentUserIndex: number
}

export interface CopyButtonProps {
  text: string
  title: string
  onSuccess?: () => void
  onError?: (error: Error) => void
}

export interface MessageDisplayProps {
  message: ParsedMessage
  index: number
  totalMessages: number
  navigationButtons?: string
}

export interface ViewToggleState {
  currentView: 'conversation' | 'raw' | 'headers'
  hideTools: boolean
}
