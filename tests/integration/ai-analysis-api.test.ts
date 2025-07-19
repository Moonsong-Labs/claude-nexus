import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { Hono } from 'hono'
import type { Pool } from 'pg'
import { analysisRoutes as proxyRoutes } from '../../services/proxy/src/routes/analyses.js'
import { analysisRoutes as dashboardRoutes } from '../../services/dashboard/src/routes/analysis-api.js'
import { ProxyApiClient } from '../../services/dashboard/src/services/api-client.js'
import { ConversationAnalysisStatus } from '../../packages/shared/src/types/ai-analysis.js'
import { initializeAnalysisRateLimiters } from '../../services/proxy/src/middleware/analysis-rate-limit.js'
import type {
  CreateAnalysisResponse,
  GetAnalysisResponse,
  RegenerateAnalysisResponse,
} from '../../packages/shared/src/types/ai-analysis.js'

// Initialize rate limiters for tests
initializeAnalysisRateLimiters()

// Test constants
const TEST_CONVERSATION_ID = '550e8400-e29b-41d4-a716-446655440000'
const TEST_BRANCH_ID = 'main'
const TEST_DOMAIN = 'test.example.com'
const TEST_REQUEST_ID = 'test-request-id'
const TEST_DASHBOARD_KEY = 'test-dashboard-key'
const SERVER_RETRY_ATTEMPTS = 3
const SERVER_RETRY_DELAY_MS = 100
describe('AI Analysis API Integration Tests', () => {
  let proxyApp: Hono
  let dashboardApp: Hono
  let proxyServer: ReturnType<typeof Bun.serve>
  let mockPool: Partial<Pool>
  let proxyPort: number
  let apiClient: ProxyApiClient

  // Helper to create mock query result
  const mockQueryResult = <T = unknown>(rows: T[]) => ({
    rows,
    rowCount: rows.length,
    command: '',
    oid: 0,
    fields: [],
  })

  // Helper to create mock analysis data
  const createMockAnalysisData = () => ({
    summary: 'Test summary',
    keyTopics: ['topic1'],
    sentiment: 'positive' as const,
    userIntent: 'test',
    outcomes: [],
    actionItems: [],
    technicalDetails: {
      frameworks: [],
      issues: [],
      solutions: [],
    },
    conversationQuality: {
      clarity: 'high' as const,
      completeness: 'complete' as const,
      effectiveness: 'effective' as const,
    },
  })

  // Helper to setup mock query handlers
  const setupMockQuery = (handlers: Record<string, () => Promise<unknown>>) => {
    mockPool.query = mock((query: string) => {
      for (const [pattern, handler] of Object.entries(handlers)) {
        if (query.includes(pattern)) {
          return handler()
        }
      }
      return Promise.resolve(mockQueryResult([]))
    })
  }

  // Helper to start server with retry logic
  const startServerWithRetry = async (app: Hono, port: number = 0): Promise<ReturnType<typeof Bun.serve>> => {
    let retries = SERVER_RETRY_ATTEMPTS
    while (retries > 0) {
      try {
        return Bun.serve({
          port,
          fetch: app.fetch,
          hostname: '127.0.0.1', // Bind to localhost only
        })
      } catch (error) {
        retries--
        if (retries === 0) {
          console.error(`Failed to start test server after ${SERVER_RETRY_ATTEMPTS} attempts: ${error}`)
          throw error
        }
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, SERVER_RETRY_DELAY_MS))
      }
    }
    throw new Error('Server start failed')
  }

  // Helper to create mock pool with typed queries
  const createMockPool = (): Partial<Pool> => ({
    query: mock(() => Promise.resolve(mockQueryResult([]))),
  })

  beforeEach(async () => {
    // Create mock pool
    mockPool = createMockPool()

    // Setup proxy app
    proxyApp = new Hono()
    proxyApp.use('*', async (c, next) => {
      c.set('pool', mockPool as Pool)
      c.set('domain', TEST_DOMAIN)
      c.set('requestId', TEST_REQUEST_ID)
      await next()
    })
    proxyApp.route('/api/analyses', proxyRoutes)

    // Start proxy server
    proxyServer = await startServerWithRetry(proxyApp)
    proxyPort = proxyServer.port

    // Create API client
    apiClient = new ProxyApiClient(`http://127.0.0.1:${proxyPort}`, TEST_DASHBOARD_KEY)

    // Setup dashboard app
    dashboardApp = new Hono()
    dashboardApp.use('*', async (c, next) => {
      c.set('apiClient', apiClient)
      await next()
    })
    dashboardApp.route('/api', dashboardRoutes)
  })

  afterEach(() => {
    proxyServer?.stop()
  })

  describe('End-to-End Request Flow', () => {
    it('should create analysis through dashboard to proxy', async () => {
      // Setup proxy mock responses
      setupMockQuery({
        'SELECT id, status FROM conversation_analyses': () => Promise.resolve(mockQueryResult([])),
        'INSERT INTO conversation_analyses': () => Promise.resolve(mockQueryResult([{ id: 123 }])),
        'INSERT INTO analysis_audit_log': () => Promise.resolve(mockQueryResult([])),
      })

      // Make request through dashboard
      const response = await dashboardApp.request('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: TEST_CONVERSATION_ID,
          branchId: TEST_BRANCH_ID,
        }),
      })

      expect(response.status).toBe(201)
      const data = await response.json()
      expect(data.message).toBe('Analysis request created')
      expect(data.analysisId).toBe(123)
      expect(data.status).toBe(ConversationAnalysisStatus.PENDING)

      // Verify proxy was called correctly
      expect(mockPool.query).toHaveBeenCalled()
    })

    it('should retrieve analysis through dashboard from proxy', async () => {
      const mockAnalysis = {
        id: 123,
        status: ConversationAnalysisStatus.COMPLETED,
        analysis_content: '# Analysis\n\nTest content',
        analysis_data: createMockAnalysisData(),
        error_message: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T00:00:00Z',
        prompt_tokens: 1000,
        completion_tokens: 500,
      }

      mockPool.query = mock((query: string) => {
        if (query.includes('SELECT') && query.includes('FROM conversation_analyses')) {
          return Promise.resolve(mockQueryResult([mockAnalysis]))
        }
        if (query.includes('INSERT INTO analysis_audit_log')) {
          return Promise.resolve(mockQueryResult([]))
        }
        return Promise.resolve(mockQueryResult([]))
      })

      const response = await dashboardApp.request(
        `/api/analyses/${TEST_CONVERSATION_ID}/${TEST_BRANCH_ID}`,
        {
          method: 'GET',
        }
      )

      expect(response.status).toBe(200)
      const data: GetAnalysisResponse = await response.json()
      expect(data.id).toBe(123)
      expect(data.conversationId).toBe(TEST_CONVERSATION_ID)
      expect(data.branchId).toBe(TEST_BRANCH_ID)
      expect(data.status).toBe(ConversationAnalysisStatus.COMPLETED)
    })

    it('should handle 404 error propagation', async () => {
      mockPool.query = mock(() => Promise.resolve(mockQueryResult([])))

      const response = await dashboardApp.request(
        `/api/analyses/${TEST_CONVERSATION_ID}/${TEST_BRANCH_ID}`,
        {
          method: 'GET',
        }
      )

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Analysis not found')
    })

    it('should handle 409 conflict propagation', async () => {
      mockPool.query = mock((query: string) => {
        if (query.includes('SELECT id, status FROM conversation_analyses')) {
          return Promise.resolve(
            mockQueryResult([
              {
                id: 456,
                status: ConversationAnalysisStatus.COMPLETED,
              },
            ])
          )
        }
        if (query.includes('INSERT INTO analysis_audit_log')) {
          return Promise.resolve(mockQueryResult([]))
        }
        return Promise.resolve(mockQueryResult([]))
      })

      // This should return the existing analysis, not a 409
      const response = await dashboardApp.request('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: TEST_CONVERSATION_ID,
          branchId: TEST_BRANCH_ID,
        }),
      })

      expect(response.status).toBe(201) // Dashboard always returns 201 for POST success
      const data = await response.json()
      expect(data.message).toBe('Analysis already completed')
      expect(data.analysisId).toBe(456)
    })

    it('should handle regeneration flow', async () => {
      let updateCalled = false
      mockPool.query = mock((query: string) => {
        if (query.includes('SELECT id, status FROM conversation_analyses')) {
          return Promise.resolve(
            mockQueryResult([
              {
                id: 123,
                status: ConversationAnalysisStatus.FAILED,
              },
            ])
          )
        }
        if (query.includes('UPDATE conversation_analyses')) {
          updateCalled = true
          return Promise.resolve(mockQueryResult([]))
        }
        if (query.includes('INSERT INTO analysis_audit_log')) {
          return Promise.resolve(mockQueryResult([]))
        }
        return Promise.resolve(mockQueryResult([]))
      })

      const response = await dashboardApp.request(
        `/api/analyses/${TEST_CONVERSATION_ID}/${TEST_BRANCH_ID}/regenerate`,
        {
          method: 'POST',
        }
      )

      expect(response.status).toBe(200)
      const data: RegenerateAnalysisResponse = await response.json()
      expect(data.message).toBe('Analysis regeneration requested')
      expect(data.analysisId).toBe(123)
      expect(data.status).toBe(ConversationAnalysisStatus.PENDING)
      expect(updateCalled).toBe(true)
    })

    it('should handle validation errors at dashboard level', async () => {
      const response = await dashboardApp.request('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'not-a-uuid',
          branchId: 'main',
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid request data')
      expect(data.details).toBeDefined()

      // Proxy should not have been called
      expect(mockPool.query).not.toHaveBeenCalled()
    })

    it('should handle proxy server errors', async () => {
      // Temporarily stop the proxy server to simulate connection error
      const originalFetch = apiClient.fetch
      apiClient.fetch = async () => {
        throw new Error('Connection refused')
      }

      const response = await dashboardApp.request('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: TEST_CONVERSATION_ID,
          branchId: TEST_BRANCH_ID,
        }),
      })

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toBe('Failed to create analysis')

      // Restore original fetch
      apiClient.fetch = originalFetch
    })
  })

  describe('Response Validation', () => {
    it('should return properly formatted analysis response', async () => {
      const mockAnalysis = {
        id: 123,
        status: ConversationAnalysisStatus.COMPLETED,
        analysis_content: '# Conversation Analysis\n\nDetailed analysis here...',
        analysis_data: {
          summary: 'User discussed implementing a new feature',
          keyTopics: ['feature implementation', 'architecture', 'testing'],
          sentiment: 'positive' as const,
          userIntent: 'Implement new authentication system',
          outcomes: ['Design approved', 'Implementation plan created'],
          actionItems: ['Create database schema', 'Write unit tests'],
          technicalDetails: {
            frameworks: ['React', 'Node.js'],
            issues: ['Token expiration handling'],
            solutions: ['Use refresh tokens'],
          },
          conversationQuality: {
            clarity: 'high' as const,
            completeness: 'complete' as const,
            effectiveness: 'effective' as const,
          },
        },
        error_message: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:05:00Z',
        completed_at: '2024-01-01T00:05:00Z',
        prompt_tokens: 2500,
        completion_tokens: 1500,
      }

      mockPool.query = mock((query: string) => {
        if (query.includes('SELECT') && query.includes('FROM conversation_analyses')) {
          return Promise.resolve(mockQueryResult([mockAnalysis]))
        }
        return Promise.resolve(mockQueryResult([]))
      })

      const response = await dashboardApp.request(
        `/api/analyses/${TEST_CONVERSATION_ID}/${TEST_BRANCH_ID}`,
        {
          method: 'GET',
        }
      )

      expect(response.status).toBe(200)
      const data = await response.json()

      // Validate response structure matches GetAnalysisResponse interface
      expect(data).toMatchObject({
        id: expect.any(Number),
        conversationId: expect.any(String),
        branchId: expect.any(String),
        status: expect.stringMatching(/^(pending|processing|completed|failed)$/),
        content: expect.any(String),
        data: expect.objectContaining({
          summary: expect.any(String),
          keyTopics: expect.arrayContaining([expect.any(String)]),
          sentiment: expect.stringMatching(/^(positive|neutral|negative|mixed)$/),
          userIntent: expect.any(String),
          outcomes: expect.any(Array),
          actionItems: expect.any(Array),
          technicalDetails: expect.objectContaining({
            frameworks: expect.any(Array),
            issues: expect.any(Array),
            solutions: expect.any(Array),
          }),
          conversationQuality: expect.objectContaining({
            clarity: expect.stringMatching(/^(high|medium|low)$/),
            completeness: expect.stringMatching(/^(complete|partial|incomplete)$/),
            effectiveness: expect.stringMatching(
              /^(highly effective|effective|needs improvement)$/
            ),
          }),
        }),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        completedAt: expect.any(String),
      })

      // Token usage is optional in the response
      if (data.tokenUsage) {
        expect(data.tokenUsage).toMatchObject({
          total: expect.any(Number),
        })
      }
    })

    it('should handle pending analysis response', async () => {
      const mockAnalysis = {
        id: 123,
        status: ConversationAnalysisStatus.PENDING,
        analysis_content: null,
        analysis_data: null,
        error_message: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        completed_at: null,
        prompt_tokens: null,
        completion_tokens: null,
      }

      mockPool.query = mock((query: string) => {
        if (query.includes('SELECT') && query.includes('FROM conversation_analyses')) {
          return Promise.resolve(mockQueryResult([mockAnalysis]))
        }
        return Promise.resolve(mockQueryResult([]))
      })

      const response = await dashboardApp.request(
        `/api/analyses/${TEST_CONVERSATION_ID}/${TEST_BRANCH_ID}`,
        {
          method: 'GET',
        }
      )

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.status).toBe(ConversationAnalysisStatus.PENDING)
      expect(data.content).toBeNull() // API returns null for pending analyses
      expect(data.data).toBeNull()
      expect(data.tokenUsage.total).toBe(0)
    })
  })

  describe('Audit Logging', () => {
    it('should create audit logs for all operations', async () => {
      interface AuditLog {
        event_type: string
        outcome: string
        conversation_id: string
        branch_id: string
        domain: string
        request_id: string
      }
      const auditLogs: AuditLog[] = []
      mockPool.query = mock((query: string, params?: unknown[]) => {
        if (query.includes('INSERT INTO analysis_audit_log')) {
          auditLogs.push({
            event_type: params?.[0] as string,
            outcome: params?.[1] as string,
            conversation_id: params?.[2] as string,
            branch_id: params?.[3] as string,
            domain: params?.[4] as string,
            request_id: params?.[5] as string,
          })
          return Promise.resolve(mockQueryResult([]))
        }
        if (query.includes('SELECT id, status FROM conversation_analyses')) {
          return Promise.resolve(mockQueryResult([]))
        }
        if (query.includes('INSERT INTO conversation_analyses')) {
          return Promise.resolve(mockQueryResult([{ id: 123 }]))
        }
        return Promise.resolve(mockQueryResult([]))
      })

      // Create analysis
      await dashboardApp.request('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: TEST_CONVERSATION_ID,
          branchId: TEST_BRANCH_ID,
        }),
      })

      // Should have INITIATED and SUCCESS audit logs
      expect(auditLogs).toHaveLength(2)
      expect(auditLogs[0]).toMatchObject({
        event_type: 'ANALYSIS_REQUEST',
        outcome: 'INITIATED',
        conversation_id: TEST_CONVERSATION_ID,
        branch_id: TEST_BRANCH_ID,
        domain: TEST_DOMAIN,
      })
      expect(auditLogs[1]).toMatchObject({
        event_type: 'ANALYSIS_REQUEST',
        outcome: 'SUCCESS',
      })
    })
  })
})
