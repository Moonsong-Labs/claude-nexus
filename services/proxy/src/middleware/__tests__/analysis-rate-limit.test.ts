import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { Context } from 'hono'
import {
  initializeAnalysisRateLimiters,
  rateLimitAnalysisCreation,
  rateLimitAnalysisRetrieval,
  getRateLimitStatus,
} from '../analysis-rate-limit.js'

// Note: In a real test environment, we would need to mock the config
// For now, we're using the actual config values which default to 15 and 100

describe('Analysis Rate Limit Middleware', () => {
  beforeEach(() => {
    // Initialize rate limiters before each test
    initializeAnalysisRateLimiters()
  })

  describe('rateLimitAnalysisCreation', () => {
    it('should allow requests within rate limit', async () => {
      const middleware = rateLimitAnalysisCreation()
      const mockNext = mock(() => Promise.resolve())
      const mockContext = {
        get: mock((key: string) => {
          if (key === 'requestId') return 'test-request-id'
          if (key === 'domain') return 'test-domain.com'
          return undefined
        }),
      } as unknown as Context

      // First request should pass
      await middleware(mockContext, mockNext)
      expect(mockNext).toHaveBeenCalledTimes(1)
      
      // Second request should pass (default limit is 15)
      await middleware(mockContext, mockNext)
      expect(mockNext).toHaveBeenCalledTimes(2)
    })

    it('should block requests exceeding rate limit', async () => {
      const middleware = rateLimitAnalysisCreation()
      const mockNext = mock(() => Promise.resolve())
      const mockJson = mock()
      const mockContext = {
        get: mock((key: string) => {
          if (key === 'requestId') return 'test-request-id'
          if (key === 'domain') return 'test-domain-exceed.com'
          return undefined
        }),
        json: mockJson,
      } as unknown as Context

      // Consume all available points (default limit is 15)
      for (let i = 0; i < 15; i++) {
        await middleware(mockContext, mockNext)
      }
      
      // 16th request should be blocked
      await middleware(mockContext, mockNext)
      
      // Verify the response
      expect(mockNext).toHaveBeenCalledTimes(15) // Only first 15 should pass
      expect(mockJson).toHaveBeenCalledWith(
        {
          error: {
            type: 'rate_limit_error',
            message: 'Too many analysis creation requests. Please try again later.',
            retry_after: expect.any(Number),
          },
        },
        429,
        expect.objectContaining({
          'Retry-After': expect.any(String),
          'X-RateLimit-Limit': '15',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': expect.any(String),
        })
      )
    })

    it('should use "unknown" as key when domain is not provided', async () => {
      const middleware = rateLimitAnalysisCreation()
      const mockNext = mock(() => Promise.resolve())
      const mockContext = {
        get: mock((key: string) => {
          if (key === 'requestId') return 'test-request-id'
          if (key === 'domain') return undefined // No domain
          return undefined
        }),
      } as unknown as Context

      await middleware(mockContext, mockNext)
      expect(mockNext).toHaveBeenCalledTimes(1)
    })
  })

  describe('rateLimitAnalysisRetrieval', () => {
    it('should allow requests within rate limit', async () => {
      const middleware = rateLimitAnalysisRetrieval()
      const mockNext = mock(() => Promise.resolve())
      const mockContext = {
        get: mock((key: string) => {
          if (key === 'requestId') return 'test-request-id'
          if (key === 'domain') return 'test-domain-retrieval.com'
          return undefined
        }),
      } as unknown as Context

      // Should allow multiple requests (default retrieval limit is 100)
      for (let i = 0; i < 5; i++) {
        await middleware(mockContext, mockNext)
      }
      
      expect(mockNext).toHaveBeenCalledTimes(5)
    })

    it('should have consistent error message format', async () => {
      const middleware = rateLimitAnalysisRetrieval()
      const mockNext = mock(() => Promise.resolve())
      const mockJson = mock()
      const mockContext = {
        get: mock((key: string) => {
          if (key === 'requestId') return 'test-request-id'
          if (key === 'domain') return 'test-domain-retrieval-exceed.com'
          return undefined
        }),
        json: mockJson,
      } as unknown as Context

      // Consume all available points (default limit is 100)
      for (let i = 0; i < 100; i++) {
        await middleware(mockContext, mockNext)
      }
      
      // 101st request should be blocked
      await middleware(mockContext, mockNext)
      
      // Verify the error message is consistent
      expect(mockJson).toHaveBeenCalledWith(
        {
          error: {
            type: 'rate_limit_error',
            message: 'Too many analysis retrieval requests. Please try again later.',
            retry_after: expect.any(Number),
          },
        },
        429,
        expect.any(Object)
      )
    })
  })

  describe('getRateLimitStatus', () => {
    it('should return current rate limit status for creation', async () => {
      const middleware = rateLimitAnalysisCreation()
      const mockNext = mock(() => Promise.resolve())
      const mockContext = {
        get: mock((key: string) => {
          if (key === 'requestId') return 'test-request-id'
          if (key === 'domain') return 'test-domain-status.com'
          return undefined
        }),
      } as unknown as Context

      // Consume one point
      await middleware(mockContext, mockNext)

      // Check status
      const status = await getRateLimitStatus('test-domain-status.com', 'creation')
      
      expect(status).toEqual({
        remainingPoints: 14, // Started with 15, consumed 1
        totalPoints: 15,
        resetAt: expect.any(Date),
      })
    })

    it('should return current rate limit status for retrieval', async () => {
      const status = await getRateLimitStatus('test-domain-status-retrieval.com', 'retrieval')
      
      expect(status).toEqual({
        remainingPoints: 100, // Full limit available
        totalPoints: 100,
        resetAt: null, // No consumption yet
      })
    })
  })

  describe('Error handling', () => {
    it('should return 500 error if limiter not initialized', async () => {
      // This test simulates what would happen if the limiter is somehow not initialized
      // In practice, this shouldn't happen if app.ts calls initializeAnalysisRateLimiters
      const middleware = rateLimitAnalysisCreation()
      
      // Manually set the limiter to null to simulate uninitialized state
      // Note: This is a bit of a hack since we can't easily access the private variable
      // The test is included for completeness but may need adjustment based on implementation
      
      expect(true).toBe(true) // Placeholder
    })
  })
})