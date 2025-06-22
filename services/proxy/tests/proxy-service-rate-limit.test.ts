import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { ProxyService } from '../src/services/ProxyService'
import { AuthenticationService } from '../src/services/AuthenticationService'
import { ClaudeApiClient } from '../src/services/ClaudeApiClient'
import { NotificationService } from '../src/services/NotificationService'
import { MetricsService } from '../src/services/MetricsService'
import { RequestContext } from '../src/domain/value-objects/RequestContext'
import { RateLimitCheck } from '../src/services/TokenUsageService'

// Mock all dependencies
const mockAuth = {
  authenticatePersonalDomain: mock(() => Promise.resolve({ headers: { 'Authorization': 'Bearer test-key' } })),
  authenticateNonPersonalDomain: mock(() => Promise.resolve({ headers: { 'Authorization': 'Bearer test-key' } })),
} as unknown as AuthenticationService

const mockApiClient = {
  forward: mock(() => Promise.resolve(new Response('{"content": [{"text": "Hello"}], "usage": {"input_tokens": 10, "output_tokens": 20}}', { 
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  }))),
  processResponse: mock(async (response: Response) => {
    const json = await response.json()
    return {
      ...json,
      usage: json.usage || { input_tokens: 10, output_tokens: 20 }
    }
  }),
} as unknown as ClaudeApiClient

const mockNotificationService = {
  notify: mock(() => Promise.resolve()),
  notifyError: mock(() => Promise.resolve()),
} as unknown as NotificationService

const mockMetricsService = {
  checkRateLimits: mock(() => Promise.resolve(null)),
  trackRequest: mock(() => Promise.resolve()),
  trackError: mock(() => Promise.resolve()),
} as unknown as MetricsService

// Mock logger
mock.module('../src/middleware/logger', () => ({
  logger: {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  }
}))

