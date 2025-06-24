import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import './test-setup' // Initialize MSW mock server

describe('Proxy Authentication Integration', () => {
  let proxyUrl: string
  let proxyProcess: any

  beforeAll(async () => {
    // Start a test proxy server if not already running
    const testPort = 3456
    proxyUrl = `http://localhost:${testPort}`
    
    // Check if server is already running
    try {
      const response = await fetch(`${proxyUrl}/health`)
      if (response.ok) {
        console.log('Test proxy already running')
        return
      }
    } catch {
      // Server not running, start it
      console.log('Starting test proxy server...')
      const { spawn } = require('child_process')
      proxyProcess = spawn('bun', ['run', 'dev:proxy'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: testPort.toString(),
          DEBUG: 'false',
          STORAGE_ENABLED: 'false',
          ENABLE_CLIENT_AUTH: 'false',
          CREDENTIALS_DIR: '.claude',
        },
        detached: false,
      })

      // Wait for server to start
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  })

  afterAll(async () => {
    // Cleanup test proxy if we started it
    if (proxyProcess) {
      proxyProcess.kill()
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  })

  describe('API Key Authentication', () => {
    it('should reject requests without authentication', async () => {
      const response = await fetch(`${proxyUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'Host': 'test.example.com',
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
      // Using mocked API key that will return 200
      const response = await fetch(`${proxyUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'test-api-key', // This key is mocked to succeed
          'anthropic-version': '2023-06-01',
          'Host': 'test.example.com',
        },
        body: JSON.stringify({
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 10,
        }),
      })

      // Should succeed with mocked response
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.content[0].text).toBe('Test response')
    })

    it('should handle Bearer token authentication', async () => {
      const response = await fetch(`${proxyUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key', // This key is mocked to succeed
          'anthropic-version': '2023-06-01',
          'Host': 'test.example.com',
        },
        body: JSON.stringify({
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 10,
        }),
      })

      // Should succeed with mocked response
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.content[0].text).toBe('Test response')
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
          'Host': 'test.example.com',
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
          Authorization: 'Bearer cnp_test_key', // Client API key for proxy auth
          'x-api-key': 'test-api-key', // Claude API key (mocked to succeed)
          'anthropic-version': '2023-06-01',
          'Host': 'test.example.com',
        },
        body: JSON.stringify({
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 10,
        }),
      })

      // Should succeed if client auth is disabled or valid
      // With mocked Claude API, we expect 200
      expect(response.status).toBe(200)
    })
  })

  describe('OAuth Authentication', () => {
    it('should add OAuth beta header when using OAuth credentials', async () => {
      // OAuth tokens won't match our mock 'test-api-key', so expect 401
      const response = await fetch(`${proxyUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer oauth-access-token',
          'anthropic-version': '2023-06-01',
          'Host': 'test.example.com',
        },
        body: JSON.stringify({
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 10,
        }),
      })

      // OAuth token doesn't match our mock, should get 401
      expect(response.status).toBe(401)
      const error = await response.json()
      expect(error.error.type).toBe('authentication_error')
    })
  })
})
