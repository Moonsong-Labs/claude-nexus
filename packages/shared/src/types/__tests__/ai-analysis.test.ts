import { describe, it, expect } from 'bun:test'
import {
  ConversationAnalysisSchema,
  CreateAnalysisRequestSchema,
  ConversationAnalysisStatus,
  type ConversationAnalysis,
  type CreateAnalysisRequest,
  type CreateAnalysisResponse,
  type GetAnalysisResponse,
  type RegenerateAnalysisResponse,
} from '../ai-analysis.js'

describe('AI Analysis Types and Schemas', () => {
  describe('ConversationAnalysisSchema', () => {
    it('should validate complete analysis data', () => {
      const validData: ConversationAnalysis = {
        summary: 'User discussed implementing a new authentication system',
        keyTopics: ['authentication', 'security', 'JWT tokens'],
        sentiment: 'positive',
        userIntent: 'Implement secure authentication for web application',
        outcomes: ['Design pattern selected', 'Implementation plan created'],
        actionItems: [
          { type: 'task', description: 'Set up JWT library', priority: 'high' },
          {
            type: 'prompt_improvement',
            description: 'Create user database schema',
            priority: 'medium',
          },
        ],
        promptingTips: [
          {
            category: 'specificity',
            issue: 'Security requirements were too vague',
            suggestion:
              'Be more specific about security requirements, such as authentication methods and authorization levels',
            example:
              'I need to implement JWT authentication with role-based access control for admin and user roles',
          },
          {
            category: 'context',
            issue: 'Missing implementation context',
            suggestion: 'Include example code or current implementation attempts',
          },
          {
            category: 'structure',
            issue: 'Questions about error handling were unclear',
            suggestion: 'Ask about specific error scenarios and handling strategies',
          },
        ],
        technicalDetails: {
          frameworks: ['Express.js', 'jsonwebtoken'],
          issues: ['Token expiration handling', 'Refresh token strategy'],
          solutions: ['Use short-lived access tokens', 'Implement refresh token rotation'],
        },
        conversationQuality: {
          clarity: 'high',
          completeness: 'complete',
          effectiveness: 'effective',
        },
        interactionPatterns: {
          promptClarity: 7,
          contextCompleteness: 8,
          followUpEffectiveness: 'good',
          commonIssues: ['Vague security requirements', 'Missing context'],
          strengths: ['Clear intent', 'Good follow-up questions'],
        },
      }

      const result = ConversationAnalysisSchema.safeParse(validData)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(validData)
      }
    })

    it('should reject invalid sentiment values', () => {
      const invalidData = {
        summary: 'Test summary',
        keyTopics: ['topic1'],
        sentiment: 'very-positive', // Invalid
        userIntent: 'test',
        outcomes: [],
        actionItems: [],
        promptingTips: [],
        technicalDetails: {
          frameworks: [],
          issues: [],
          solutions: [],
        },
        conversationQuality: {
          clarity: 'high',
          completeness: 'complete',
          effectiveness: 'effective',
        },
        interactionPatterns: {
          promptClarity: 5,
          contextCompleteness: 5,
          followUpEffectiveness: 'good',
          commonIssues: [],
          strengths: [],
        },
      }

      const result = ConversationAnalysisSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('sentiment')
      }
    })

    it('should reject invalid clarity values', () => {
      const invalidData = {
        summary: 'Test summary',
        keyTopics: ['topic1'],
        sentiment: 'positive',
        userIntent: 'test',
        outcomes: [],
        actionItems: [],
        promptingTips: [],
        technicalDetails: {
          frameworks: [],
          issues: [],
          solutions: [],
        },
        conversationQuality: {
          clarity: 'very-high', // Invalid
          completeness: 'complete',
          effectiveness: 'effective',
        },
        interactionPatterns: {
          promptClarity: 5,
          contextCompleteness: 5,
          followUpEffectiveness: 'good',
          commonIssues: [],
          strengths: [],
        },
      }

      const result = ConversationAnalysisSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('clarity')
      }
    })

    it('should reject missing required fields', () => {
      const incompleteData = {
        summary: 'Test summary',
        keyTopics: ['topic1'],
        // Missing other required fields
      }

      const result = ConversationAnalysisSchema.safeParse(incompleteData)
      expect(result.success).toBe(false)
    })

    it('should validate empty arrays', () => {
      const dataWithEmptyArrays: ConversationAnalysis = {
        summary: 'Brief conversation',
        keyTopics: [], // Empty is valid
        sentiment: 'neutral',
        userIntent: 'Quick question',
        outcomes: [],
        actionItems: [],
        promptingTips: [],
        technicalDetails: {
          frameworks: [],
          issues: [],
          solutions: [],
        },
        conversationQuality: {
          clarity: 'medium',
          completeness: 'partial',
          effectiveness: 'needs improvement',
        },
        interactionPatterns: {
          promptClarity: 5,
          contextCompleteness: 4,
          followUpEffectiveness: 'needs_improvement',
          commonIssues: ['Insufficient context', 'Unclear requirements'],
          strengths: ['Direct questions'],
        },
      }

      const result = ConversationAnalysisSchema.safeParse(dataWithEmptyArrays)
      expect(result.success).toBe(true)
    })
  })

  describe('CreateAnalysisRequestSchema', () => {
    it('should validate request with conversationId and branchId', () => {
      const validRequest: CreateAnalysisRequest = {
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        branchId: 'feature/new-branch',
      }

      const result = CreateAnalysisRequestSchema.safeParse(validRequest)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(validRequest)
      }
    })

    it('should provide default branchId when not specified', () => {
      const requestWithoutBranch = {
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
      }

      const result = CreateAnalysisRequestSchema.safeParse(requestWithoutBranch)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.branchId).toBe('main')
      }
    })

    it('should reject invalid UUID format', () => {
      const invalidRequest = {
        conversationId: 'not-a-valid-uuid',
        branchId: 'main',
      }

      const result = CreateAnalysisRequestSchema.safeParse(invalidRequest)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('conversationId')
        expect(result.error.issues[0].message).toContain('Invalid uuid')
      }
    })

    it('should reject missing conversationId', () => {
      const invalidRequest = {
        branchId: 'main',
      }

      const result = CreateAnalysisRequestSchema.safeParse(invalidRequest)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('conversationId')
      }
    })

    it('should accept various valid UUID formats', () => {
      const uuidFormats = [
        '550e8400-e29b-41d4-a716-446655440000',
        '550E8400-E29B-41D4-A716-446655440000', // Uppercase
        '550e8400-e29b-11d4-a716-446655440000', // Version 1
        '550e8400-e29b-21d4-a716-446655440000', // Version 2
        '550e8400-e29b-31d4-a716-446655440000', // Version 3
        '550e8400-e29b-41d4-a716-446655440000', // Version 4
        '550e8400-e29b-51d4-a716-446655440000', // Version 5
      ]

      for (const uuid of uuidFormats) {
        const result = CreateAnalysisRequestSchema.safeParse({
          conversationId: uuid,
        })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('ConversationAnalysisStatus Enum', () => {
    it('should have correct values', () => {
      expect(ConversationAnalysisStatus.PENDING).toBe('pending')
      expect(ConversationAnalysisStatus.PROCESSING).toBe('processing')
      expect(ConversationAnalysisStatus.COMPLETED).toBe('completed')
      expect(ConversationAnalysisStatus.FAILED).toBe('failed')
    })

    it('should have all expected values', () => {
      const values = Object.values(ConversationAnalysisStatus)
      expect(values).toHaveLength(4)
      expect(values).toContain('pending')
      expect(values).toContain('processing')
      expect(values).toContain('completed')
      expect(values).toContain('failed')
    })
  })

  describe('Response Type Structures', () => {
    it('should validate CreateAnalysisResponse structure', () => {
      const response: CreateAnalysisResponse = {
        id: 123,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        branchId: 'main',
        status: 'pending',
        createdAt: '2024-01-01T00:00:00Z',
      }

      // Verify all required fields are present
      expect(response.id).toBeDefined()
      expect(response.conversationId).toBeDefined()
      expect(response.branchId).toBeDefined()
      expect(response.status).toBeDefined()
      expect(response.createdAt).toBeDefined()
    })

    it('should validate GetAnalysisResponse with completed analysis', () => {
      const response: GetAnalysisResponse = {
        id: 123,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        branchId: 'main',
        status: 'completed',
        analysis: {
          content: '# Analysis\nDetailed content here',
          data: {
            summary: 'Test summary',
            keyTopics: ['topic1'],
            sentiment: 'positive',
            userIntent: 'test',
            outcomes: [],
            actionItems: [],
            promptingTips: [],
            interactionPatterns: {
              promptClarity: 5,
              contextCompleteness: 5,
              followUpEffectiveness: 'good',
              commonIssues: [],
              strengths: [],
            },
            technicalDetails: {
              frameworks: [],
              issues: [],
              solutions: [],
            },
            conversationQuality: {
              clarity: 'high',
              completeness: 'complete',
              effectiveness: 'effective',
            },
          },
          modelUsed: 'gemini-2.0-flash-exp',
          generatedAt: '2024-01-01T00:00:00Z',
          processingDurationMs: 5000,
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      // Verify structure
      expect(response.analysis).toBeDefined()
      expect(response.analysis?.data).toBeDefined()
      expect(response.error).toBeUndefined()
    })

    it('should validate GetAnalysisResponse with failed status', () => {
      const response: GetAnalysisResponse = {
        id: 123,
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        branchId: 'main',
        status: 'failed',
        error: 'Analysis failed due to timeout',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      // Verify structure
      expect(response.analysis).toBeUndefined()
      expect(response.error).toBeDefined()
    })

    it('should validate RegenerateAnalysisResponse structure', () => {
      const response: RegenerateAnalysisResponse = {
        id: 123,
        status: 'pending',
        message: 'Analysis regeneration requested',
      }

      // Verify all required fields
      expect(response.id).toBeDefined()
      expect(response.status).toBeDefined()
      expect(response.message).toBeDefined()
    })
  })

  describe('Type Safety', () => {
    it('should enforce type safety for ConversationAnalysis', () => {
      // This test verifies TypeScript type inference works correctly
      const analysis: ConversationAnalysis = {
        summary: 'Test',
        keyTopics: ['topic'],
        sentiment: 'positive',
        userIntent: 'test',
        outcomes: [],
        actionItems: [],
        promptingTips: [],
        interactionPatterns: {
          promptClarity: 5,
          contextCompleteness: 4,
          followUpEffectiveness: 'needs_improvement',
          commonIssues: ['Insufficient context', 'Unclear requirements'],
          strengths: ['Direct questions'],
        },
        technicalDetails: {
          frameworks: [],
          issues: [],
          solutions: [],
        },
        conversationQuality: {
          clarity: 'high',
          completeness: 'complete',
          effectiveness: 'effective',
        },
      }

      // TypeScript should enforce these types at compile time
      expect(typeof analysis.summary).toBe('string')
      expect(Array.isArray(analysis.keyTopics)).toBe(true)
      expect(['positive', 'neutral', 'negative', 'mixed']).toContain(analysis.sentiment)
    })

    it('should infer correct types from Zod schema', () => {
      // Test that the inferred type matches our expectations
      const testData = {
        summary: 'Test summary with sufficient detail',
        keyTopics: ['authentication', 'security', 'best practices'],
        sentiment: 'positive' as const,
        userIntent: 'Learn about secure authentication',
        outcomes: ['Understanding achieved', 'Plan created'],
        actionItems: [
          { type: 'task', description: 'Implement JWT', priority: 'high' },
          { type: 'task', description: 'Set up refresh tokens', priority: 'medium' },
        ],
        promptingTips: [
          {
            category: 'specificity',
            issue: 'Security requirements not detailed enough',
            suggestion: 'Be specific about your security requirements',
          },
          {
            category: 'context',
            issue: 'Missing version information',
            suggestion: 'Include version information for better compatibility advice',
          },
        ],
        interactionPatterns: {
          promptClarity: 7,
          contextCompleteness: 8,
          followUpEffectiveness: 'good',
          commonIssues: ['Vague security requirements', 'Missing context'],
          strengths: ['Clear intent', 'Good follow-up questions'],
        },
        technicalDetails: {
          frameworks: ['Express', 'Passport.js'],
          issues: ['Session management'],
          solutions: ['Use Redis for sessions'],
        },
        conversationQuality: {
          clarity: 'high' as const,
          completeness: 'complete' as const,
          effectiveness: 'effective' as const,
        },
      }

      const parsed = ConversationAnalysisSchema.parse(testData)

      // Verify the parsed result maintains the correct structure
      expect(parsed).toEqual(testData)
      expect(parsed.sentiment).toBe('positive')
      expect(parsed.conversationQuality.clarity).toBe('high')
    })
  })
})
