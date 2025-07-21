import { describe, it, expect } from 'bun:test'
import { ProxyResponse } from '../ProxyResponse'
import { ClaudeMessagesResponse } from '@claude-nexus/shared'

// Test constants
const TEST_REQUEST_ID = 'test-request-123'
const TEST_MESSAGE_ID = 'msg_test123'
const OPUS_MODEL = 'claude-3-opus-20240229'

// Helper functions
function createBasicResponse(
  overrides: Partial<ClaudeMessagesResponse> = {}
): ClaudeMessagesResponse {
  return {
    id: TEST_MESSAGE_ID,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Hello world' }],
    model: OPUS_MODEL,
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
    },
    ...overrides,
  }
}

describe('ProxyResponse', () => {
  describe('constructor and basic properties', () => {
    it('should initialize with default values', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, false)

      expect(response.requestId).toBe(TEST_REQUEST_ID)
      expect(response.streaming).toBe(false)
      expect(response.inputTokens).toBe(0)
      expect(response.outputTokens).toBe(0)
      expect(response.totalTokens).toBe(0)
      expect(response.content).toBe('')
      expect(response.toolCallCount).toBe(0)
      expect(response.toolCalls).toEqual([])
    })

    it('should initialize as streaming response', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, true)

      expect(response.streaming).toBe(true)
    })
  })

  describe('non-streaming response processing', () => {
    it('should process simple text response', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, false)
      const claudeResponse = createBasicResponse()

      response.processResponse(claudeResponse)

      expect(response.content).toBe('Hello world')
      expect(response.inputTokens).toBe(10)
      expect(response.outputTokens).toBe(5)
      expect(response.totalTokens).toBe(15)
    })

    it('should handle multiple text content blocks', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, false)
      const claudeResponse = createBasicResponse({
        content: [
          { type: 'text', text: 'First part' },
          { type: 'text', text: 'Second part' },
          { type: 'text', text: 'Third part' },
        ],
      })

      response.processResponse(claudeResponse)

      expect(response.content).toBe('First part\nSecond part\nThird part')
    })

    it('should process response with tool use', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, false)
      const claudeResponse = createBasicResponse({
        content: [
          { type: 'text', text: 'Let me help you with that.' },
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'get_weather',
            input: { location: 'San Francisco' },
          },
          {
            type: 'tool_use',
            id: 'tool_456',
            name: 'get_time',
            input: { timezone: 'PST' },
          },
        ],
      })

      response.processResponse(claudeResponse)

      expect(response.content).toBe('Let me help you with that.')
      expect(response.toolCallCount).toBe(2)
      expect(response.toolCalls).toHaveLength(2)
      expect(response.toolCalls[0]).toEqual({
        name: 'get_weather',
        id: 'tool_123',
        input: { location: 'San Francisco' },
      })
      expect(response.toolCalls[1]).toEqual({
        name: 'get_time',
        id: 'tool_456',
        input: { timezone: 'PST' },
      })
    })

    it('should handle cache tokens in usage data', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, false)
      const claudeResponse = createBasicResponse({
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 20,
          cache_read_input_tokens: 30,
        },
      })

      response.processResponse(claudeResponse)

      expect(response.inputTokens).toBe(100)
      expect(response.outputTokens).toBe(50)
      expect(response.cacheCreationInputTokens).toBe(20)
      expect(response.cacheReadInputTokens).toBe(30)
      expect(response.fullUsageData).toEqual(claudeResponse.usage)
    })

    it('should handle empty content array', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, false)
      const claudeResponse = createBasicResponse({
        content: [],
        usage: { input_tokens: 10, output_tokens: 0 },
      })

      response.processResponse(claudeResponse)

      expect(response.content).toBe('')
      expect(response.outputTokens).toBe(0)
    })

    it('should handle missing usage data', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, false)
      const claudeResponse = createBasicResponse()
      delete (claudeResponse as { usage?: unknown }).usage

      response.processResponse(claudeResponse)

      expect(response.inputTokens).toBe(0)
      expect(response.outputTokens).toBe(0)
    })
  })

  describe('streaming response processing', () => {
    it('should process message_start event', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, true)

      response.processStreamEvent({
        type: 'message_start',
        message: {
          id: TEST_MESSAGE_ID,
          type: 'message',
          role: 'assistant',
          content: [],
          model: OPUS_MODEL,
          usage: { input_tokens: 15, output_tokens: 0 },
        },
      })

      expect(response.inputTokens).toBe(15)
      expect(response.outputTokens).toBe(0)
    })

    it('should accumulate text content from stream', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, true)

      // Content block start
      response.processStreamEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      })

      // Text deltas
      response.processStreamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello ' },
      })

      response.processStreamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'streaming ' },
      })

      response.processStreamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'world!' },
      })

      expect(response.content).toBe('Hello streaming world!')
    })

    it('should handle tool use in streaming', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, true)

      // Tool use block start
      response.processStreamEvent({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'tool_use',
          id: 'tool_789',
          name: 'calculate',
          input: {},
        },
      })

      // Tool input delta
      response.processStreamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"expression": "2 + 2"}',
        },
      })

      // Block stop to trigger parsing
      response.processStreamEvent({
        type: 'content_block_stop',
        index: 0,
      })

      expect(response.toolCallCount).toBe(1)
      expect(response.toolCalls[0]).toEqual({
        name: 'calculate',
        id: 'tool_789',
        input: { expression: '2 + 2' },
      })
    })

    it('should handle malformed tool JSON gracefully', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, true)

      response.processStreamEvent({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'tool_use',
          id: 'tool_bad',
          name: 'bad_tool',
          input: {},
        },
      })

      response.processStreamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"invalid": json}', // Invalid JSON
        },
      })

      response.processStreamEvent({
        type: 'content_block_stop',
        index: 0,
      })

      expect(response.toolCallCount).toBe(1)
      expect(response.toolCalls[0].input).toEqual({}) // Should keep original empty input
    })

    it('should update tokens from message_delta', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, true)

      response.processStreamEvent({
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: {
          output_tokens: 25,
          cache_creation_input_tokens: 10,
          cache_read_input_tokens: 5,
        },
      })

      expect(response.outputTokens).toBe(25)
      expect(response.cacheCreationInputTokens).toBe(10)
      expect(response.cacheReadInputTokens).toBe(5)
    })

    it('should handle message_stop event', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, true)

      // Should not throw
      response.processStreamEvent({ type: 'message_stop' })

      expect(response.content).toBe('')
    })
  })

  describe('metrics and reporting', () => {
    it('should provide comprehensive metrics', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, false)
      const claudeResponse = createBasicResponse({
        content: [
          { type: 'text', text: 'Response text' },
          { type: 'tool_use', id: 'tool_1', name: 'tool1', input: {} },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 10,
          cache_read_input_tokens: 20,
        },
      })

      response.processResponse(claudeResponse)

      const metrics = response.getMetrics()

      expect(metrics).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cacheCreationInputTokens: 10,
        cacheReadInputTokens: 20,
        toolCallCount: 1,
        hasContent: true,
        fullUsageData: claudeResponse.usage,
      })
    })

    it('should indicate no content in metrics', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, false)
      response.processResponse(createBasicResponse({ content: [] }))

      const metrics = response.getMetrics()
      expect(metrics.hasContent).toBe(false)
    })
  })

  describe('content truncation', () => {
    it('should truncate content by line count', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, false)
      const lines = Array(30).fill('Line content').join('\n')
      response.processResponse(
        createBasicResponse({
          content: [{ type: 'text', text: lines }],
        })
      )

      const truncated = response.getTruncatedContent(10)
      const truncatedLines = truncated.split('\n')

      expect(truncatedLines).toHaveLength(11) // 10 lines + truncation message
      expect(truncatedLines[10]).toBe('... (truncated)')
    })

    it('should truncate content by character length', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, false)
      const longText = 'a'.repeat(5000)
      response.processResponse(
        createBasicResponse({
          content: [{ type: 'text', text: longText }],
        })
      )

      const truncated = response.getTruncatedContent(100, 1000)

      expect(truncated).toHaveLength(1000 + '... (truncated)'.length)
      expect(truncated).toEndWith('... (truncated)')
    })

    it('should not truncate short content', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, false)
      const shortText = 'Short response'
      response.processResponse(
        createBasicResponse({
          content: [{ type: 'text', text: shortText }],
        })
      )

      const truncated = response.getTruncatedContent()

      expect(truncated).toBe(shortText)
    })

    it('should handle empty content in truncation', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, false)
      response.processResponse(createBasicResponse({ content: [] }))

      const truncated = response.getTruncatedContent()

      expect(truncated).toBe('')
    })

    it('should use default truncation limits', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, false)
      const lines = Array(50).fill('Line').join('\n')
      response.processResponse(
        createBasicResponse({
          content: [{ type: 'text', text: lines }],
        })
      )

      const truncated = response.getTruncatedContent()
      const truncatedLines = truncated.split('\n')

      // Default is 20 lines
      expect(truncatedLines).toHaveLength(21) // 20 lines + truncation message
    })
  })

  describe('edge cases', () => {
    it('should handle null text in content blocks', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, false)
      const claudeResponse = createBasicResponse({
        content: [
          { type: 'text', text: null as unknown as string },
          { type: 'text', text: 'Valid text' },
          { type: 'text', text: undefined as unknown as string },
        ],
      })

      response.processResponse(claudeResponse)

      expect(response.content).toBe('\nValid text\n')
    })

    it('should handle tool with missing name', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, false)
      const claudeResponse = createBasicResponse({
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            input: { data: 'test' },
          } as { type: 'tool_use'; id: string; input: Record<string, unknown> },
        ],
      })

      response.processResponse(claudeResponse)

      expect(response.toolCallCount).toBe(1)
      expect(response.toolCalls[0].name).toBe('unknown')
    })

    it('should handle multiple streaming events for same content', () => {
      const response = new ProxyResponse(TEST_REQUEST_ID, true)

      // Multiple text deltas for same block
      response.processStreamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Part 1 ' },
      })

      response.processStreamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Part 2 ' },
      })

      response.processStreamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Part 3' },
      })

      expect(response.content).toBe('Part 1 Part 2 Part 3')
    })
  })
})
