import { describe, test, expect } from 'bun:test'

// Skip these tests in CI since they require a running mock server
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'

describe.skipIf(isCI)('Mock Claude API Tests', () => {
  const MOCK_API_URL = 'http://localhost:8081'

  test('mock API health check', async () => {
    const response = await fetch(`${MOCK_API_URL}/health`)
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual({ status: 'ok', service: 'mock-claude' })
  })

  test('simple text completion', async () => {
    const response = await fetch(`${MOCK_API_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-opus-20240229',
        messages: [{ role: 'user', content: 'What is the capital of France?' }],
        stream: false,
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.type).toBe('message')
    expect(data.role).toBe('assistant')
    expect(data.content[0].text).toBe('The capital of France is Paris.')
    expect(data.usage.input_tokens).toBe(12)
    expect(data.usage.output_tokens).toBe(8)
  })

  test('streaming response', async () => {
    const response = await fetch(`${MOCK_API_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-opus-20240229',
        messages: [{ role: 'user', content: 'Tell me a short poem.' }],
        stream: true,
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream')

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No reader available')

    const chunks: string[] = []
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(decoder.decode(value))
    }

    const fullResponse = chunks.join('')
    expect(fullResponse).toContain('event: message_start')
    expect(fullResponse).toContain('event: content_block_delta')
    expect(fullResponse).toContain('Roses are red')
    expect(fullResponse).toContain('event: message_stop')
  })

  test('rate limit error', async () => {
    const response = await fetch(`${MOCK_API_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-opus-20240229',
        messages: [{ role: 'user', content: 'TRIGGER_RATE_LIMIT' }],
      }),
    })

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    
    const data = await response.json()
    expect(data.type).toBe('error')
    expect(data.error.type).toBe('rate_limit_error')
  })

  test('web search tool usage response', async () => {
    const response = await fetch(`${MOCK_API_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-20250514',
        messages: [{ role: 'user', content: "Tell me about Viem's signature functions" }],
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.model).toBe('claude-opus-4-20250514')
    expect(data.usage.service_tier).toBe('standard')
    expect(data.usage.server_tool_use?.web_search_requests).toBe(1)
    expect(data.usage.cache_read_input_tokens).toBe(2083)
    expect(data.usage.cache_creation_input_tokens).toBe(5446)
  })

  test('default fallback response', async () => {
    const response = await fetch(`${MOCK_API_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        messages: [{ role: 'user', content: 'Random unmatched request' }],
      }),
    })

    // Should return 404 because default.json has empty request matcher
    // But since we created a catch-all default.json with {}, it will match
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.content[0].text).toContain('mock Claude API response')
  })
})
