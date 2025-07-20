import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { Hono } from 'hono'
import { analysisRoutes } from '../analysis-api.js'
import { ProxyApiClient } from '../../services/api-client.js'
import { HttpError } from '../../errors/HttpError.js'
import {
  TEST_CONSTANTS,
  mockResponseFactories,
  requestBuilders,
  assertErrorResponse,
} from '../../test-utils/api-test-helpers.js'

describe('Analysis API Routes', () => {
  let app: Hono<{
    Variables: {
      apiClient?: ProxyApiClient
    }
  }>
  let mockApiClient: Pick<ProxyApiClient, 'post' | 'get'>

  beforeEach(() => {
    // Create a new Hono app and mount the routes
    app = new Hono()

    // Create mock API client with proper typing
    mockApiClient = {
      post: mock(() => Promise.resolve({} as unknown)) as ProxyApiClient['post'],
      get: mock(() => Promise.resolve({} as unknown)) as ProxyApiClient['get'],
    }

    // Add middleware to inject the API client
    app.use('*', async (c, next) => {
      c.set('apiClient', mockApiClient as ProxyApiClient)
      await next()
    })

    // Mount the routes
    app.route('/api', analysisRoutes)
  })

  describe('POST /api/analyses', () => {
    it('creates analysis request successfully', async () => {
      const mockResponse = mockResponseFactories.createAnalysis()
      mockApiClient.post = mock(() => Promise.resolve(mockResponse)) as ProxyApiClient['post']

      const response = await app.request(
        '/api/analyses',
        requestBuilders.analysisCreate({
          conversationId: TEST_CONSTANTS.CONVERSATION_ID,
          branchId: TEST_CONSTANTS.BRANCH_ID,
        })
      )

      expect(response.status).toBe(201)
      const data = await response.json()
      expect(data).toEqual(mockResponse)
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/analyses', {
        conversationId: TEST_CONSTANTS.CONVERSATION_ID,
        branchId: TEST_CONSTANTS.BRANCH_ID,
      })
    })

    it('returns 400 for invalid UUID format', async () => {
      const response = await app.request(
        '/api/analyses',
        requestBuilders.analysisCreate({
          conversationId: TEST_CONSTANTS.INVALID_UUID,
          branchId: TEST_CONSTANTS.BRANCH_ID,
        })
      )

      const data = await assertErrorResponse(response, 400, 'Invalid request data')
      expect(data?.details).toBeDefined()
      expect(data?.details?.[0].path).toContain('conversationId')
    })

    it('returns 409 when analysis already exists', async () => {
      const conflictError = new HttpError('Analysis already exists', 409, {
        error: 'Analysis already exists',
      })
      mockApiClient.post = mock(() => Promise.reject(conflictError)) as ProxyApiClient['post']

      const response = await app.request(
        '/api/analyses',
        requestBuilders.analysisCreate({
          conversationId: TEST_CONSTANTS.CONVERSATION_ID,
          branchId: TEST_CONSTANTS.BRANCH_ID,
        })
      )

      await assertErrorResponse(response, 409, 'Analysis already exists')
    })

    it('returns 503 when API client is not configured', async () => {
      const appNoClient = new Hono()
      appNoClient.route('/api', analysisRoutes)

      const response = await appNoClient.request(
        '/api/analyses',
        requestBuilders.analysisCreate({
          conversationId: TEST_CONSTANTS.CONVERSATION_ID,
        })
      )

      await assertErrorResponse(response, 503, 'API client not configured')
    })

    it('handles API client failures', async () => {
      mockApiClient.post = mock(() =>
        Promise.reject(new Error('Network error'))
      ) as ProxyApiClient['post']

      const response = await app.request(
        '/api/analyses',
        requestBuilders.analysisCreate({
          conversationId: TEST_CONSTANTS.CONVERSATION_ID,
        })
      )

      await assertErrorResponse(response, 500, 'An internal server error occurred')
    })

    it('handles missing request body', async () => {
      const response = await app.request('/api/analyses', requestBuilders.analysisCreate({}))

      const data = await assertErrorResponse(response, 400, 'Invalid request data')
      expect(data?.details).toBeDefined()
    })

    it('uses default branchId when not provided', async () => {
      const mockResponse = mockResponseFactories.createAnalysis()
      mockApiClient.post = mock(() => Promise.resolve(mockResponse)) as ProxyApiClient['post']

      const response = await app.request(
        '/api/analyses',
        requestBuilders.analysisCreate({
          conversationId: TEST_CONSTANTS.CONVERSATION_ID,
        })
      )

      expect(response.status).toBe(201)
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/analyses', {
        conversationId: TEST_CONSTANTS.CONVERSATION_ID,
        branchId: 'main',
      })
    })
  })

  describe('GET /api/analyses/:conversationId/:branchId', () => {
    it('retrieves analysis successfully', async () => {
      const mockResponse = mockResponseFactories.getAnalysis()
      mockApiClient.get = mock(() => Promise.resolve(mockResponse)) as ProxyApiClient['get']

      const response = await app.request(
        `/api/analyses/${TEST_CONSTANTS.CONVERSATION_ID}/${TEST_CONSTANTS.BRANCH_ID}`,
        requestBuilders.analysisGet()
      )

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual(mockResponse)
      expect(mockApiClient.get).toHaveBeenCalledWith(
        `/api/analyses/${TEST_CONSTANTS.CONVERSATION_ID}/${TEST_CONSTANTS.BRANCH_ID}`
      )
    })

    it('returns 400 for invalid UUID format', async () => {
      const response = await app.request(
        `/api/analyses/${TEST_CONSTANTS.INVALID_UUID}/${TEST_CONSTANTS.BRANCH_ID}`,
        requestBuilders.analysisGet()
      )

      const data = await assertErrorResponse(response, 400, 'Invalid request data')
      expect(data?.details).toBeDefined()
    })

    it('returns 404 when analysis not found', async () => {
      const notFoundError = new HttpError('Analysis not found', 404)
      mockApiClient.get = mock(() => Promise.reject(notFoundError)) as ProxyApiClient['get']

      const response = await app.request(
        `/api/analyses/${TEST_CONSTANTS.CONVERSATION_ID}/${TEST_CONSTANTS.BRANCH_ID}`,
        requestBuilders.analysisGet()
      )

      await assertErrorResponse(response, 404, 'Analysis not found')
    })

    it('returns 503 when API client is not configured', async () => {
      const appNoClient = new Hono()
      appNoClient.route('/api', analysisRoutes)

      const response = await appNoClient.request(
        `/api/analyses/${TEST_CONSTANTS.CONVERSATION_ID}/${TEST_CONSTANTS.BRANCH_ID}`,
        requestBuilders.analysisGet()
      )

      await assertErrorResponse(response, 503, 'API client not configured')
    })

    it('handles API client failures', async () => {
      mockApiClient.get = mock(() =>
        Promise.reject(new Error('Network error'))
      ) as ProxyApiClient['get']

      const response = await app.request(
        `/api/analyses/${TEST_CONSTANTS.CONVERSATION_ID}/${TEST_CONSTANTS.BRANCH_ID}`,
        requestBuilders.analysisGet()
      )

      await assertErrorResponse(response, 500, 'An internal server error occurred')
    })

    it('handles special branch IDs', async () => {
      const mockResponse = mockResponseFactories.getAnalysis({
        branchId: TEST_CONSTANTS.FEATURE_BRANCH_ID,
        status: 'pending',
        completedAt: undefined,
        data: undefined,
        content: undefined,
        tokenUsage: undefined,
      })
      mockApiClient.get = mock(() => Promise.resolve(mockResponse)) as ProxyApiClient['get']

      const response = await app.request(
        `/api/analyses/${TEST_CONSTANTS.CONVERSATION_ID}/${encodeURIComponent(TEST_CONSTANTS.FEATURE_BRANCH_ID)}`,
        requestBuilders.analysisGet()
      )

      expect(response.status).toBe(200)
      expect(mockApiClient.get).toHaveBeenCalledWith(
        `/api/analyses/${TEST_CONSTANTS.CONVERSATION_ID}/${TEST_CONSTANTS.FEATURE_BRANCH_ID}`
      )
    })
  })

  describe('POST /api/analyses/:conversationId/:branchId/regenerate', () => {
    const regenerateUrl = (
      conversationId = TEST_CONSTANTS.CONVERSATION_ID,
      branchId = TEST_CONSTANTS.BRANCH_ID
    ) => `/api/analyses/${conversationId}/${branchId}/regenerate`

    it('regenerates analysis successfully', async () => {
      const mockResponse = mockResponseFactories.regenerateAnalysis()
      mockApiClient.post = mock(() => Promise.resolve(mockResponse)) as ProxyApiClient['post']

      const response = await app.request(regenerateUrl(), { method: 'POST' })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual(mockResponse)
      expect(mockApiClient.post).toHaveBeenCalledWith(regenerateUrl(), undefined)
    })

    it('returns 400 for invalid UUID format', async () => {
      const response = await app.request(regenerateUrl(TEST_CONSTANTS.INVALID_UUID), {
        method: 'POST',
      })

      const data = await assertErrorResponse(response, 400, 'Invalid request data')
      expect(data?.details).toBeDefined()
    })

    it('returns 404 when conversation not found', async () => {
      const notFoundError = new HttpError('Conversation not found', 404)
      mockApiClient.post = mock(() => Promise.reject(notFoundError))

      const response = await app.request(regenerateUrl(), { method: 'POST' })

      await assertErrorResponse(response, 404, 'Conversation not found')
    })

    it('returns 503 when API client is not configured', async () => {
      const appNoClient = new Hono()
      appNoClient.route('/api', analysisRoutes)

      const response = await appNoClient.request(regenerateUrl(), { method: 'POST' })

      await assertErrorResponse(response, 503, 'API client not configured')
    })

    it('handles API client failures', async () => {
      mockApiClient.post = mock(() =>
        Promise.reject(new Error('Network error'))
      ) as ProxyApiClient['post']

      const response = await app.request(regenerateUrl(), { method: 'POST' })

      await assertErrorResponse(response, 500, 'An internal server error occurred')
    })

    it('regenerates analysis with custom prompt', async () => {
      const mockResponse = mockResponseFactories.regenerateAnalysis({
        id: 124,
        message: 'Analysis regeneration with custom prompt requested',
      })
      mockApiClient.post = mock(() => Promise.resolve(mockResponse)) as ProxyApiClient['post']

      const customPrompt = 'Focus on performance bottlenecks'
      const response = await app.request(
        regenerateUrl(),
        requestBuilders.analysisCreate({ customPrompt })
      )

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual(mockResponse)
      expect(mockApiClient.post).toHaveBeenCalledWith(regenerateUrl(), { customPrompt })
    })
  })
})
