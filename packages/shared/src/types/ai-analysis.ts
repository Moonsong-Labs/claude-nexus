import { z } from 'zod'
import { uuidSchema } from '../utils/validation.js'

// Define the Zod schema for runtime validation
export const ConversationAnalysisSchema = z.object({
  summary: z
    .string()
    .describe('A concise, neutral summary of the entire conversation (2-4 sentences).'),
  keyTopics: z.array(z.string()).describe('A list of the main subjects discussed (3-5 topics).'),
  sentiment: z
    .enum(['positive', 'neutral', 'negative', 'mixed'])
    .describe("The overall sentiment of the user's messages."),
  userIntent: z.string().describe('The primary goal or question the user was trying to address.'),
  outcomes: z
    .array(z.string())
    .describe('Key conclusions, resolutions, or final answers provided.'),
  actionItems: z
    .array(z.object({
      type: z.enum(['task', 'prompt_improvement', 'follow_up']).describe('The type of action item.'),
      description: z.string().describe('Clear description of the action to take.'),
      priority: z.enum(['high', 'medium', 'low']).optional().describe('Priority level of the action.'),
    }))
    .describe('A list of clear, actionable tasks including prompt improvements.'),
  promptingTips: z
    .array(z.object({
      category: z.enum(['clarity', 'context', 'structure', 'specificity', 'efficiency']).describe('Category of the prompting issue.'),
      issue: z.string().describe('Specific issue identified in the user prompts.'),
      suggestion: z.string().describe('Actionable suggestion to improve future prompts.'),
      example: z.string().optional().describe('Example of an improved prompt.'),
    }))
    .describe('Specific tips to help the user write better prompts in future interactions.'),
  interactionPatterns: z
    .object({
      promptClarity: z.number().min(0).max(10).describe('Score for how clear the user prompts were (0-10).'),
      contextCompleteness: z.number().min(0).max(10).describe('Score for how complete the context provided was (0-10).'),
      followUpEffectiveness: z.enum(['excellent', 'good', 'needs_improvement']).describe('How well the user followed up on responses.'),
      commonIssues: z.array(z.string()).describe('Common patterns that could be improved.'),
      strengths: z.array(z.string()).describe('Positive patterns to continue.'),
    })
    .describe('Analysis of interaction patterns and communication effectiveness.'),
  technicalDetails: z
    .object({
      frameworks: z.array(z.string()).describe('Technologies, frameworks, or libraries mentioned.'),
      issues: z.array(z.string()).describe('Technical problems or errors encountered.'),
      solutions: z.array(z.string()).describe('Proposed or implemented solutions.'),
      toolUsageEfficiency: z.enum(['optimal', 'good', 'could_improve']).optional().describe('How efficiently tools were requested/used.'),
      contextWindowManagement: z.enum(['efficient', 'acceptable', 'wasteful']).optional().describe('How well context window was managed.'),
    })
    .describe('Specific technical elements identified in the conversation.'),
  conversationQuality: z
    .object({
      clarity: z
        .enum(['high', 'medium', 'low'])
        .describe('How clear and well-structured the conversation was.'),
      clarityImprovement: z.string().optional().describe('Specific suggestions to improve clarity.'),
      completeness: z
        .enum(['complete', 'partial', 'incomplete'])
        .describe("Whether the user's goals were fully addressed."),
      completenessImprovement: z.string().optional().describe('What was missing and how to address it.'),
      effectiveness: z
        .enum(['highly effective', 'effective', 'needs improvement'])
        .describe('Overall effectiveness of the interaction.'),
      effectivenessImprovement: z.string().optional().describe('Key changes to improve effectiveness.'),
    })
    .describe('Assessment of the conversation quality with improvement suggestions.'),
})

// Infer the TypeScript type from the Zod schema
export type ConversationAnalysis = z.infer<typeof ConversationAnalysisSchema>

// API Request/Response types for conversation analysis endpoints

export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed'

export enum ConversationAnalysisStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// POST /api/analyses request body
export const CreateAnalysisRequestSchema = z.object({
  conversationId: uuidSchema,
  branchId: z.string().default('main'),
})

export type CreateAnalysisRequest = z.infer<typeof CreateAnalysisRequestSchema>

// POST /api/analyses response
export interface CreateAnalysisResponse {
  id: number
  conversationId: string
  branchId: string
  status: AnalysisStatus
  createdAt: string
}

// GET /api/analyses/:conversationId/:branchId response
export interface GetAnalysisResponse {
  id: number
  conversationId: string
  branchId: string
  status: AnalysisStatus
  content?: string // Markdown formatted analysis
  data?: ConversationAnalysis // Structured data
  error?: string // Only present if status is 'failed'
  createdAt: string
  updatedAt: string
  completedAt?: string
  tokenUsage?: {
    prompt: number | null
    completion: number | null
    total: number
  }
}

// POST /api/analyses/:conversationId/:branchId/regenerate response
export interface RegenerateAnalysisResponse {
  id: number
  status: AnalysisStatus
  message: string
}

// Error response for 409 Conflict when analysis already exists
export interface AnalysisConflictResponse {
  error: string
  analysis: GetAnalysisResponse
}
