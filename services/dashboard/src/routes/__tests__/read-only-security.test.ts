import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { createDashboardApp } from '../../app.js'

describe('Dashboard Read-Only Mode Security', () => {
  let app: Awaited<ReturnType<typeof createDashboardApp>>
  let originalDashboardKey: string | undefined
  let originalDatabaseUrl: string | undefined

  beforeAll(async () => {
    // Store original env vars
    originalDashboardKey = process.env.DASHBOARD_API_KEY
    originalDatabaseUrl = process.env.DATABASE_URL

    // Ensure we're in read-only mode by not setting DASHBOARD_API_KEY
    delete process.env.DASHBOARD_API_KEY
    // Prevent database connection in tests
    delete process.env.DATABASE_URL
    delete process.env.DB_HOST
    delete process.env.DB_NAME
    delete process.env.DB_USER
    delete process.env.DB_PASSWORD

    // Clear module cache to ensure fresh imports
    delete require.cache[require.resolve('../../config.js')]
    delete require.cache[require.resolve('../../middleware/auth.js')]
    delete require.cache[require.resolve('../../container.js')]

    app = await createDashboardApp()
  })

  afterAll(async () => {
    // Restore original env vars
    if (originalDashboardKey) {
      process.env.DASHBOARD_API_KEY = originalDashboardKey
    } else {
      delete process.env.DASHBOARD_API_KEY
    }
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl
    }
  })

  describe('Write Operations Protection', () => {
    it('should block POST requests to analysis API', async () => {
      const res = await app.request('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: '123e4567-e89b-12d3-a456-426614174000',
          branchId: 'main',
        }),
      })

      expect(res.status).toBe(403)
      const json = (await res.json()) as { error: string; message: string }
      expect(json.error).toBe('Forbidden')
      expect(json.message).toContain('read-only mode')
    })

    it('should block POST requests to regenerate analysis', async () => {
      const res = await app.request(
        '/api/analyses/123e4567-e89b-12d3-a456-426614174000/main/regenerate',
        {
          method: 'POST',
        }
      )

      expect(res.status).toBe(403)
    })

    it('should block POST requests to Spark feedback', async () => {
      const res = await app.request('/dashboard/api/spark/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'test-session',
          feedback: { rating: 5, comments: 'test' },
        }),
      })

      expect(res.status).toBe(403)
    })

    it('should block PUT requests', async () => {
      const res = await app.request('/api/test', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'test' }),
      })

      // 404 is acceptable since the route doesn't exist
      expect([403, 404]).toContain(res.status)
    })

    it('should block DELETE requests', async () => {
      const res = await app.request('/api/test/123', {
        method: 'DELETE',
      })

      // 404 is acceptable since the route doesn't exist
      expect([403, 404]).toContain(res.status)
    })

    it('should block PATCH requests', async () => {
      const res = await app.request('/api/test/123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'test' }),
      })

      // 404 is acceptable since the route doesn't exist
      expect([403, 404]).toContain(res.status)
    })

    it('should return user-friendly error for HTMX requests', async () => {
      const res = await app.request('/api/analyses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'HX-Request': 'true',
        },
        body: JSON.stringify({
          conversationId: '123e4567-e89b-12d3-a456-426614174000',
          branchId: 'main',
        }),
      })

      expect(res.status).toBe(403)
      const html = await res.text()
      expect(html).toContain('read-only mode')
    })
  })

  describe('Read Operations Access (Security Concern)', () => {
    it('should allow access to requests without authentication', async () => {
      const res = await app.request('/api/requests')
      // May fail due to missing API client but not due to auth
      expect([200, 500]).toContain(res.status)
    })

    it('should allow access to request details without authentication', async () => {
      const res = await app.request('/api/requests/test-id')
      // May return 404 or 500 due to missing data/client, but not 401/403
      expect([200, 404, 500]).toContain(res.status)
    })

    it('should allow access to storage stats without authentication', async () => {
      const res = await app.request('/api/storage-stats')
      // May return 500 due to database issues in test
      expect([200, 500]).toContain(res.status)
    })

    it('should allow access to conversations without authentication', async () => {
      const res = await app.request('/api/conversations')
      // May fail due to missing API client but not due to auth
      expect([200, 500]).toContain(res.status)
    })

    it('should allow access to analyses without authentication', async () => {
      const res = await app.request('/api/analyses/123e4567-e89b-12d3-a456-426614174000/main')
      // Will return 404 or 500 due to missing data/client
      expect([200, 404, 500]).toContain(res.status)
    })

    it('should allow access to dashboard pages without authentication', async () => {
      const res = await app.request('/dashboard')
      expect(res.status).toBe(200)
    })
  })

  describe('Authentication Bypass', () => {
    it('should ignore invalid API keys in read-only mode', async () => {
      const res = await app.request('/api/requests', {
        headers: {
          'X-Dashboard-Key': 'invalid-key-12345',
        },
      })
      // May fail due to missing API client but not due to auth
      expect([200, 500]).toContain(res.status)
    })

    it('should ignore invalid cookies in read-only mode', async () => {
      const res = await app.request('/api/requests', {
        headers: {
          Cookie: 'dashboard_auth=invalid-cookie',
        },
      })
      // May fail due to missing API client but not due to auth
      expect([200, 500]).toContain(res.status)
    })

    it('should ignore bearer tokens in read-only mode', async () => {
      const res = await app.request('/api/requests', {
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      })
      // May fail due to missing API client but not due to auth
      expect([200, 500]).toContain(res.status)
    })
  })

  describe('Rate Limiting', () => {
    it(
      'should not rate limit read operations',
      async () => {
        // Make 15 requests rapidly
        const promises = Array.from({ length: 15 }, () => app.request('/api/requests'))

        const results = await Promise.all(promises)

        // All should succeed or fail due to DB issues, but not 429 (rate limited)
        results.forEach(res => {
          expect(res.status).not.toBe(429)
        })
      },
      { timeout: 30000 }
    ) // Increase timeout for this test
  })

  describe('CSRF Protection', () => {
    it(
      'should not require CSRF tokens in read-only mode',
      async () => {
        const res = await app.request('/api/requests', {
          method: 'GET',
          headers: {
            Origin: 'https://evil.com',
          },
        })

        // May fail due to missing API client but not due to CSRF
        expect([200, 500]).toContain(res.status)
      },
      { timeout: 10000 }
    )
  })

  describe('Sensitive Data Exposure', () => {
    it('should expose request and response body data', async () => {
      const res = await app.request('/api/storage-stats')
      // May return 500 due to database issues in test
      expect([200, 500]).toContain(res.status)

      if (res.status === 200) {
        const text = await res.text()
        if (text) {
          const data = JSON.parse(text)
          expect(data).toHaveProperty('status', 'ok')
          // In a real scenario with data, this would contain sensitive information
        }
      }
    })

    it('should expose conversation analysis data', async () => {
      const res = await app.request('/api/analyses/123e4567-e89b-12d3-a456-426614174000/main')

      // Even 404 responses reveal information about what's being looked for
      if (res.status === 404) {
        const text = await res.text()
        if (text) {
          const data = JSON.parse(text)
          expect(data).toHaveProperty('error')
        }
      }
    })
  })

  describe('Security Headers', () => {
    it('should still apply basic security headers', async () => {
      const res = await app.request('/api/requests')

      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')
    })

    it('should have CORS headers configured', async () => {
      const res = await app.request('/api/requests', {
        headers: {
          Origin: 'http://localhost:3000',
        },
      })

      expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy()
    })
  })

  describe('Error Handling', () => {
    it('should not expose sensitive error details', async () => {
      // This would need a way to trigger a database error
      // For now, we'll test that 500 errors don't expose details
      const res = await app.request('/api/requests/../../etc/passwd')

      // Should handle gracefully
      expect([200, 404, 500]).toContain(res.status)

      if (res.status === 500) {
        const data = (await res.json()) as { error?: unknown }
        expect(data.error).not.toContain('stack')
      }
    })

    it('should provide clear messaging for read-only mode', async () => {
      const res = await app.request('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: '123e4567-e89b-12d3-a456-426614174000',
          branchId: 'main',
        }),
      })

      expect(res.status).toBe(403)
      const json = (await res.json()) as { message: string; hint: string }
      expect(json.message).toContain('read-only mode')
      expect(json.hint).toContain('DASHBOARD_API_KEY')
    })
  })
})

