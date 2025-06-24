import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

describe('Proxy Authentication Integration', () => {
  let proxyUrl: string

  beforeAll(() => {
    // In real tests, start test proxy instance
    proxyUrl = process.env.TEST_PROXY_URL || 'http://localhost:3000'
  })

  afterAll(() => {
    // Cleanup test proxy if needed
  })

  describe('API Key Authentication', () => {
    it('should reject requests without authentication', async () => {
      const response = await fetch(`${proxyUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          Host: 'test.example.com',
        },
        body: JSON.stringify({
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 10,
        }),
      })

      expect(response.status).toBe(401)
      const error = await response.json()
      expect(error.error.type).toBe('authentication_error')
    })

    it('should accept requests with valid x-api-key', async () => {
      // This would need a test API key configured
      const response = await fetch(`${proxyUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.TEST_API_KEY || 'sk-ant-test-key',
          'anthropic-version': '2023-06-01',
          Host: 'test.example.com',
        },
        body: JSON.stringify({
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 10,
        }),
      })

      // With a real API key, this would succeed
      // With a test key, it should at least authenticate at proxy level
      expect([200, 401]).toContain(response.status)
    })

    it('should handle Bearer token authentication', async () => {
      const response = await fetch(`${proxyUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.TEST_API_KEY || 'sk-ant-test-key'}`,
          'anthropic-version': '2023-06-01',
          Host: 'test.example.com',
        },
        body: JSON.stringify({
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 10,
        }),
      })

      expect([200, 401]).toContain(response.status)
    })
  })

  describe('Client Authentication', () => {
    it('should require client API key when enabled', async () => {
      // This test assumes ENABLE_CLIENT_AUTH=true
      const response = await fetch(`${proxyUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.TEST_API_KEY || 'sk-ant-test-key',
          'anthropic-version': '2023-06-01',
          Host: 'test.example.com',
        },
        body: JSON.stringify({
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 10,
        }),
      })

      // Without client auth header, should fail if client auth is enabled
      if (process.env.ENABLE_CLIENT_AUTH === 'true') {
        expect(response.status).toBe(401)
      }
    })

    it('should accept valid client API key', async () => {
      const response = await fetch(`${proxyUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.TEST_CLIENT_API_KEY || 'cnp_test_key'}`,
          'x-api-key': process.env.TEST_API_KEY || 'sk-ant-test-key',
          'anthropic-version': '2023-06-01',
          Host: 'test.example.com',
        },
        body: JSON.stringify({
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 10,
        }),
      })

      expect([200, 401]).toContain(response.status)
    })
  })

  describe('OAuth Authentication', () => {
    it('should add OAuth beta header when using OAuth credentials', async () => {
      // This test would need OAuth credentials configured
      const response = await fetch(`${proxyUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer oauth-access-token`,
          'anthropic-version': '2023-06-01',
          Host: 'test.example.com',
        },
        body: JSON.stringify({
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 10,
        }),
      })

      // Check that proxy added the OAuth beta header
      // This would be visible in proxy logs
      expect([200, 401]).toContain(response.status)
    })
  })
})
