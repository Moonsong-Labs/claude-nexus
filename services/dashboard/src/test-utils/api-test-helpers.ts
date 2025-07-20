import type {
  CreateAnalysisResponse,
  GetAnalysisResponse,
  RegenerateAnalysisResponse,
} from '@claude-nexus/shared'

/**
 * Test constants for consistent test data
 */
export const TEST_CONSTANTS = {
  CONVERSATION_ID: '550e8400-e29b-41d4-a716-446655440000',
  INVALID_UUID: 'invalid-uuid',
  BRANCH_ID: 'main',
  FEATURE_BRANCH_ID: 'feature/new-feature',
  DATE: '2024-01-01T00:00:00Z',
} as const

/**
 * Type for error responses in tests
 */
export interface ErrorResponse {
  error: string
  details?: Array<{ path: string[] }>
}

/**
 * Factory functions for creating mock responses
 */
export const mockResponseFactories = {
  createAnalysis: (overrides?: Partial<CreateAnalysisResponse>): CreateAnalysisResponse => ({
    id: 123,
    conversationId: TEST_CONSTANTS.CONVERSATION_ID,
    branchId: TEST_CONSTANTS.BRANCH_ID,
    status: 'pending',
    createdAt: TEST_CONSTANTS.DATE,
    ...overrides,
  }),

  getAnalysis: (overrides?: Partial<GetAnalysisResponse>): GetAnalysisResponse => ({
    id: 123,
    conversationId: TEST_CONSTANTS.CONVERSATION_ID,
    branchId: TEST_CONSTANTS.BRANCH_ID,
    status: 'completed',
    content: '# Analysis\n\nTest analysis content',
    data: {
      summary: 'Test summary',
      keyTopics: ['topic1', 'topic2'],
      sentiment: 'positive',
      userIntent: 'test intent',
      outcomes: ['outcome1'],
      actionItems: [{ type: 'task' as const, description: 'action1' }],
      promptingTips: [],
      interactionPatterns: {
        promptClarity: 8,
        contextCompleteness: 7,
        followUpEffectiveness: 'good' as const,
        commonIssues: [],
        strengths: [],
      },
      technicalDetails: {
        frameworks: ['framework1'],
        issues: ['issue1'],
        solutions: ['solution1'],
      },
      conversationQuality: {
        clarity: 'high' as const,
        completeness: 'complete' as const,
        effectiveness: 'effective' as const,
      },
    },
    createdAt: TEST_CONSTANTS.DATE,
    updatedAt: TEST_CONSTANTS.DATE,
    completedAt: TEST_CONSTANTS.DATE,
    tokenUsage: {
      prompt: 1000,
      completion: 500,
      total: 1500,
    },
    ...overrides,
  }),

  regenerateAnalysis: (
    overrides?: Partial<RegenerateAnalysisResponse>
  ): RegenerateAnalysisResponse => ({
    id: 123,
    status: 'pending',
    message: 'Analysis regeneration requested',
    ...overrides,
  }),
}

/**
 * Request builder helpers
 */
export const requestBuilders = {
  analysisCreate: (body: object) => ({
    method: 'POST' as const,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),

  analysisGet: () => ({
    method: 'GET' as const,
  }),
}

/**
 * Common assertion helpers
 */
export const assertErrorResponse = async (
  response: Response,
  expectedStatus: number,
  expectedError?: string
): Promise<ErrorResponse | undefined> => {
  expect(response.status).toBe(expectedStatus)
  if (expectedError) {
    const data = (await response.json()) as ErrorResponse
    expect(data.error).toBe(expectedError)
    return data
  }
  return undefined
}

/**
 * Parse response as ErrorResponse type
 */
export const parseErrorResponse = async (response: Response): Promise<ErrorResponse> => {
  const data = await response.json()
  return data as ErrorResponse
}
