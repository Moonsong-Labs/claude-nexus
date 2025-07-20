import { describe, it, expect, beforeEach, afterEach, mock, Mock, spyOn } from 'bun:test'
import { MetricsService, MetricsConfig, TrackRequestParams } from '../src/services/MetricsService'
import { ProxyRequest } from '../src/domain/entities/ProxyRequest'
import { ProxyResponse } from '../src/domain/entities/ProxyResponse'
import { RequestContextFactory } from '../src/domain/factories/RequestContextFactory'
import { RequestContext } from '../src/domain/value-objects/RequestContext'
import { StorageAdapter } from '../src/storage/StorageAdapter'
import { TokenUsageService } from '../src/services/TokenUsageService'
import { tokenTracker } from '../src/services/tokenTracker'
import { ConversationData } from '@claude-nexus/shared'

// Properly typed mock for StorageAdapter
interface MockStorageAdapter extends StorageAdapter {
  storeRequest: Mock<(data: any) => Promise<void>>
  storeResponse: Mock<(data: any) => Promise<void>>
  storeStreamingChunk: Mock<(data: any) => Promise<void>>
  processTaskToolInvocations: Mock<
    (requestId: string, response: any, domain: string) => Promise<void>
  >
  close: Mock<() => Promise<void>>
}

// Create test helpers
function createTestRequest(
  options: {
    model?: string
    messages?: any[]
    maxTokens?: number
  } = {}
): ProxyRequest {
  const {
    model = 'claude-3-opus-20240229',
    messages = [
      { role: 'system', content: 'System prompt 1' },
      { role: 'system', content: 'System prompt 2' },
      { role: 'user', content: 'Hello' },
    ],
    maxTokens = 1024,
  } = options

  return new ProxyRequest(
    {
      model,
      messages,
      max_tokens: maxTokens,
    },
    'example.com',
    'test-request-id',
    'test-api-key'
  )
}

function createTestResponse(
  options: {
    requestId?: string
    streaming?: boolean
    inputTokens?: number
    outputTokens?: number
    content?: string
  } = {}
): ProxyResponse {
  const {
    requestId = 'test-request-id',
    streaming = false,
    inputTokens = 10,
    outputTokens = 20,
    content = 'Hello',
  } = options

  const response = new ProxyResponse(requestId, streaming)
  response.processResponse({
    id: 'test-id',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: content }],
    model: 'claude-3-opus-20240229',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  })
  return response
}

function createTestContext(overrides: Partial<any> = {}): RequestContext {
  return RequestContextFactory.forTesting({
    method: 'POST',
    path: '/v1/messages',
    headers: {},
    host: 'example.com',
    requestId: 'test-request-id',
    ...overrides,
  })
}

