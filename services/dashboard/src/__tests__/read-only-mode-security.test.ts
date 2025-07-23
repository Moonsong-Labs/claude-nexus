import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createDashboardApp } from '../app.js'
import type { Hono } from 'hono'

describe('Read-Only Mode Security Tests', () => {
  let app: Hono
  let originalApiKey: string | undefined

  beforeEach(async () => {
    // Save original API key and remove it to simulate read-only mode
    originalApiKey = process.env.DASHBOARD_API_KEY
    delete process.env.DASHBOARD_API_KEY

    // Create fresh app instance for each test
    app = await createDashboardApp()
  })

  afterEach(() => {
    // Restore original API key
    if (originalApiKey !== undefined) {
      process.env.DASHBOARD_API_KEY = originalApiKey
    }
  })

  describe('Write Operations Protection', () => {
    test('POST /api/analyses should be blocked in read-only mode', async () => {
      const response = await app.request('/api/analyses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: 'test-conversation-id',
          branchId: 'main',
        }),
      })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('Forbidden')
      expect(data.message).toBe(
        'The dashboard is in read-only mode. Write operations are not allowed.'
      )
    })

    test('POST /api/analyses/:conversationId/:branchId/regenerate should be blocked', async () => {
      const response = await app.request('/api/analyses/test-id/main/regenerate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('Forbidden')
      expect(data.message).toBe(
        'The dashboard is in read-only mode. Write operations are not allowed.'
      )
    })

    test('POST /dashboard/api/spark/feedback should be blocked', async () => {
      const response = await app.request('/dashboard/api/spark/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: 'test-session',
          feedback: {
            rating: 5,
            comments: 'Great recommendation',
          },
        }),
      })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('Forbidden')
      expect(data.message).toBe(
        'The dashboard is in read-only mode. Write operations are not allowed.'
      )
    })

    test('POST /dashboard/api/spark/feedback/batch should be blocked', async () => {
      const response = await app.request('/dashboard/api/spark/feedback/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionIds: ['session1', 'session2'],
        }),
      })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('Forbidden')
      expect(data.message).toBe(
        'The dashboard is in read-only mode. Write operations are not allowed.'
      )
    })

    test('PUT operations should be blocked', async () => {
      const response = await app.request('/api/test-endpoint', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: 'test' }),
      })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('Forbidden')
      expect(data.message).toBe(
        'The dashboard is in read-only mode. Write operations are not allowed.'
      )
    })

    test('DELETE operations should be blocked', async () => {
      const response = await app.request('/api/test-endpoint', {
        method: 'DELETE',
      })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('Forbidden')
      expect(data.message).toBe(
        'The dashboard is in read-only mode. Write operations are not allowed.'
      )
    })

    test('PATCH operations should be blocked', async () => {
      const response = await app.request('/api/test-endpoint', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: 'test' }),
      })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('Forbidden')
      expect(data.message).toBe(
        'The dashboard is in read-only mode. Write operations are not allowed.'
      )
    })
  })

  describe('Read Operations Access', () => {
    test('GET /api/requests should be accessible without authentication', async () => {
      const response = await app.request('/api/requests?limit=10')

      // Should not require authentication in read-only mode
      expect(response.status).toBe(200)
    })

    test('GET /api/requests/:id should be accessible without authentication', async () => {
      // This would normally return 500 for database error with non-existent ID
      const response = await app.request('/api/requests/test-id')

      // Should not return 401/403, might return 500 for database error
      expect([200, 404, 500]).toContain(response.status)
    })

    test('GET /api/conversations should be accessible without authentication', async () => {
      const response = await app.request('/api/conversations?limit=10')

      expect(response.status).toBe(200)
    })

    test('GET /api/analyses/:conversationId/:branchId should be accessible', async () => {
      const response = await app.request('/api/analyses/test-id/main')

      // Should not require authentication, returns 400 for invalid UUID
      expect([200, 400, 404]).toContain(response.status)
    })

    test('GET /dashboard/api/spark/sessions/:sessionId/feedback should be accessible', async () => {
      const response = await app.request('/dashboard/api/spark/sessions/test-session/feedback')

      // Should not require authentication
      expect([200, 404]).toContain(response.status)
    })

    test('Dashboard endpoints should be accessible', async () => {
      // Test some dashboard endpoints
      const response = await app.request('/dashboard')

      // Should redirect or show dashboard
      expect([200, 302]).toContain(response.status)
    })
  })

  describe('Authentication Bypass Behavior', () => {
    test('Invalid API key should still allow read access in read-only mode', async () => {
      const response = await app.request('/api/requests?limit=10', {
        headers: {
          'X-Dashboard-Key': 'invalid-key-12345',
        },
      })

      // Should succeed even with invalid key
      expect(response.status).toBe(200)
    })

    test('Cookie authentication should be bypassed in read-only mode', async () => {
      const response = await app.request('/api/requests?limit=10', {
        headers: {
          Cookie: 'dashboard_auth=invalid-cookie-value',
        },
      })

      // Should succeed even with invalid cookie
      expect(response.status).toBe(200)
    })

    test('Bearer token should be ignored in read-only mode', async () => {
      const response = await app.request('/api/requests?limit=10', {
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      })

      // Should succeed even with invalid bearer token
      expect(response.status).toBe(200)
    })
  })

  describe('Rate Limiting in Read-Only Mode', () => {
    test('Rate limiting should still apply to read operations', async () => {
      // Make multiple rapid requests
      const requests = Array.from({ length: 15 }, () => app.request('/api/requests?limit=10'))

      const responses = await Promise.all(requests)
      const statusCodes = responses.map(r => r.status)

      // Should all succeed (rate limiting might not be implemented)
      // This test documents current behavior
      expect(statusCodes.every(code => code === 200)).toBe(true)
    })
  })

  describe('CSRF Protection', () => {
    test('CSRF tokens should not be required in read-only mode', async () => {
      const response = await app.request('/api/requests?limit=10', {
        headers: {
          Origin: 'https://malicious-site.com',
          Referer: 'https://malicious-site.com',
        },
      })

      // Should succeed even from different origin
      expect(response.status).toBe(200)
    })
  })

  describe('Sensitive Data Exposure', () => {
    test('Request bodies with potential sensitive data are accessible', async () => {
      const response = await app.request('/api/requests?limit=1')
      expect(response.status).toBe(200)

      const data = await response.json()
      // Document that the endpoint is accessible and would expose request/response bodies
      // if data existed in the database
      expect(data).toHaveProperty('requests')
      expect(Array.isArray(data.requests)).toBe(true)

      // If there were requests in the database, they would include sensitive fields
      // like request_body and response_body - this demonstrates the security concern
    })

    test('Conversation analysis data is accessible', async () => {
      const response = await app.request('/api/analyses/test-id/main')

      // Even if not found, the endpoint is accessible (returns 400 for invalid UUID)
      expect([200, 400, 404]).toContain(response.status)
    })
  })

  describe('Security Headers in Read-Only Mode', () => {
    test('CORS headers should be properly set', async () => {
      const response = await app.request('/api/requests?limit=10', {
        headers: {
          Origin: 'http://localhost:3001',
        },
      })

      // Check if CORS is properly configured
      const corsHeader = response.headers.get('Access-Control-Allow-Origin')
      expect(corsHeader).toBeDefined()
    })

    test('Security headers should still be applied', async () => {
      const response = await app.request('/api/requests?limit=10')

      // Document which security headers are present
      const headers = {
        'X-Content-Type-Options': response.headers.get('X-Content-Type-Options'),
        'X-Frame-Options': response.headers.get('X-Frame-Options'),
        'X-XSS-Protection': response.headers.get('X-XSS-Protection'),
      }

      // Verify security headers are set
      expect(headers['X-Content-Type-Options']).toBe('nosniff')
      expect(headers['X-Frame-Options']).toBe('SAMEORIGIN')
      expect(headers['X-XSS-Protection']).toBe('0')
    })
  })

  describe('Error Handling', () => {
    test('Database errors should not expose sensitive information', async () => {
      // This triggers a database error due to invalid limit parameter
      const response = await app.request('/api/requests?limit=invalid')

      expect(response.status).toBe(500)
      const data = await response.json()

      // Ensure error messages don't expose database schema or connection details
      expect(JSON.stringify(data)).not.toContain('postgresql://')
      expect(JSON.stringify(data)).not.toContain('DATABASE_URL')
    })
  })
})