describe('ProxyService - Rate Limiting Integration', () => {
  let proxyService: ProxyService
  let mockContext: RequestContext

  beforeEach(() => {
    // Reset all mocks
    mockAuth.authenticatePersonalDomain.mockClear()
    mockAuth.authenticateNonPersonalDomain.mockClear()
    mockApiClient.forward.mockClear()
    mockApiClient.processResponse.mockClear()
    mockNotificationService.notify.mockClear()
    mockNotificationService.notifyError.mockClear()
    mockMetricsService.checkRateLimits.mockClear()
    mockMetricsService.trackRequest.mockClear()
    mockMetricsService.trackError.mockClear()

    proxyService = new ProxyService(
      mockAuth,
      mockApiClient,
      mockNotificationService,
      mockMetricsService
    )

    // Create mock context with header method
    const headers: Record<string, string> = {}
    mockContext = {
      requestId: 'test-request-123',
      host: 'example.com',
      method: 'POST',
      path: '/v1/messages',
      headers: {},
      startTime: Date.now(),
      getElapsedTime: () => 100,
      honoContext: {
        header: (name: string, value: string) => {
          headers[name] = value
        },
        get: () => headers,
      }
    } as RequestContext
  })

  describe('Model Switching on Rate Limit', () => {
    it('should switch to fallback model when rate limit exceeded', async () => {
      const rateLimitCheck: RateLimitCheck = {
        exceeded: true,
        limit: {
          id: 1,
          domain: 'example.com',
          model: 'claude-3-opus-20240229',
          windowSeconds: 300,
          tokenLimit: 1000,
          fallbackModel: 'claude-3-haiku-20240307',
          priority: 1
        },
        usage: {
          inputTokens: 600,
          outputTokens: 500,
          totalTokens: 1100,
          requestCount: 10,
          windowStart: new Date(),
          windowEnd: new Date()
        },
        percentUsed: 110,
        fallbackModel: 'claude-3-haiku-20240307'
      }

      mockMetricsService.checkRateLimits.mockResolvedValueOnce(rateLimitCheck)

      const originalRequest = {
        model: 'claude-3-opus-20240229',
        messages: [
          { role: 'user', content: 'Tell me a story' }
        ],
        stream: false
      }

      // The API client should receive the request with the fallback model
      mockApiClient.forward.mockImplementationOnce((request) => {
        expect(request.model).toBe('claude-3-haiku-20240307')
        return Promise.resolve(new Response('{"content": [{"text": "Once upon a time..."}], "usage": {"input_tokens": 50, "output_tokens": 100}}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }))
      })

      const response = await proxyService.handleRequest(originalRequest, mockContext)

      // Verify rate limit was checked
      expect(mockMetricsService.checkRateLimits).toHaveBeenCalledWith('example.com', 'claude-3-opus-20240229')
      
      // Verify headers were set
      const headers = mockContext.honoContext?.get() as Record<string, string>
      expect(headers['X-CNP-Model-Switched-To']).toBe('claude-3-haiku-20240307')
      expect(headers['X-CNP-Model-Switch-Reason']).toBe('rate-limit')

      // Verify the request was forwarded with the fallback model
      expect(mockApiClient.forward).toHaveBeenCalled()
      const forwardedRequest = mockApiClient.forward.mock.calls[0][0]
      expect(forwardedRequest.model).toBe('claude-3-haiku-20240307')

      // Verify response is successful
      expect(response.status).toBe(200)
    })

    it('should reject request when rate limit exceeded and no fallback configured', async () => {
      const rateLimitCheck: RateLimitCheck = {
        exceeded: true,
        limit: {
          id: 2,
          domain: 'example.com',
          model: 'claude-3-opus-20240229',
          windowSeconds: 60,
          tokenLimit: 10000,
          fallbackModel: undefined,
          priority: 1
        },
        usage: {
          inputTokens: 6000,
          outputTokens: 5000,
          totalTokens: 11000,
          requestCount: 50,
          windowStart: new Date(),
          windowEnd: new Date()
        },
        percentUsed: 110,
        fallbackModel: undefined
      }

      mockMetricsService.checkRateLimits.mockResolvedValueOnce(rateLimitCheck)

      const request = {
        model: 'claude-3-opus-20240229',
        messages: [
          { role: 'user', content: 'Hello world' }
        ],
        stream: false
      }

      let thrownError: any
      try {
        await proxyService.handleRequest(request, mockContext)
      } catch (error) {
        thrownError = error
      }

      // Verify error was thrown
      expect(thrownError).toBeDefined()
      expect(thrownError.message).toContain('Rate limit exceeded')
      expect(thrownError.statusCode).toBe(429)
      expect(thrownError.rateLimitCheck).toBe(rateLimitCheck)

      // Verify API was not called
      expect(mockApiClient.forward).not.toHaveBeenCalled()

      // Verify error was tracked
      expect(mockMetricsService.trackError).toHaveBeenCalled()
    })

    it('should process request normally when no rate limits exceeded', async () => {
      mockMetricsService.checkRateLimits.mockResolvedValueOnce(null)

      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'What is 2+2?' }
        ],
        stream: false
      }

      const response = await proxyService.handleRequest(request, mockContext)

      // Verify rate limit was checked
      expect(mockMetricsService.checkRateLimits).toHaveBeenCalledWith('example.com', 'claude-3-5-sonnet-20241022')
      
      // Verify no model switch headers were set
      const headers = mockContext.honoContext?.get() as Record<string, string>
      expect(headers['X-CNP-Model-Switched-To']).toBeUndefined()
      expect(headers['X-CNP-Model-Switch-Reason']).toBeUndefined()

      // Verify the original model was used
      const forwardedRequest = mockApiClient.forward.mock.calls[0][0]
      expect(forwardedRequest.model).toBe('claude-3-5-sonnet-20241022')

      // Verify response is successful
      expect(response.status).toBe(200)
    })
  })

  describe('Real-world Scenarios', () => {
    it('should handle rapid requests approaching rate limit', async () => {
      // Simulate multiple requests approaching the limit
      const usageStates = [
        { totalTokens: 500, requestCount: 5 },
        { totalTokens: 700, requestCount: 7 },
        { totalTokens: 900, requestCount: 9 },
        { totalTokens: 1100, requestCount: 11 } // Exceeds limit
      ]

      for (let i = 0; i < usageStates.length; i++) {
        const usage = usageStates[i]
        const exceeded = usage.totalTokens >= 1000

        const rateLimitCheck: RateLimitCheck | null = exceeded ? {
          exceeded: true,
          limit: {
            id: 1,
            domain: 'example.com',
            model: 'claude-3-opus-20240229',
            windowSeconds: 300,
            tokenLimit: 1000,
            fallbackModel: 'claude-3-haiku-20240307',
            priority: 1
          },
          usage: {
            ...usage,
            inputTokens: usage.totalTokens * 0.4,
            outputTokens: usage.totalTokens * 0.6,
            windowStart: new Date(),
            windowEnd: new Date()
          },
          percentUsed: (usage.totalTokens / 1000) * 100,
          fallbackModel: 'claude-3-haiku-20240307'
        } : null

        mockMetricsService.checkRateLimits.mockResolvedValueOnce(rateLimitCheck)

        const request = {
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: `Request ${i + 1}` }],
          stream: false
        }

        const response = await proxyService.handleRequest(request, mockContext)

        if (exceeded) {
          // Verify model was switched
          const headers = mockContext.honoContext?.get() as Record<string, string>
          expect(headers['X-CNP-Model-Switched-To']).toBe('claude-3-haiku-20240307')
        } else {
          // Verify original model was used
          const forwardedRequest = mockApiClient.forward.mock.calls[i][0]
          expect(forwardedRequest.model).toBe('claude-3-opus-20240229')
        }

        expect(response.status).toBe(200)
      }
    })

    it('should handle different rate limits for different models', async () => {
      const models = [
        { name: 'claude-3-opus-20240229', limit: 10000 },
        { name: 'claude-3-5-sonnet-20241022', limit: 20000 },
        { name: 'claude-3-haiku-20240307', limit: 50000 }
      ]

      for (const model of models) {
        mockMetricsService.checkRateLimits.mockResolvedValueOnce(null) // Within limits

        const request = {
          model: model.name,
          messages: [{ role: 'user', content: 'Test message' }],
          stream: false
        }

        const response = await proxyService.handleRequest(request, mockContext)

        // Verify correct model was checked
        expect(mockMetricsService.checkRateLimits).toHaveBeenCalledWith('example.com', model.name)
        expect(response.status).toBe(200)
      }
    })
  })
})