describe('MetricsService', () => {
  let metricsService: MetricsService
  let mockStorageAdapter: MockStorageAdapter
  let mockTokenUsageService: TokenUsageService
  let config: MetricsConfig
  let mockTokenTrackerTrack: any
  let mockTokenTrackerGetStats: any

  beforeEach(() => {
    // Mock tokenTracker methods
    mockTokenTrackerTrack = spyOn(tokenTracker, 'track')
    mockTokenTrackerGetStats = spyOn(tokenTracker, 'getStats').mockReturnValue({})

    // Create properly typed mock storage adapter
    mockStorageAdapter = {
      storeRequest: mock(() => Promise.resolve()),
      storeResponse: mock(() => Promise.resolve()),
      storeStreamingChunk: mock(() => Promise.resolve()),
      processTaskToolInvocations: mock(() => Promise.resolve()),
      close: mock(() => Promise.resolve()),
    } as MockStorageAdapter

    // Create mock token usage service
    mockTokenUsageService = {} as TokenUsageService

    // Default config for tests
    config = {
      enableTokenTracking: true,
      enableStorage: true,
    }

    // Create metrics service with default config
    metricsService = new MetricsService(config, mockStorageAdapter, mockTokenUsageService)
  })

  afterEach(() => {
    // Restore mocks
    mockTokenTrackerTrack.mockRestore()
    mockTokenTrackerGetStats.mockRestore()
  })

  describe('Request Storage Filtering', () => {
    it('should store inference requests with multiple system messages', async () => {
      const request = createTestRequest({
        messages: [
          { role: 'system', content: 'System prompt 1' },
          { role: 'system', content: 'System prompt 2' },
          { role: 'user', content: 'Hello' },
        ],
      })
      const response = createTestResponse()
      const context = createTestContext()

      await metricsService.trackRequest(request, response, context)

      expect(mockStorageAdapter.storeRequest).toHaveBeenCalled()
      expect(mockStorageAdapter.storeResponse).toHaveBeenCalled()
    })

    it('should NOT store quota requests', async () => {
      const request = createTestRequest({
        model: 'claude-3-5-haiku-20241022',
        messages: [{ role: 'user', content: 'quota' }],
        maxTokens: 1,
      })
      const response = createTestResponse({ outputTokens: 1 })
      const context = createTestContext()

      await metricsService.trackRequest(request, response, context)

      expect(mockStorageAdapter.storeRequest).not.toHaveBeenCalled()
      expect(mockStorageAdapter.storeResponse).not.toHaveBeenCalled()
    })

    it('should NOT store query_evaluation requests (single system message)', async () => {
      const request = createTestRequest({
        messages: [
          { role: 'system', content: 'Single system message' },
          { role: 'user', content: 'Hello' },
        ],
      })
      const response = createTestResponse()
      const context = createTestContext()

      await metricsService.trackRequest(request, response, context)

      expect(mockStorageAdapter.storeRequest).not.toHaveBeenCalled()
      expect(mockStorageAdapter.storeResponse).not.toHaveBeenCalled()
    })
  })

  describe('Token Tracking', () => {
    it('should track tokens for successful requests', async () => {
      const request = createTestRequest()
      const response = createTestResponse({ inputTokens: 50, outputTokens: 100 })
      const context = createTestContext()

      await metricsService.trackRequest(request, response, context)

      expect(mockTokenTrackerTrack).toHaveBeenCalledWith('example.com', 50, 100, 'inference', 0)
    })

    it('should track zero tokens for errors', async () => {
      const request = createTestRequest()
      const error = new Error('API Error')
      const context = createTestContext()

      await metricsService.trackError(request, error, context)

      expect(mockTokenTrackerTrack).toHaveBeenCalledWith('example.com', 0, 0, 'inference', 0)
    })

    it('should not specify request type for quota requests in token tracking', async () => {
      const request = createTestRequest({
        messages: [{ role: 'user', content: 'quota' }],
        maxTokens: 1,
      })
      const response = createTestResponse({ inputTokens: 5, outputTokens: 1 })
      const context = createTestContext()

      await metricsService.trackRequest(request, response, context)

      expect(mockTokenTrackerTrack).toHaveBeenCalledWith('example.com', 5, 1, undefined, 0)
    })

    it('should track tool call counts', async () => {
      const request = createTestRequest()
      const response = new ProxyResponse('test-request-id', false)

      // Process response with tool calls
      response.processResponse({
        id: 'test-id',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me help' },
          { type: 'tool_use', id: 'tool1', name: 'calculator', input: {} },
          { type: 'tool_use', id: 'tool2', name: 'search', input: {} },
        ],
        model: 'claude-3-opus-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 20 },
      })

      const context = createTestContext()
      await metricsService.trackRequest(request, response, context)

      expect(mockTokenTrackerTrack).toHaveBeenCalledWith(
        'example.com',
        10,
        20,
        'inference',
        2 // Two tool calls
      )
    })

    it('should respect enableTokenTracking config', async () => {
      metricsService = new MetricsService(
        { enableTokenTracking: false, enableStorage: true },
        mockStorageAdapter,
        mockTokenUsageService
      )

      const request = createTestRequest()
      const response = createTestResponse()
      const context = createTestContext()

      await metricsService.trackRequest(request, response, context)

      expect(mockTokenTrackerTrack).not.toHaveBeenCalled()
    })
  })

  describe('Storage Operations', () => {
    it('should store request with full metadata including conversation data', async () => {
      const conversationData: ConversationData = {
        conversationId: 'conv-123',
        branchId: 'main',
        currentMessageHash: 'hash123',
        parentMessageHash: 'hash122',
        systemHash: 'sys-hash',
        parentRequestId: 'parent-req-id',
        isSubtask: false,
        parentTaskRequestId: undefined,
      }

      const request = createTestRequest()
      const response = createTestResponse()
      const context = createTestContext()
      const params: TrackRequestParams = {
        conversationData,
        accountId: 'acc_123',
        responseHeaders: { 'x-claude-id': 'claude-123' },
        fullResponseBody: { id: 'test', content: [{ type: 'text', text: 'Response' }] },
      }

      await metricsService.trackRequest(request, response, context, params)

      expect(mockStorageAdapter.storeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-request-id',
          domain: 'example.com',
          accountId: 'acc_123',
          conversationId: 'conv-123',
          branchId: 'main',
          currentMessageHash: 'hash123',
          parentMessageHash: 'hash122',
          systemHash: 'sys-hash',
          parentRequestId: 'parent-req-id',
          isSubtask: false,
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30,
        })
      )

      expect(mockStorageAdapter.processTaskToolInvocations).toHaveBeenCalledWith(
        'test-request-id',
        params.fullResponseBody,
        'example.com'
      )
    })

    it('should handle storage failures gracefully', async () => {
      mockStorageAdapter.storeRequest.mockImplementation(() =>
        Promise.reject(new Error('Database connection failed'))
      )

      const request = createTestRequest()
      const response = createTestResponse()
      const context = createTestContext()

      // Should not throw
      await expect(metricsService.trackRequest(request, response, context)).resolves.toBeUndefined()

      // Token tracking should still work
      expect(mockTokenTrackerTrack).toHaveBeenCalled()
    })

    it('should respect enableStorage config', async () => {
      metricsService = new MetricsService(
        { enableTokenTracking: true, enableStorage: false },
        mockStorageAdapter,
        mockTokenUsageService
      )

      const request = createTestRequest()
      const response = createTestResponse()
      const context = createTestContext()

      await metricsService.trackRequest(request, response, context)

      expect(mockStorageAdapter.storeRequest).not.toHaveBeenCalled()
      expect(mockTokenTrackerTrack).toHaveBeenCalled()
    })

    it('should handle missing storage adapter', async () => {
      metricsService = new MetricsService(
        { enableTokenTracking: true, enableStorage: true },
        undefined, // No storage adapter
        mockTokenUsageService
      )

      const request = createTestRequest()
      const response = createTestResponse()
      const context = createTestContext()

      // Should not throw
      await expect(metricsService.trackRequest(request, response, context)).resolves.toBeUndefined()

      expect(mockTokenTrackerTrack).toHaveBeenCalled()
    })
  })

  describe('Error Tracking', () => {
    it('should track errors with correct status code', async () => {
      const request = createTestRequest()
      const error = new Error('Rate limit exceeded')
      const context = createTestContext()

      await metricsService.trackError(request, error, context, 429)

      expect(mockTokenTrackerTrack).toHaveBeenCalledWith('example.com', 0, 0, 'inference', 0)
    })

    it('should use default 500 status for errors', async () => {
      const request = createTestRequest()
      const error = new Error('Internal error')
      const context = createTestContext()

      await metricsService.trackError(request, error, context)

      // Just verify it doesn't throw and tracks tokens
      expect(mockTokenTrackerTrack).toHaveBeenCalled()
    })
  })

  describe('Statistics', () => {
    it('should return stats for all domains', () => {
      const mockStats = {
        'domain1.com': { inputTokens: 100, outputTokens: 200 },
        'domain2.com': { inputTokens: 50, outputTokens: 100 },
      }
      mockTokenTrackerGetStats.mockReturnValue(mockStats)

      const stats = metricsService.getStats()

      expect(stats).toEqual(mockStats)
    })

    it('should return stats for specific domain', () => {
      const mockStats = {
        'domain1.com': { inputTokens: 100, outputTokens: 200 },
        'domain2.com': { inputTokens: 50, outputTokens: 100 },
      }
      mockTokenTrackerGetStats.mockReturnValue(mockStats)

      const stats = metricsService.getStats('domain1.com')

      expect(stats).toEqual({ inputTokens: 100, outputTokens: 200 })
    })

    it('should return null for non-existent domain', () => {
      mockTokenTrackerGetStats.mockReturnValue({})

      const stats = metricsService.getStats('unknown.com')

      expect(stats).toBeNull()
    })
  })

  describe('Edge Cases', () => {
    it('should handle requests with empty messages array', async () => {
      const request = createTestRequest({ messages: [] })
      const response = createTestResponse()
      const context = createTestContext()

      await metricsService.trackRequest(request, response, context)

      // Empty messages array results in query_evaluation type, which is not stored
      expect(mockStorageAdapter.storeRequest).not.toHaveBeenCalled()
    })

    it('should handle responses with cache tokens', async () => {
      const request = createTestRequest()
      const response = new ProxyResponse('test-request-id', false)

      response.processResponse({
        id: 'test-id',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Cached response' }],
        model: 'claude-3-opus-20240229',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 20,
          cache_read_input_tokens: 30,
        },
      })

      const context = createTestContext()
      await metricsService.trackRequest(request, response, context)

      expect(mockStorageAdapter.storeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 20,
          cache_read_input_tokens: 30,
        })
      )
    })

    it('should calculate message count correctly for complex message structures', async () => {
      const request = createTestRequest({
        messages: [
          { role: 'system', content: 'System 1' },
          { role: 'system', content: 'System 2' },
          { role: 'user', content: 'Message 1' },
          { role: 'assistant', content: 'Response 1' },
          { role: 'user', content: 'Message 2' },
        ],
      })
      const response = createTestResponse()
      const context = createTestContext()

      await metricsService.trackRequest(request, response, context)

      expect(mockStorageAdapter.storeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          messageCount: 5,
        })
      )
    })
  })
})
