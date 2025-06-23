import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import { Pool } from 'pg'
import { TokenUsageService, RateLimitExceededError } from '../src/services/TokenUsageService'
import { ProxyRequest } from '../src/domain/entities/ProxyRequest'
import { TokenMetrics } from '../src/domain/value-objects/TokenMetrics'

// Mock the pg Pool
const mockQuery = mock(() => Promise.resolve({ rows: [] }))
const mockPool = {
  query: mockQuery,
  end: mock(() => Promise.resolve()),
} as unknown as Pool

// Mock logger to avoid console output during tests
mock.module('../src/middleware/logger', () => ({
  logger: {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  }
}))

describe('TokenUsageService', () => {
  let service: TokenUsageService
  
  beforeEach(() => {
    // Reset mocks
    mockQuery.mockClear()
    service = new TokenUsageService(mockPool)
  })

  describe('trackUsage', () => {
    it('should track token usage for all request types', async () => {
      const request = new ProxyRequest(
        {
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'Hello' }],
        },
        'example.com',
        'test-request-id'
      )
      
      const metrics: TokenMetrics = {
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        toolCallCount: 0,
        fullUsageData: {}
      }

      mockQuery.mockResolvedValueOnce({ rows: [] })

      await service.trackUsage(request, metrics, 'test-request-id')

      // Verify database write was called
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO token_usage'),
        expect.arrayContaining([
          'test-request-id',
          'example.com',
          'claude-3-opus-20240229',
          100,
          200,
          expect.any(String) // request_type
        ])
      )
    })

    it('should track query_evaluation requests', async () => {
      const request = new ProxyRequest(
        {
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'Hello' }],
          system: 'You are a helpful assistant', // 1 system message = query_evaluation
        },
        'example.com',
        'test-request-id'
      )
      
      const metrics: TokenMetrics = {
        inputTokens: 50,
        outputTokens: 100,
        totalTokens: 150,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        toolCallCount: 0,
        fullUsageData: {}
      }

      await service.trackUsage(request, metrics, 'test-request-id')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'test-request-id',
          'example.com',
          'claude-3-opus-20240229',
          50,
          100,
          'query_evaluation'
        ])
      )
    })

    it('should track quota requests', async () => {
      const request = new ProxyRequest(
        {
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'quota' }],
        },
        'example.com',
        'test-request-id'
      )
      
      const metrics: TokenMetrics = {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        toolCallCount: 0,
        fullUsageData: {}
      }

      await service.trackUsage(request, metrics, 'test-request-id')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'test-request-id',
          'example.com',
          'claude-3-opus-20240229',
          10,
          20,
          'quota'
        ])
      )
    })
  })

  describe('checkRateLimits', () => {
    it('should return null when no rate limits configured', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }) // No configs

      const result = await service.checkRateLimits('example.com', 'claude-3-opus-20240229')
      
      expect(result).toBeNull()
    })

    it('should detect exceeded token limit', async () => {
      // Mock rate limit config
      mockQuery.mockResolvedValueOnce({ 
        rows: [{
          id: 1,
          domain: 'example.com',
          model: 'claude-3-opus-20240229',
          window_seconds: 300,
          token_limit: 1000,
          request_limit: null,
          fallback_model: 'claude-3-haiku-20240307',
          priority: 1
        }]
      })

      // Mock usage query - exceeding limit
      mockQuery.mockResolvedValueOnce({
        rows: [{
          input_tokens: '800',
          output_tokens: '300',
          total_tokens: '1100',
          request_count: '5'
        }]
      })

      const result = await service.checkRateLimits('example.com', 'claude-3-opus-20240229')
      
      expect(result).not.toBeNull()
      expect(result?.exceeded).toBe(true)
      expect(result?.limit?.tokenLimit).toBe(1000)
      expect(result?.usage.totalTokens).toBe(1100)
      expect(result?.percentUsed).toBeCloseTo(110, 5)
      expect(result?.fallbackModel).toBe('claude-3-haiku-20240307')
    })

    it('should detect exceeded request limit', async () => {
      // Mock rate limit config
      mockQuery.mockResolvedValueOnce({ 
        rows: [{
          id: 2,
          domain: 'example.com',
          model: 'claude-3-opus-20240229',
          window_seconds: 60,
          token_limit: null,
          request_limit: 10,
          fallback_model: null,
          priority: 1
        }]
      })

      // Mock usage query - exceeding request limit
      mockQuery.mockResolvedValueOnce({
        rows: [{
          input_tokens: '500',
          output_tokens: '500',
          total_tokens: '1000',
          request_count: '15'
        }]
      })

      const result = await service.checkRateLimits('example.com', 'claude-3-opus-20240229')
      
      expect(result).not.toBeNull()
      expect(result?.exceeded).toBe(true)
      expect(result?.limit?.requestLimit).toBe(10)
      expect(result?.usage.requestCount).toBe(15)
      expect(result?.fallbackModel).toBeNull()
    })

    it('should not exceed when within limits', async () => {
      // Mock rate limit config
      mockQuery.mockResolvedValueOnce({ 
        rows: [{
          id: 3,
          domain: 'example.com',
          model: 'claude-3-opus-20240229',
          window_seconds: 18000, // 5 hours
          token_limit: 100000,
          request_limit: 1000,
          fallback_model: null,
          priority: 1
        }]
      })

      // Mock usage query - within limits
      mockQuery.mockResolvedValueOnce({
        rows: [{
          input_tokens: '30000',
          output_tokens: '40000',
          total_tokens: '70000',
          request_count: '500'
        }]
      })

      const result = await service.checkRateLimits('example.com', 'claude-3-opus-20240229')
      
      expect(result).toBeNull()
    })
  })

  describe('getUsageInWindow', () => {
    it('should return usage for windows from database', async () => {
      const domain = 'example.com'
      const model = 'claude-3-opus-20240229'
      const windowSeconds = 60

      // Mock database response
      mockQuery.mockResolvedValueOnce({
        rows: [{
          input_tokens: '100',
          output_tokens: '200',
          total_tokens: '300',
          request_count: '5'
        }]
      })

      const usage = await service.getUsageInWindow(domain, model, windowSeconds)
      expect(usage.totalTokens).toBe(300)
      expect(usage.requestCount).toBe(5)
      expect(mockQuery).toHaveBeenCalledTimes(1)
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM get_token_usage_in_window($1, $2, $3)',
        [domain, model, windowSeconds]
      )
    })

    it('should query database for all window sizes', async () => {
      const domain = 'example.com'
      const model = 'claude-3-opus-20240229'
      const windowSeconds = 18000 // 5 hours

      // Mock database response
      mockQuery.mockResolvedValueOnce({
        rows: [{
          input_tokens: '50000',
          output_tokens: '60000',
          total_tokens: '110000',
          request_count: '100'
        }]
      })

      const usage = await service.getUsageInWindow(domain, model, windowSeconds)
      expect(usage.totalTokens).toBe(110000)
      expect(usage.requestCount).toBe(100)
      expect(mockQuery).toHaveBeenCalledTimes(1)
    })

    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'))

      const usage = await service.getUsageInWindow('example.com', 'claude-3-opus-20240229', 300)
      
      // Should return empty usage on error
      expect(usage.inputTokens).toBe(0)
      expect(usage.outputTokens).toBe(0)
      expect(usage.totalTokens).toBe(0)
      expect(usage.requestCount).toBe(0)
    })
  })

  describe('getHistoricalUsage', () => {
    it('should return historical usage data', async () => {
      const domain = 'example.com'
      const startDate = new Date('2025-01-01')
      const endDate = new Date('2025-01-02')

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            period: '2025-01-01T00:00:00Z',
            model: 'claude-3-opus-20240229',
            input_tokens: '10000',
            output_tokens: '15000',
            total_tokens: '25000',
            request_count: '50',
            request_types: '2'
          },
          {
            period: '2025-01-01T01:00:00Z',
            model: 'claude-3-opus-20240229',
            input_tokens: '12000',
            output_tokens: '18000',
            total_tokens: '30000',
            request_count: '60',
            request_types: '2'
          }
        ]
      })

      const history = await service.getHistoricalUsage(domain, startDate, endDate, 'hour')
      
      expect(history).toHaveLength(2)
      expect(history[0].total_tokens).toBe('25000')
      expect(history[1].total_tokens).toBe('30000')
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DATE_TRUNC'),
        ['hour', domain, startDate, endDate]
      )
    })
  })

  describe('updateRateLimitConfig', () => {
    it('should update rate limit configuration', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await service.updateRateLimitConfig({
        id: 1,
        tokenLimit: 150000,
        fallbackModel: 'claude-3-haiku-20240307'
      })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE rate_limit_configs'),
        [1, 150000, undefined, 'claude-3-haiku-20240307']
      )
    })
  })

  describe('createFuturePartitions', () => {
    it('should create future partitions', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await service.createFuturePartitions()

      expect(mockQuery).toHaveBeenCalledWith('SELECT create_monthly_partitions(3)')
    })
  })
})