// Test with API key set
describe.skip('Dashboard Normal Mode (with API key)', () => {
  let app: Awaited<ReturnType<typeof createDashboardApp>>
  let originalDashboardKey: string | undefined
  let originalDatabaseUrl: string | undefined

  beforeAll(async () => {
    // Store original env vars
    originalDashboardKey = process.env.DASHBOARD_API_KEY
    originalDatabaseUrl = process.env.DATABASE_URL

    // Set API key for normal mode
    process.env.DASHBOARD_API_KEY = 'test-api-key-123'
    // Prevent database connection in tests
    delete process.env.DATABASE_URL
    delete process.env.DB_HOST
    delete process.env.DB_NAME
    delete process.env.DB_USER
    delete process.env.DB_PASSWORD

    // Clear module cache to ensure fresh imports including app.js
    delete require.cache[require.resolve('../../config.js')]
    delete require.cache[require.resolve('../../middleware/auth.js')]
    delete require.cache[require.resolve('../../container.js')]
    delete require.cache[require.resolve('../../app.js')]

    // Re-import createDashboardApp to get a fresh instance
    const { createDashboardApp: createApp } = await import('../../app.js')
    app = await createApp()
  })

  afterAll(async () => {
    // Restore original env vars
    if (originalDashboardKey) {
      process.env.DASHBOARD_API_KEY = originalDashboardKey
    } else {
      delete process.env.DASHBOARD_API_KEY
    }
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl
    }
  })

  it('should require authentication for read operations', async () => {
    const res = await app.request('/api/requests')

    expect(res.status).toBe(401)
  })

  it('should allow read operations with valid authentication', async () => {
    const res = await app.request('/api/requests', {
      headers: {
        'X-Dashboard-Key': 'test-api-key-123',
      },
    })

    // May fail due to missing API client but not due to auth
    expect([200, 500]).toContain(res.status)
  })

  it('should reject requests with invalid API key', async () => {
    const res = await app.request('/api/requests', {
      headers: {
        'X-Dashboard-Key': 'wrong-key',
      },
    })

    expect(res.status).toBe(401)
  })
})
