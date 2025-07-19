import { AnalysisStatus } from '@claude-nexus/shared/types'

export interface AnalysisCreatedResponse {
  message: string
  analysisId: string
  status: AnalysisStatus
}

export interface AnalysisResponse {
  id: string
  conversationId: string
  branchId: string
  status: AnalysisStatus
  content?: string
  data?: unknown
  error?: string
  createdAt: Date
  updatedAt: Date
  completedAt?: Date
  tokenUsage: {
    prompt?: number
    completion?: number
    total: number
  }
}

export interface AnalysisErrorResponse {
  error: string
  details?: unknown
}