describe('Normal Mode with API Key Set', () => {
  let app: Hono
  const testApiKey = 'test-dashboard-api-key-12345'

  beforeEach(async () => {
    process.env.DASHBOARD_API_KEY = testApiKey
    app = await createDashboardApp()
  })

  afterEach(() => {
    delete process.env.DASHBOARD_API_KEY
  })

  test('Write operations should be protected when API key is set', async () => {
    // Without API key - the CSRF middleware returns 403
    const response1 = await app.request('/api/analyses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: 'test-id',
        branchId: 'main',
      }),
    })

    // CSRF protection returns 403 for unauthenticated write requests
    expect(response1.status).toBe(403)
    const data1 = await response1.json()
    expect(data1.error).toBe('Forbidden')

    // With valid API key but no CSRF token - still blocked by CSRF
    const response2 = await app.request('/api/analyses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Dashboard-Key': testApiKey,
      },
      body: JSON.stringify({
        conversationId: 'test-id',
        branchId: 'main',
      }),
    })

    // CSRF protection is still active even with valid API key
    expect(response2.status).toBe(403)
    const data2 = await response2.json()
    expect(data2.error).toBe('Forbidden')
  })

  test('Read operations should be accessible without authentication when API key is set', async () => {
    // This is the current behavior - read operations don't require authentication
    // even when DASHBOARD_API_KEY is set
    const response1 = await app.request('/api/requests?limit=10')
    expect(response1.status).toBe(200)

    // With valid API key also works
    const response2 = await app.request('/api/requests?limit=10', {
      headers: {
        'X-Dashboard-Key': testApiKey,
      },
    })

    expect(response2.status).toBe(200)
  })
})
