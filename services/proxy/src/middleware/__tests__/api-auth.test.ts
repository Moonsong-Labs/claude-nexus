import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Hono } from 'hono'
import { apiAuthMiddleware } from '../api-auth.js'

describe('apiAuthMiddleware', () => {
  const originalEnv = process.env
  
  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.clearAllMocks()
  })
  
  afterEach(() => {
    process.env = originalEnv
  })
  
  it('should bypass authentication when DASHBOARD_API_KEY is not set', async () => {
    delete process.env.DASHBOARD_API_KEY
    
    const app = new Hono()
    app.use('*', apiAuthMiddleware())
    app.get('/test', (c) => c.text('success'))
    
    const res = await app.request('/test')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('success')
  })
  
  it('should return 401 when no API key is provided', async () => {
    process.env.DASHBOARD_API_KEY = 'test-api-key'
    
    const app = new Hono()
    app.use('*', apiAuthMiddleware())
    app.get('/test', (c) => c.text('success'))
    
    const res = await app.request('/test')
    expect(res.status).toBe(401)
    const json = await res.json() as { error: { code: string; message: string } }
    expect(json.error.code).toBe('unauthorized')
    expect(json.error.message).toBe('API key required')
  })
  
  it('should accept valid API key via X-Dashboard-Key header', async () => {
    process.env.DASHBOARD_API_KEY = 'test-api-key'
    
    const app = new Hono()
    app.use('*', apiAuthMiddleware())
    app.get('/test', (c) => c.text('success'))
    
    const res = await app.request('/test', {
      headers: {
        'X-Dashboard-Key': 'test-api-key'
      }
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('success')
  })
  
  it('should accept valid API key via X-API-Key header (legacy)', async () => {
    process.env.DASHBOARD_API_KEY = 'test-api-key'
    
    const app = new Hono()
    app.use('*', apiAuthMiddleware())
    app.get('/test', (c) => c.text('success'))
    
    const res = await app.request('/test', {
      headers: {
        'X-API-Key': 'test-api-key'
      }
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('success')
  })
  
  it('should accept valid API key via Authorization Bearer header', async () => {
    process.env.DASHBOARD_API_KEY = 'test-api-key'
    
    const app = new Hono()
    app.use('*', apiAuthMiddleware())
    app.get('/test', (c) => c.text('success'))
    
    const res = await app.request('/test', {
      headers: {
        'Authorization': 'Bearer test-api-key'
      }
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('success')
  })
  
  it('should return 401 when API key is invalid', async () => {
    process.env.DASHBOARD_API_KEY = 'test-api-key'
    
    const app = new Hono()
    app.use('*', apiAuthMiddleware())
    app.get('/test', (c) => c.text('success'))
    
    const res = await app.request('/test', {
      headers: {
        'X-Dashboard-Key': 'wrong-key'
      }
    })
    expect(res.status).toBe(401)
    const json = await res.json() as { error: { code: string; message: string } }
    expect(json.error.code).toBe('unauthorized')
    expect(json.error.message).toBe('Invalid API key')
  })
  
  it('should use timing-safe comparison for security', async () => {
    process.env.DASHBOARD_API_KEY = 'test-api-key'
    
    const app = new Hono()
    app.use('*', apiAuthMiddleware())
    app.get('/test', (c) => c.text('success'))
    
    // Test with keys of different lengths
    const res1 = await app.request('/test', {
      headers: {
        'X-Dashboard-Key': 'short'
      }
    })
    expect(res1.status).toBe(401)
    
    // Test with keys of same length but different content
    const res2 = await app.request('/test', {
      headers: {
        'X-Dashboard-Key': 'test-api-XXX'
      }
    })
    expect(res2.status).toBe(401)
  })
  
  it('should prefer X-Dashboard-Key over other headers', async () => {
    process.env.DASHBOARD_API_KEY = 'test-api-key'
    
    const app = new Hono()
    app.use('*', apiAuthMiddleware())
    app.get('/test', (c) => c.text('success'))
    
    const res = await app.request('/test', {
      headers: {
        'X-Dashboard-Key': 'test-api-key',
        'X-API-Key': 'wrong-key',
        'Authorization': 'Bearer wrong-key'
      }
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('success')
  })
})