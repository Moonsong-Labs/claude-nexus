import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Hono } from 'hono'
import request from 'supertest'
import { mockServer } from '../../test-setup/setup'
import { rest } from 'msw'
import { requestFactory, responseFactory } from '../helpers/test-factories'

describe('Performance and Memory Tests', () => {
  let app: Hono
  let initialMemory: number
  
  beforeAll(async () => {
    // Set up minimal app without database
    process.env.CLAUDE_API_KEY = 'sk-ant-api03-test-key'
    delete process.env.DATABASE_URL
    delete process.env.DB_HOST
    
    const { default: createApp } = await import('@/index')
    app = createApp()
    
    // Mock Claude API to respond quickly
    mockServer.use(
      rest.post('https://api.anthropic.com/v1/messages', (req, res, ctx) => {
        return res(
          ctx.status(200),
          ctx.json(responseFactory.simple({
            usage: { input_tokens: 10, output_tokens: 20 }
          }))
        )
      })
    )
    
    // Force garbage collection and record initial memory
    if (global.gc) {
      global.gc()
    }
    initialMemory = process.memoryUsage().heapUsed
  })
  
  afterAll(() => {
    // Clean up
  })
  
  describe('Memory Leak Detection', () => {
    it('should not leak memory with previousUserMessages cache', async () => {
      // Generate 2000 unique domains to test cache eviction
      const domains = Array.from({ length: 2000 }, (_, i) => `test-${i}.example.com`)
      
      // Make requests with different domains
      for (const domain of domains) {
        await request(app.fetch)
          .post('/v1/messages')
          .set('Host', domain)
          .send(requestFactory.simple())
          .expect(200)
      }
      
      // Force garbage collection
      if (global.gc) {
        global.gc()
      }
      
      const memoryAfterRequests = process.memoryUsage().heapUsed
      const memoryGrowth = memoryAfterRequests - initialMemory
      
      // Memory growth should be limited due to cache size limit
      // Allow up to 5MB growth (cache + other allocations)
      expect(memoryGrowth).toBeLessThan(5 * 1024 * 1024)
    }, 60000) // 60 second timeout
    
    it('should handle concurrent requests without memory spikes', async () => {
      const concurrentRequests = 100
      const requestsPerBatch = 10
      
      // Record memory before test
      if (global.gc) global.gc()
      const memoryBefore = process.memoryUsage().heapUsed
      
      // Execute requests in batches
      for (let batch = 0; batch < concurrentRequests / requestsPerBatch; batch++) {
        const promises = Array.from({ length: requestsPerBatch }, (_, i) =>
          request(app.fetch)
            .post('/v1/messages')
            .set('Host', `concurrent-${batch}-${i}.example.com`)
            .send(requestFactory.simple())
        )
        
        await Promise.all(promises)
      }
      
      // Check memory after all requests
      if (global.gc) global.gc()
      const memoryAfter = process.memoryUsage().heapUsed
      const memoryGrowth = memoryAfter - memoryBefore
      
      // Should handle 100 concurrent requests with minimal memory growth
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024) // 10MB max
    })
    
    it('should handle streaming responses without memory accumulation', async () => {
      // Mock large streaming response
      const largeText = 'Lorem ipsum '.repeat(1000) // ~12KB of text
      const streamChunks = []
      
      // Create many small chunks to simulate real streaming
      for (let i = 0; i < 100; i++) {
        streamChunks.push({
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'text_delta',
            text: largeText.slice(i * 120, (i + 1) * 120)
          }
        })
      }
      
      mockServer.use(
        rest.post('https://api.anthropic.com/v1/messages', (req, res, ctx) => {
          return res(
            ctx.status(200),
            ctx.set('Content-Type', 'text/event-stream'),
            ctx.body(global.testUtils.createStreamResponse([
              responseFactory.streamChunks.messageStart(),
              responseFactory.streamChunks.contentBlockStart(),
              ...streamChunks,
              responseFactory.streamChunks.contentBlockStop(),
              responseFactory.streamChunks.messageDelta(1500),
              responseFactory.streamChunks.messageStop()
            ]))
          )
        })
      )
      
      if (global.gc) global.gc()
      const memoryBefore = process.memoryUsage().heapUsed
      
      // Process 10 large streaming requests
      for (let i = 0; i < 10; i++) {
        await request(app.fetch)
          .post('/v1/messages')
          .send({ ...requestFactory.simple(), stream: true })
          .expect(200)
      }
      
      if (global.gc) global.gc()
      const memoryAfter = process.memoryUsage().heapUsed
      const memoryGrowth = memoryAfter - memoryBefore
      
      // Should not accumulate memory from streaming
      expect(memoryGrowth).toBeLessThan(5 * 1024 * 1024) // 5MB max
    })
  })
  
  describe('Response Time Performance', () => {
    it('should maintain sub-100ms response time for simple requests', async () => {
      const iterations = 50
      const responseTimes: number[] = []
      
      for (let i = 0; i < iterations; i++) {
        const start = process.hrtime.bigint()
        
        await request(app.fetch)
          .post('/v1/messages')
          .send(requestFactory.simple())
          .expect(200)
        
        const end = process.hrtime.bigint()
        const duration = Number(end - start) / 1_000_000 // Convert to milliseconds
        responseTimes.push(duration)
      }
      
      // Calculate statistics
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      const p95ResponseTime = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)]
      const p99ResponseTime = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.99)]
      
      // Performance assertions
      expect(avgResponseTime).toBeLessThan(50) // Average under 50ms
      expect(p95ResponseTime).toBeLessThan(100) // 95th percentile under 100ms
      expect(p99ResponseTime).toBeLessThan(200) // 99th percentile under 200ms
    })
    
    it('should handle token stats endpoint efficiently with many domains', async () => {
      // Create stats for many domains
      const domains = Array.from({ length: 100 }, (_, i) => `perf-test-${i}.example.com`)
      
      // Generate traffic for each domain
      for (const domain of domains) {
        await request(app.fetch)
          .post('/v1/messages')
          .set('Host', domain)
          .send(requestFactory.simple())
      }
      
      // Measure token stats endpoint performance
      const start = process.hrtime.bigint()
      
      const response = await request(app.fetch)
        .get('/token-stats')
        .expect(200)
      
      const end = process.hrtime.bigint()
      const duration = Number(end - start) / 1_000_000
      
      // Should aggregate stats for 100 domains quickly
      expect(duration).toBeLessThan(50) // Under 50ms
      expect(Object.keys(response.body.domains)).toHaveLength(100)
    })
  })
  
  describe('Load Testing', () => {
    it('should handle sustained load without degradation', async () => {
      const duration = 10000 // 10 seconds
      const targetRPS = 50 // 50 requests per second
      const interval = 1000 / targetRPS
      
      let successCount = 0
      let errorCount = 0
      const responseTimes: number[] = []
      
      const startTime = Date.now()
      
      // Use setInterval to maintain consistent request rate
      await new Promise<void>((resolve) => {
        const intervalId = setInterval(async () => {
          if (Date.now() - startTime >= duration) {
            clearInterval(intervalId)
            resolve()
            return
          }
          
          const reqStart = process.hrtime.bigint()
          
          try {
            await request(app.fetch)
              .post('/v1/messages')
              .send(requestFactory.simple({ max_tokens: 10 }))
              .expect(200)
            
            successCount++
            
            const reqEnd = process.hrtime.bigint()
            responseTimes.push(Number(reqEnd - reqStart) / 1_000_000)
          } catch (error) {
            errorCount++
          }
        }, interval)
      })
      
      // Calculate results
      const totalRequests = successCount + errorCount
      const successRate = successCount / totalRequests
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      
      // Performance criteria
      expect(successRate).toBeGreaterThan(0.99) // 99% success rate
      expect(avgResponseTime).toBeLessThan(100) // Average under 100ms
      expect(errorCount).toBeLessThan(totalRequests * 0.01) // Less than 1% errors
    }, 15000) // 15 second timeout
  })
})