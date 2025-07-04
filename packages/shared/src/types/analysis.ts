import { z } from 'zod'

// Analysis status enum
export enum AnalysisStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// Zod schemas for validation
export const createAnalysisSchema = z.object({
  conversationId: z.string().uuid(),
  branchId: z.string(),
})

export const analysisParamsSchema = z.object({
  conversationId: z.string().uuid(),
  branchId: z.string(),
})

// TypeScript types
export type CreateAnalysisRequest = z.infer<typeof createAnalysisSchema>

export type AnalysisParams = z.infer<typeof analysisParamsSchema>

export interface Analysis {
  id: string
  conversationId: string
  branchId: string
  status: AnalysisStatus
  content?: string
  metadata?: {
    totalTokens?: number
    processingTime?: number
    model?: string
    error?: string
  }
  createdAt: Date
  updatedAt: Date
  completedAt?: Date
}

export interface CreateAnalysisResponse {
  id: string
  conversationId: string
  branchId: string
  status: AnalysisStatus
  message: string
}

export interface GetAnalysisResponse extends Analysis {
  conversationDetails?: {
    domain: string
    accountId: string
    messageCount: number
    totalTokens: number
  }
}

export interface RegenerateAnalysisResponse {
  id: string
  conversationId: string
  branchId: string
  status: AnalysisStatus
  message: string
  previousAnalysisId?: string
}

// Error responses
export interface AnalysisErrorResponse {
  error: {
    code: string
    message: string
    details?: any
  }
}

// Common error codes
export const AnalysisErrorCodes = {
  ANALYSIS_EXISTS: 'analysis_exists',
  ANALYSIS_NOT_FOUND: 'analysis_not_found',
  CONVERSATION_NOT_FOUND: 'conversation_not_found',
  INVALID_PARAMS: 'invalid_params',
  PROCESSING_ERROR: 'processing_error',
  QUEUE_ERROR: 'queue_error',
} as const
