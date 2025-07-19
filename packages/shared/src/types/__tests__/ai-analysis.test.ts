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
  type AnalysisConflictResponse,
  type AnalysisStatus,
} from '../ai-analysis.js'

// Test Data Factory Functions
function createValidAnalysis(overrides?: Partial<ConversationAnalysis>): ConversationAnalysis {
  return {
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
    ],
    technicalDetails: {
      frameworks: ['Express.js', 'jsonwebtoken'],
      issues: ['Token expiration handling', 'Refresh token strategy'],
      solutions: ['Use short-lived access tokens', 'Implement refresh token rotation'],
      toolUsageEfficiency: 'optimal',
      contextWindowManagement: 'efficient',
    },
    conversationQuality: {
      clarity: 'high',
      clarityImprovement: 'Consider breaking down complex questions into smaller parts',
      completeness: 'complete',
      completenessImprovement: 'All aspects were covered adequately',
      effectiveness: 'effective',
      effectivenessImprovement: 'Continue with current approach',
    },
    interactionPatterns: {
      promptClarity: 7,
      contextCompleteness: 8,
      followUpEffectiveness: 'good',
      commonIssues: ['Vague security requirements', 'Missing context'],
      strengths: ['Clear intent', 'Good follow-up questions'],
    },
    ...overrides,
  }
}

function createMinimalAnalysis(): ConversationAnalysis {
  return {
    summary: 'Brief conversation',
    keyTopics: [],
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
      commonIssues: [],
      strengths: [],
    },
  }
}

// Test Constants
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const INVALID_UUID = 'not-a-valid-uuid'
const DEFAULT_BRANCH = 'main'

