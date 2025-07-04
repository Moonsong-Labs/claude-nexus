import { describe, test, expect } from 'bun:test'

describe('Simple E2E Test', () => {
  test('mock API health check', async () => {
    const response = await fetch('http://localhost:8080/health')
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual({ status: 'ok', service: 'mock-claude' })
  })

  test('proxy with mock backend', async () => {
    const response = await fetch('http://localhost:3000/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer cnp_test_1234567890',
        Host: 'e2e-test.com',
        'x-api-key': 'sk-ant-test-key',
      },
      body: JSON.stringify({
        model: 'claude-3-opus-20240229',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 10,
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.type).toBe('message')
    expect(data.role).toBe('assistant')
  })
})
