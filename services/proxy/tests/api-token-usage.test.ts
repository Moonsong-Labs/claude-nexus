import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { Hono } from 'hono'
import { apiRoutes } from '../src/routes/api'
import { TokenUsageService, UsageWindow, RateLimitConfig } from '../src/services/TokenUsageService'

// Mock container
const mockTokenUsageService = {
  getUsageInWindow: mock(() => Promise.resolve({
    inputTokens: 1000,
    outputTokens: 2000,
    totalTokens: 3000,
    requestCount: 10,
    windowStart: new Date(),
    windowEnd: new Date()
  } as UsageWindow)),
  getRateLimitConfigs: mock(() => Promise.resolve([])),
  getHistoricalUsage: mock(() => Promise.resolve([])),
  updateRateLimitConfig: mock(() => Promise.resolve()),
} as unknown as TokenUsageService

const mockPool = {
  query: mock(() => Promise.resolve({ rows: [] })),
}

mock.module('../src/container.js', () => ({
  container: {
    getTokenUsageService: () => mockTokenUsageService,
    getDbPool: () => mockPool,
  }
}))

// Mock logger
mock.module('../src/middleware/logger.js', () => ({
  logger: {
    error: mock(() => {}),
    warn: mock(() => {}),
    debug: mock(() => {}),
  }
}))