describe('AI Analysis Types and Schemas', () => {
  describe('ConversationAnalysisSchema', () => {
    it('should validate complete analysis data', () => {
      const validData = createValidAnalysis()
      const result = ConversationAnalysisSchema.safeParse(validData)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(validData)
      }
    })

    it('should validate minimal analysis data', () => {
      const minimalData = createMinimalAnalysis()
      const result = ConversationAnalysisSchema.safeParse(minimalData)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(minimalData)
      }
    })

    it('should validate analysis with all optional fields populated', () => {
      const fullData = createValidAnalysis({
        technicalDetails: {
          frameworks: ['Express.js', 'jsonwebtoken'],
          issues: ['Token expiration handling'],
          solutions: ['Use short-lived access tokens'],
          toolUsageEfficiency: 'optimal',
          contextWindowManagement: 'efficient',
        },
        conversationQuality: {
          clarity: 'high',
          clarityImprovement: 'Break down complex questions',
          completeness: 'complete',
          completenessImprovement: 'All aspects covered',
          effectiveness: 'highly effective',
          effectivenessImprovement: 'Continue current approach',
        },
        promptingTips: [
          {
            category: 'specificity',
            issue: 'Security requirements vague',
            suggestion: 'Be more specific about requirements',
            example: 'Include specific auth methods needed',
          },
        ],
      })
      const result = ConversationAnalysisSchema.safeParse(fullData)
      expect(result.success).toBe(true)
    })

    // Invalid enum value tests using parameterized approach
    const invalidEnumCases = [
      {
        field: 'sentiment',
        invalidValue: 'very-positive',
        validValues: ['positive', 'neutral', 'negative', 'mixed'],
        path: ['sentiment'],
      },
      {
        field: 'conversationQuality.clarity',
        invalidValue: 'very-high',
        validValues: ['high', 'medium', 'low'],
        path: ['conversationQuality', 'clarity'],
      },
      {
        field: 'conversationQuality.completeness',
        invalidValue: 'mostly-complete',
        validValues: ['complete', 'partial', 'incomplete'],
        path: ['conversationQuality', 'completeness'],
      },
      {
        field: 'conversationQuality.effectiveness',
        invalidValue: 'super-effective',
        validValues: ['highly effective', 'effective', 'needs improvement'],
        path: ['conversationQuality', 'effectiveness'],
      },
      {
        field: 'interactionPatterns.followUpEffectiveness',
        invalidValue: 'perfect',
        validValues: ['excellent', 'good', 'needs_improvement'],
        path: ['interactionPatterns', 'followUpEffectiveness'],
      },
    ]

    invalidEnumCases.forEach(({ field, invalidValue, path }) => {
      it(`should reject invalid ${field} value: "${invalidValue}"`, () => {
        const invalidData = createMinimalAnalysis()
        // Set nested field value
        const fieldParts = field.split('.')
        let obj = invalidData as Record<string, any>
        for (let i = 0; i < fieldParts.length - 1; i++) {
          obj = obj[fieldParts[i]]
        }
        obj[fieldParts[fieldParts.length - 1]] = invalidValue

        const result = ConversationAnalysisSchema.safeParse(invalidData)
        expect(result.success).toBe(false)
        if (!result.success) {
          const issue = result.error.issues.find(issue => path.every((p, i) => issue.path[i] === p))
          expect(issue).toBeDefined()
          expect(issue?.message).toContain(`Invalid enum value`)
        }
      })
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
      const dataWithEmptyArrays = createMinimalAnalysis()
      const result = ConversationAnalysisSchema.safeParse(dataWithEmptyArrays)
      expect(result.success).toBe(true)
    })

    // Boundary value tests for numeric fields
    const numericBoundaryTests = [
      { field: 'promptClarity', min: 0, max: 10, path: ['interactionPatterns', 'promptClarity'] },
      {
        field: 'contextCompleteness',
        min: 0,
        max: 10,
        path: ['interactionPatterns', 'contextCompleteness'],
      },
    ]

    numericBoundaryTests.forEach(({ field, min, max }) => {
      it(`should accept ${field} at minimum boundary (${min})`, () => {
        const data = createMinimalAnalysis()
        const patterns = data.interactionPatterns as Record<string, any>
        patterns[field.includes('prompt') ? 'promptClarity' : 'contextCompleteness'] = min

        const result = ConversationAnalysisSchema.safeParse(data)
        expect(result.success).toBe(true)
      })

      it(`should accept ${field} at maximum boundary (${max})`, () => {
        const data = createMinimalAnalysis()
        const patterns = data.interactionPatterns as Record<string, any>
        patterns[field.includes('prompt') ? 'promptClarity' : 'contextCompleteness'] = max

        const result = ConversationAnalysisSchema.safeParse(data)
        expect(result.success).toBe(true)
      })

      it(`should reject ${field} below minimum (${min - 1})`, () => {
        const data = createMinimalAnalysis()
        const patterns = data.interactionPatterns as Record<string, any>
        patterns[field.includes('prompt') ? 'promptClarity' : 'contextCompleteness'] = min - 1

        const result = ConversationAnalysisSchema.safeParse(data)
        expect(result.success).toBe(false)
      })

      it(`should reject ${field} above maximum (${max + 1})`, () => {
        const data = createMinimalAnalysis()
        const patterns = data.interactionPatterns as Record<string, any>
        patterns[field.includes('prompt') ? 'promptClarity' : 'contextCompleteness'] = max + 1

        const result = ConversationAnalysisSchema.safeParse(data)
        expect(result.success).toBe(false)
      })
    })
  })

  describe('CreateAnalysisRequestSchema', () => {
    it('should validate request with conversationId and branchId', () => {
      const validRequest: CreateAnalysisRequest = {
        conversationId: VALID_UUID,
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
        conversationId: VALID_UUID,
      }

      const result = CreateAnalysisRequestSchema.safeParse(requestWithoutBranch)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.branchId).toBe(DEFAULT_BRANCH)
      }
    })

    it('should reject invalid UUID format', () => {
      const invalidRequest = {
        conversationId: INVALID_UUID,
        branchId: DEFAULT_BRANCH,
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
        branchId: DEFAULT_BRANCH,
      }

      const result = CreateAnalysisRequestSchema.safeParse(invalidRequest)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('conversationId')
      }
    })

    // UUID format validation tests
    const uuidTestCases = [
      { uuid: '550e8400-e29b-41d4-a716-446655440000', description: 'standard v4' },
      { uuid: '550E8400-E29B-41D4-A716-446655440000', description: 'uppercase' },
      { uuid: '550e8400-e29b-11d4-a716-446655440000', description: 'version 1' },
      { uuid: '550e8400-e29b-21d4-a716-446655440000', description: 'version 2' },
      { uuid: '550e8400-e29b-31d4-a716-446655440000', description: 'version 3' },
      { uuid: '550e8400-e29b-41d4-a716-446655440000', description: 'version 4' },
      { uuid: '550e8400-e29b-51d4-a716-446655440000', description: 'version 5' },
    ]

    uuidTestCases.forEach(({ uuid, description }) => {
      it(`should accept ${description} UUID format`, () => {
        const result = CreateAnalysisRequestSchema.safeParse({
          conversationId: uuid,
        })
        expect(result.success).toBe(true)
      })
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
        conversationId: VALID_UUID,
        branchId: DEFAULT_BRANCH,
        status: 'pending',
        createdAt: '2024-01-01T00:00:00Z',
      }

      // Type safety check - this should compile without errors
      const _id: number = response.id
      const _conversationId: string = response.conversationId
      const _branchId: string = response.branchId
      const _status: AnalysisStatus = response.status
      const _createdAt: string = response.createdAt

      expect(response).toMatchObject({
        id: expect.any(Number),
        conversationId: expect.any(String),
        branchId: expect.any(String),
        status: expect.stringMatching(/^(pending|processing|completed|failed)$/),
        createdAt: expect.any(String),
      })
    })

    it('should validate GetAnalysisResponse with completed analysis', () => {
      const response: GetAnalysisResponse = {
        id: 123,
        conversationId: VALID_UUID,
        branchId: DEFAULT_BRANCH,
        status: 'completed',
        content: '# Analysis\nDetailed content here',
        data: createMinimalAnalysis(),
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T00:00:00Z',
        tokenUsage: {
          prompt: 1000,
          completion: 500,
          total: 1500,
        },
      }

      expect(response.data).toBeDefined()
      expect(response.error).toBeUndefined()
      expect(response.status).toBe('completed')
    })

    it('should validate GetAnalysisResponse with failed status', () => {
      const response: GetAnalysisResponse = {
        id: 123,
        conversationId: VALID_UUID,
        branchId: DEFAULT_BRANCH,
        status: 'failed',
        error: 'Analysis failed due to timeout',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      expect(response.data).toBeUndefined()
      expect(response.content).toBeUndefined()
      expect(response.error).toBeDefined()
      expect(response.status).toBe('failed')
    })

    it('should validate GetAnalysisResponse with optional fields', () => {
      const responseWithOptionals: GetAnalysisResponse = {
        id: 123,
        conversationId: VALID_UUID,
        branchId: DEFAULT_BRANCH,
        status: 'completed',
        content: 'Analysis content',
        data: createValidAnalysis(),
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T00:00:00Z',
        tokenUsage: {
          prompt: null,
          completion: null,
          total: 0,
        },
      }

      expect(responseWithOptionals.tokenUsage).toBeDefined()
      expect(responseWithOptionals.completedAt).toBeDefined()
    })

    it('should validate RegenerateAnalysisResponse structure', () => {
      const response: RegenerateAnalysisResponse = {
        id: 123,
        status: 'pending',
        message: 'Analysis regeneration requested',
      }

      expect(response).toMatchObject({
        id: expect.any(Number),
        status: expect.stringMatching(/^(pending|processing|completed|failed)$/),
        message: expect.any(String),
      })
    })

    it('should validate AnalysisConflictResponse structure', () => {
      const conflictResponse: AnalysisConflictResponse = {
        error: 'Analysis already exists for this conversation and branch',
        analysis: {
          id: 123,
          conversationId: VALID_UUID,
          branchId: DEFAULT_BRANCH,
          status: 'completed',
          content: 'Existing analysis',
          data: createMinimalAnalysis(),
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      }

      expect(conflictResponse.error).toBeDefined()
      expect(conflictResponse.analysis).toBeDefined()
      expect(conflictResponse.analysis.id).toBe(123)
    })
  })

  describe('Type Safety and Schema Validation', () => {
    it('should enforce type safety for ConversationAnalysis', () => {
      const analysis = createMinimalAnalysis()

      // TypeScript compile-time type checks
      const _summary: string = analysis.summary
      const _keyTopics: string[] = analysis.keyTopics
      const _sentiment: 'positive' | 'neutral' | 'negative' | 'mixed' = analysis.sentiment
      const _clarity: 'high' | 'medium' | 'low' = analysis.conversationQuality.clarity

      // Runtime checks
      expect(typeof analysis.summary).toBe('string')
      expect(Array.isArray(analysis.keyTopics)).toBe(true)
      expect(['positive', 'neutral', 'negative', 'mixed']).toContain(analysis.sentiment)
    })

    it('should correctly infer types from Zod schema', () => {
      const testData = createValidAnalysis({
        actionItems: [
          { type: 'task' as const, description: 'Implement JWT', priority: 'high' as const },
          {
            type: 'task' as const,
            description: 'Set up refresh tokens',
            priority: 'medium' as const,
          },
        ],
      })

      const parsed = ConversationAnalysisSchema.parse(testData)

      // Verify Zod inference maintains correct types
      expect(parsed).toEqual(testData)
      expect(parsed.sentiment).toBe('positive')
      expect(parsed.conversationQuality.clarity).toBe('high')
    })

    it('should validate that all enum types are properly constrained', () => {
      // This test ensures our type definitions match the Zod schema
      const analysis = createValidAnalysis()

      // Test sentiment enum
      const sentiments: Array<ConversationAnalysis['sentiment']> = [
        'positive',
        'neutral',
        'negative',
        'mixed',
      ]
      expect(sentiments).toContain(analysis.sentiment)

      // Test clarity enum
      const clarities: Array<ConversationAnalysis['conversationQuality']['clarity']> = [
        'high',
        'medium',
        'low',
      ]
      expect(clarities).toContain(analysis.conversationQuality.clarity)

      // Test effectiveness enum
      const effectiveness: Array<ConversationAnalysis['conversationQuality']['effectiveness']> = [
        'highly effective',
        'effective',
        'needs improvement',
      ]
      expect(effectiveness).toContain(analysis.conversationQuality.effectiveness)
    })

    it('should handle edge cases for string and array fields', () => {
      // Test empty strings
      const withEmptyStrings = createMinimalAnalysis({
        summary: '',
        userIntent: '',
      })
      const emptyStringResult = ConversationAnalysisSchema.safeParse(withEmptyStrings)
      expect(emptyStringResult.success).toBe(true)

      // Test very long strings
      const longString = 'a'.repeat(1000)
      const withLongStrings = createMinimalAnalysis({
        summary: longString,
        userIntent: longString,
      })
      const longStringResult = ConversationAnalysisSchema.safeParse(withLongStrings)
      expect(longStringResult.success).toBe(true)

      // Test large arrays
      const largeArray = Array(100).fill('topic')
      const withLargeArrays = createMinimalAnalysis({
        keyTopics: largeArray,
      })
      const largeArrayResult = ConversationAnalysisSchema.safeParse(withLargeArrays)
      expect(largeArrayResult.success).toBe(true)
    })
  })
})
