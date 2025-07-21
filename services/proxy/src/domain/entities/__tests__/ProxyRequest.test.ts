import { describe, it, expect } from 'bun:test'
import { ProxyRequest } from '../ProxyRequest'
import { ClaudeMessagesRequest, ClaudeTextContent } from '@claude-nexus/shared'

// Test constants
const TEST_HOST = 'test.domain.com'
const TEST_REQUEST_ID = 'test-request-123'
const TEST_API_KEY = 'sk-ant-test-key'
const OPUS_MODEL = 'claude-3-opus-20240229'

// Helper function to create a basic request
function createBasicRequest(overrides: Partial<ClaudeMessagesRequest> = {}): ClaudeMessagesRequest {
  return {
    model: OPUS_MODEL,
    messages: [{ role: 'user', content: 'Hello' }],
    max_tokens: 100,
    ...overrides,
  }
}

describe('ProxyRequest', () => {
  describe('constructor and basic properties', () => {
    it('should initialize with provided values', () => {
      const rawRequest = createBasicRequest()
      const request = new ProxyRequest(rawRequest, TEST_HOST, TEST_REQUEST_ID, TEST_API_KEY)

      expect(request.raw).toBe(rawRequest)
      expect(request.host).toBe(TEST_HOST)
      expect(request.requestId).toBe(TEST_REQUEST_ID)
      expect(request.apiKey).toBe(TEST_API_KEY)
      expect(request.model).toBe(OPUS_MODEL)
    })

    it('should work without optional apiKey', () => {
      const request = new ProxyRequest(createBasicRequest(), TEST_HOST, TEST_REQUEST_ID)

      expect(request.apiKey).toBeUndefined()
    })
  })

  describe('streaming detection', () => {
    it('should detect streaming when stream is true', () => {
      const request = new ProxyRequest(
        createBasicRequest({ stream: true }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.isStreaming).toBe(true)
    })

    it('should detect non-streaming when stream is false', () => {
      const request = new ProxyRequest(
        createBasicRequest({ stream: false }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.isStreaming).toBe(false)
    })

    it('should default to non-streaming when stream is not specified', () => {
      const request = new ProxyRequest(createBasicRequest(), TEST_HOST, TEST_REQUEST_ID)

      expect(request.isStreaming).toBe(false)
    })
  })

  describe('request type determination', () => {
    it('should identify quota requests based on user content', () => {
      const request = new ProxyRequest(
        createBasicRequest({
          messages: [{ role: 'user', content: 'quota' }],
        }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.requestType).toBe('quota')
    })

    it('should identify quota requests with whitespace', () => {
      const request = new ProxyRequest(
        createBasicRequest({
          messages: [{ role: 'user', content: '  quota  ' }],
        }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.requestType).toBe('quota')
    })

    it('should identify quota requests case-insensitively', () => {
      const request = new ProxyRequest(
        createBasicRequest({
          messages: [{ role: 'user', content: 'QUOTA' }],
        }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.requestType).toBe('quota')
    })

    it('should identify query_evaluation requests with no system messages', () => {
      const request = new ProxyRequest(createBasicRequest(), TEST_HOST, TEST_REQUEST_ID)

      expect(request.requestType).toBe('query_evaluation')
      expect(request.systemMessageCount).toBe(0)
    })

    it('should identify query_evaluation requests with one system message', () => {
      const request = new ProxyRequest(
        createBasicRequest({
          system: 'You are a helpful assistant',
        }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.requestType).toBe('query_evaluation')
      expect(request.systemMessageCount).toBe(1)
    })

    it('should identify inference requests with two or more system messages', () => {
      const request = new ProxyRequest(
        createBasicRequest({
          messages: [
            { role: 'system', content: 'System prompt 1' },
            { role: 'system', content: 'System prompt 2' },
            { role: 'user', content: 'Hello' },
          ],
        }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.requestType).toBe('inference')
      expect(request.systemMessageCount).toBe(2)
    })
  })

  describe('user content extraction', () => {
    it('should extract content from string message', () => {
      const content = 'What is the weather?'
      const request = new ProxyRequest(
        createBasicRequest({
          messages: [{ role: 'user', content }],
        }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.getUserContent()).toBe(content)
    })

    it('should extract content from the last user message', () => {
      const request = new ProxyRequest(
        createBasicRequest({
          messages: [
            { role: 'user', content: 'First question' },
            { role: 'assistant', content: 'Response' },
            { role: 'user', content: 'Second question' },
          ],
        }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.getUserContent()).toBe('Second question')
    })

    it('should handle content blocks array', () => {
      const request = new ProxyRequest(
        createBasicRequest({
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Part one' },
                { type: 'text', text: 'Part two' },
              ],
            },
          ],
        }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.getUserContent()).toBe('Part one\nPart two')
    })

    it('should filter out non-text content blocks', () => {
      const request = new ProxyRequest(
        createBasicRequest({
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Look at this:' },
                {
                  type: 'image',
                  source: { type: 'base64', media_type: 'image/png', data: 'base64data' },
                },
                { type: 'text', text: 'What do you see?' },
              ],
            },
          ],
        }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.getUserContent()).toBe('Look at this:\nWhat do you see?')
    })

    it('should return empty string when no user messages exist', () => {
      const request = new ProxyRequest(
        createBasicRequest({
          messages: [{ role: 'assistant', content: 'Hello' }],
        }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.getUserContent()).toBe('')
    })

    it('should handle empty content array', () => {
      const request = new ProxyRequest(
        createBasicRequest({
          messages: [{ role: 'user', content: [] }],
        }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.getUserContent()).toBe('')
    })
  })

  describe('user content for notifications', () => {
    it('should not filter system reminders for non-inference requests', () => {
      const content = [
        { type: 'text', text: 'System reminder 1' },
        { type: 'text', text: 'User actual question' },
        { type: 'text', text: 'System reminder 2' },
      ] as ClaudeTextContent[]

      const request = new ProxyRequest(
        createBasicRequest({
          messages: [{ role: 'user', content }],
        }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.getUserContentForNotification()).toBe(
        'System reminder 1\nUser actual question\nSystem reminder 2'
      )
    })

    it('should filter first and last text blocks for inference requests with >2 blocks', () => {
      const content = [
        { type: 'text', text: 'System reminder start' },
        { type: 'text', text: 'Actual content 1' },
        { type: 'text', text: 'Actual content 2' },
        { type: 'text', text: 'System reminder end' },
      ] as ClaudeTextContent[]

      const request = new ProxyRequest(
        createBasicRequest({
          system: 'System 1',
          messages: [
            { role: 'system', content: 'System 2' },
            { role: 'user', content },
          ],
        }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.getUserContentForNotification()).toBe('Actual content 1\nActual content 2')
    })

    it('should not filter when inference request has 2 or fewer text blocks', () => {
      const content = [
        { type: 'text', text: 'Block 1' },
        { type: 'text', text: 'Block 2' },
      ] as ClaudeTextContent[]

      const request = new ProxyRequest(
        createBasicRequest({
          system: 'System 1',
          messages: [
            { role: 'system', content: 'System 2' },
            { role: 'user', content },
          ],
        }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.getUserContentForNotification()).toBe('Block 1\nBlock 2')
    })
  })

  describe('content change detection', () => {
    it('should detect when content has changed', () => {
      const request = new ProxyRequest(
        createBasicRequest({
          messages: [{ role: 'user', content: 'New question' }],
        }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.hasUserContentChanged('Old question')).toBe(true)
    })

    it('should detect when content has not changed', () => {
      const content = 'Same question'
      const request = new ProxyRequest(
        createBasicRequest({
          messages: [{ role: 'user', content }],
        }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.hasUserContentChanged(content)).toBe(false)
    })

    it('should use notification content for comparison in inference requests', () => {
      const content = [
        { type: 'text', text: 'System reminder' },
        { type: 'text', text: 'Real content' },
        { type: 'text', text: 'System reminder' },
      ] as ClaudeTextContent[]

      const request = new ProxyRequest(
        createBasicRequest({
          system: 'System 1',
          messages: [
            { role: 'system', content: 'System 2' },
            { role: 'user', content },
          ],
        }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      // Should match the filtered content, not the full content
      expect(request.hasUserContentChanged('Real content')).toBe(false)
      expect(request.hasUserContentChanged('System reminder\nReal content\nSystem reminder')).toBe(
        true
      )
    })
  })

  describe('header creation', () => {
    it('should create headers with required Claude API fields', () => {
      const request = new ProxyRequest(createBasicRequest(), TEST_HOST, TEST_REQUEST_ID)

      const headers = request.createHeaders({})

      expect(headers['Content-Type']).toBe('application/json')
      expect(headers['anthropic-version']).toBe('2023-06-01')
    })

    it('should include auth headers except x-api-key', () => {
      const request = new ProxyRequest(createBasicRequest(), TEST_HOST, TEST_REQUEST_ID)

      const headers = request.createHeaders({
        Authorization: 'Bearer token',
        'x-api-key': 'should-be-filtered',
        'Custom-Header': 'custom-value',
      })

      expect(headers.Authorization).toBe('Bearer token')
      expect(headers['x-api-key']).toBeUndefined()
      expect(headers['Custom-Header']).toBe('custom-value')
    })

    it('should allow auth headers to override defaults', () => {
      const request = new ProxyRequest(createBasicRequest(), TEST_HOST, TEST_REQUEST_ID)

      const headers = request.createHeaders({
        'Content-Type': 'text/plain',
        'anthropic-version': '2022-01-01',
      })

      // Auth headers can override defaults (spread after defaults)
      expect(headers['Content-Type']).toBe('text/plain')
      expect(headers['anthropic-version']).toBe('2022-01-01')
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle requests with no messages array', () => {
      const request = new ProxyRequest(
        { model: OPUS_MODEL, messages: [], max_tokens: 100 },
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.getUserContent()).toBe('')
      expect(request.systemMessageCount).toBe(0)
    })

    it('should handle malformed content blocks gracefully', () => {
      const request = new ProxyRequest(
        createBasicRequest({
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Valid' },
                { type: 'text' }, // Missing text property
                { type: 'unknown', data: 'something' }, // Unknown type
              ] as ClaudeTextContent[],
            },
          ],
        }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.getUserContent()).toBe('Valid\n')
    })

    it('should handle very long content', () => {
      const longText = 'a'.repeat(10000)
      const request = new ProxyRequest(
        createBasicRequest({
          messages: [{ role: 'user', content: longText }],
        }),
        TEST_HOST,
        TEST_REQUEST_ID
      )

      expect(request.getUserContent()).toBe(longText)
      expect(request.getUserContent().length).toBe(10000)
    })
  })
})