describe('Token Usage API Endpoints', () => {
  let app: Hono

  beforeEach(() => {
    app = new Hono()
    app.route('/api', apiRoutes)
    
    // Reset all mocks
    mockTokenUsageService.getUsageInWindow.mockClear()
    mockTokenUsageService.getRateLimitConfigs.mockClear()
    mockTokenUsageService.getHistoricalUsage.mockClear()
    mockTokenUsageService.updateRateLimitConfig.mockClear()
    mockPool.query.mockClear()
  })

  describe('GET /api/token-usage/current', () => {
    it('should return current window usage with matching rate limit', async () => {
      const configs: RateLimitConfig[] = [{
        id: 1,
        domain: 'example.com',
        model: 'claude-3-opus-20240229',
        windowSeconds: 300,
        tokenLimit: 10000,
        priority: 1
      }]

      mockTokenUsageService.getRateLimitConfigs.mockResolvedValueOnce(configs)

      const response = await app.request('/api/token-usage/current?domain=example.com&model=claude-3-opus-20240229&window=300')
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.usage.totalTokens).toBe(3000)
      expect(data.limit).toEqual(configs[0])
      expect(data.percentUsed).toBe(30) // 3000/10000 * 100
      
      expect(mockTokenUsageService.getUsageInWindow).toHaveBeenCalledWith('example.com', 'claude-3-opus-20240229', 300)
      expect(mockTokenUsageService.getRateLimitConfigs).toHaveBeenCalledWith('example.com', 'claude-3-opus-20240229')
    })

    it('should use default 5-minute window when not specified', async () => {
      mockTokenUsageService.getRateLimitConfigs.mockResolvedValueOnce([])

      const response = await app.request('/api/token-usage/current?domain=example.com&model=claude-3-opus-20240229')
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(mockTokenUsageService.getUsageInWindow).toHaveBeenCalledWith('example.com', 'claude-3-opus-20240229', 300)
    })

    it('should return 400 when required parameters missing', async () => {
      const response1 = await app.request('/api/token-usage/current?domain=example.com')
      expect(response1.status).toBe(400)
      expect(await response1.json()).toEqual({ error: 'Domain and model parameters are required' })

      const response2 = await app.request('/api/token-usage/current?model=claude-3-opus-20240229')
      expect(response2.status).toBe(400)
      expect(await response2.json()).toEqual({ error: 'Domain and model parameters are required' })
    })

    it('should handle different window sizes', async () => {
      const testCases = [
        { window: 60, description: '1 minute' },
        { window: 300, description: '5 minutes' },
        { window: 18000, description: '5 hours' },
      ]

      for (const testCase of testCases) {
        mockTokenUsageService.getUsageInWindow.mockResolvedValueOnce({
          inputTokens: testCase.window * 10,
          outputTokens: testCase.window * 20,
          totalTokens: testCase.window * 30,
          requestCount: testCase.window / 10,
          windowStart: new Date(),
          windowEnd: new Date()
        })

        const response = await app.request(`/api/token-usage/current?domain=example.com&model=claude-3-opus-20240229&window=${testCase.window}`)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.usage.totalTokens).toBe(testCase.window * 30)
        expect(mockTokenUsageService.getUsageInWindow).toHaveBeenCalledWith('example.com', 'claude-3-opus-20240229', testCase.window)
      }
    })
  })

  describe('GET /api/token-usage/history', () => {
    it('should return historical usage data', async () => {
      const historicalData = [
        {
          period: '2025-01-01T00:00:00Z',
          model: 'claude-3-opus-20240229',
          input_tokens: 10000,
          output_tokens: 15000,
          total_tokens: 25000,
          request_count: 50
        },
        {
          period: '2025-01-01T01:00:00Z',
          model: 'claude-3-opus-20240229',
          input_tokens: 12000,
          output_tokens: 18000,
          total_tokens: 30000,
          request_count: 60
        }
      ]

      mockTokenUsageService.getHistoricalUsage.mockResolvedValueOnce(historicalData)

      const response = await app.request('/api/token-usage/history?domain=example.com&start=2025-01-01&end=2025-01-02&granularity=hour')
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.history).toEqual(historicalData)
      
      expect(mockTokenUsageService.getHistoricalUsage).toHaveBeenCalledWith(
        'example.com',
        new Date('2025-01-01'),
        new Date('2025-01-02'),
        'hour'
      )
    })

    it('should use default date range when not specified', async () => {
      mockTokenUsageService.getHistoricalUsage.mockResolvedValueOnce([])

      const response = await app.request('/api/token-usage/history?domain=example.com')
      
      expect(response.status).toBe(200)
      
      const call = mockTokenUsageService.getHistoricalUsage.mock.calls[0]
      expect(call[0]).toBe('example.com')
      expect(call[1]).toBeInstanceOf(Date) // Start date (24 hours ago)
      expect(call[2]).toBeInstanceOf(Date) // End date (now)
      expect(call[3]).toBe('hour') // Default granularity
    })

    it('should return 400 when domain is missing', async () => {
      const response = await app.request('/api/token-usage/history')
      
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Domain parameter is required' })
    })

    it('should support day granularity', async () => {
      mockTokenUsageService.getHistoricalUsage.mockResolvedValueOnce([])

      const response = await app.request('/api/token-usage/history?domain=example.com&granularity=day')
      
      expect(response.status).toBe(200)
      expect(mockTokenUsageService.getHistoricalUsage).toHaveBeenCalledWith(
        'example.com',
        expect.any(Date),
        expect.any(Date),
        'day'
      )
    })
  })

  describe('GET /api/rate-limits', () => {
    it('should return all rate limit configurations', async () => {
      const configs = [
        {
          id: 1,
          domain: null,
          model: 'claude-3-opus-20240229',
          window_seconds: 60,
          token_limit: 10000,
          request_limit: 10,
          fallback_model: 'claude-3-haiku-20240307',
          priority: 1,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        },
        {
          id: 2,
          domain: 'example.com',
          model: 'claude-3-opus-20240229',
          window_seconds: 18000,
          token_limit: 140000,
          request_limit: null,
          fallback_model: null,
          priority: 2,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }
      ]

      mockPool.query.mockResolvedValueOnce({ rows: configs })

      const response = await app.request('/api/rate-limits')
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.configs).toHaveLength(2)
      expect(data.configs[0].windowSeconds).toBe(60)
      expect(data.configs[1].windowSeconds).toBe(18000)
    })

    it('should filter by domain', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] })

      const response = await app.request('/api/rate-limits?domain=example.com')
      
      expect(response.status).toBe(200)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('(domain = $1 OR domain IS NULL)'),
        ['example.com']
      )
    })

    it('should filter by model', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] })

      const response = await app.request('/api/rate-limits?model=claude-3-opus-20240229')
      
      expect(response.status).toBe(200)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('model = $1'),
        ['claude-3-opus-20240229']
      )
    })

    it('should filter by both domain and model', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] })

      const response = await app.request('/api/rate-limits?domain=example.com&model=claude-3-opus-20240229')
      
      expect(response.status).toBe(200)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('(domain = $1 OR domain IS NULL)'),
        expect.arrayContaining(['example.com', 'claude-3-opus-20240229'])
      )
    })
  })

  describe('POST /api/rate-limits', () => {
    it('should update existing rate limit configuration', async () => {
      const updateData = {
        id: 1,
        tokenLimit: 200000,
        fallbackModel: 'claude-3-haiku-20240307'
      }

      const response = await app.request('/api/rate-limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      })

      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ success: true, message: 'Rate limit updated' })
      expect(mockTokenUsageService.updateRateLimitConfig).toHaveBeenCalledWith({
        id: 1,
        tokenLimit: 200000,
        requestLimit: undefined,
        fallbackModel: 'claude-3-haiku-20240307'
      })
    })

    it('should return 400 for invalid requests', async () => {
      // Missing required fields
      const response1 = await app.request('/api/rate-limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1 })
      })
      
      expect(response1.status).toBe(400)
      expect(await response1.json()).toEqual({ error: 'At least one field to update must be specified' })

      // No limits specified
      const response2 = await app.request('/api/rate-limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-3-opus-20240229', windowSeconds: 300 })
      })
      
      expect(response2.status).toBe(400)
      expect(await response2.json()).toEqual({ error: 'At least one of tokenLimit or requestLimit must be specified' })
    })

    it('should return 501 for new rate limit creation', async () => {
      const response = await app.request('/api/rate-limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-3-opus-20240229',
          windowSeconds: 300,
          tokenLimit: 10000
        })
      })

      expect(response.status).toBe(501)
      expect(await response.json()).toEqual({ error: 'Creating new rate limits not yet implemented' })
    })
  })
})