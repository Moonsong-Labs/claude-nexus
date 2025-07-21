/**
 * Unit tests for ProxyRequest and ProxyResponse message formatting and content extraction logic.
 *
 * Tests the extraction of user content from various message formats including:
 * - Simple string messages
 * - Content blocks with multiple text items
 * - Mixed content with images and text
 * - Conversation history extraction
 * - Streaming response accumulation
 * - Tool use filtering
 * - System reminder filtering for notifications
 */

import { describe, it, expect } from 'bun:test'
import { ProxyRequest } from '../src/domain/entities/ProxyRequest'
import { ProxyResponse } from '../src/domain/entities/ProxyResponse'

describe('Message Content Extraction and Formatting', () => {
  describe('ProxyRequest content extraction', () => {
    it('should extract user content from string message', () => {
      const request = new ProxyRequest(
        {
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: 'Simple text message' }],
          max_tokens: 10,
        },
        'test.com',
        'req-123'
      )

      expect(request.getUserContent()).toBe('Simple text message')
    })

    it('should extract user content from content blocks', () => {
      const request = new ProxyRequest(
        {
          model: 'claude-3-opus-20240229',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'First part. ' },
                { type: 'text', text: 'Second part.' },
              ],
            },
          ],
          max_tokens: 100,
        },
        'test.com',
        'req-456'
      )

      expect(request.getUserContent()).toBe('First part. \nSecond part.')
    })

    it('should handle mixed content types', () => {
      const request = new ProxyRequest(
        {
          model: 'claude-3-opus-20240229',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Look at this image: ' },
                {
                  type: 'image',
                  source: { type: 'base64', media_type: 'image/png', data: 'base64data' },
                },
                { type: 'text', text: ' What do you see?' },
              ],
            },
          ],
          max_tokens: 100,
        },
        'test.com',
        'req-789'
      )

      expect(request.getUserContent()).toBe('Look at this image: \n What do you see?')
    })

    it('should get content from last user message in conversation', () => {
      const request = new ProxyRequest(
        {
          model: 'claude-3-opus-20240229',
          messages: [
            { role: 'user', content: 'First question' },
            { role: 'assistant', content: 'First answer' },
            { role: 'user', content: 'Follow-up question' },
            { role: 'assistant', content: 'Follow-up answer' },
            { role: 'user', content: 'Final question' },
          ],
          max_tokens: 100,
        },
        'test.com',
        'req-conv'
      )

      expect(request.getUserContent()).toBe('Final question')
    })

    it('should handle empty content', () => {
      const request = new ProxyRequest(
        {
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'assistant', content: 'No user message' }],
          max_tokens: 10,
        },
        'test.com',
        'req-empty'
      )

      expect(request.getUserContent()).toBe('')
    })
  })

  describe('ProxyResponse content extraction', () => {
    it('should extract text from simple response', () => {
      const response = new ProxyResponse('resp-123', false)
      response.processResponse({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'This is the response' }],
        model: 'claude-3-opus-20240229',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      })

      expect(response.content).toBe('This is the response')
    })

    it('should combine multiple text blocks', () => {
      const response = new ProxyResponse('resp-456', false)
      response.processResponse({
        id: 'msg_456',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Part one. ' },
          { type: 'text', text: 'Part two. ' },
          { type: 'text', text: 'Part three.' },
        ],
        model: 'claude-3-opus-20240229',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 15, output_tokens: 10 },
      })

      expect(response.content).toBe('Part one. \nPart two. \nPart three.')
    })

    it('should filter out tool use blocks', () => {
      const response = new ProxyResponse('resp-789', false)
      response.processResponse({
        id: 'msg_789',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me check that for you.' },
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'get_weather',
            input: { location: 'NYC' },
          },
          { type: 'text', text: 'The weather is sunny.' },
        ],
        model: 'claude-3-opus-20240229',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 20, output_tokens: 15 },
      })

      expect(response.content).toBe('Let me check that for you.\nThe weather is sunny.')
      expect(response.toolCallCount).toBe(1)
      expect(response.toolCalls).toHaveLength(1)
      expect(response.toolCalls[0]).toEqual({
        name: 'get_weather',
        id: 'tool_123',
        input: { location: 'NYC' },
      })
    })

    it('should handle streaming content accumulation', () => {
      const response = new ProxyResponse('resp-stream', true)

      // Start message
      response.processStreamEvent({
        type: 'message_start',
        message: {
          id: 'msg_stream',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-3-haiku-20240307',
          usage: { input_tokens: 8, output_tokens: 0 },
        },
      })

      // Content chunks
      response.processStreamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Streaming ' },
      })

      response.processStreamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'response ' },
      })

      response.processStreamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'text.' },
      })

      // Final token count
      response.processStreamEvent({
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 4 },
      })

      expect(response.content).toBe('Streaming response text.')
      expect(response.inputTokens).toBe(8)
      expect(response.outputTokens).toBe(4)
    })
  })

  describe('Content length handling', () => {
    it('should handle very long content', () => {
      const longText = 'A'.repeat(5000)
      const request = new ProxyRequest(
        {
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: longText }],
          max_tokens: 10,
        },
        'test.com',
        'req-long'
      )

      const content = request.getUserContent()
      expect(content).toBe(longText)
      expect(content.length).toBe(5000)
    })

    it('should handle content with special characters', () => {
      const request = new ProxyRequest(
        {
          model: 'claude-3-haiku-20240307',
          messages: [
            {
              role: 'user',
              content: 'Special chars: 🚀 "quotes" \'apostrophes\' \n\nnewlines\ttabs',
            },
          ],
          max_tokens: 10,
        },
        'test.com',
        'req-special'
      )

      expect(request.getUserContent()).toBe(
        'Special chars: 🚀 "quotes" \'apostrophes\' \n\nnewlines\ttabs'
      )
    })

    it('should handle content with code blocks', () => {
      const codeContent = `Here's my code:
\`\`\`python
def hello():
    print("Hello, world!")
\`\`\`
What do you think?`

      const request = new ProxyRequest(
        {
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: codeContent }],
          max_tokens: 100,
        },
        'test.com',
        'req-code'
      )

      expect(request.getUserContent()).toBe(codeContent)
    })
  })

  describe('ProxyRequest getUserContentForNotification', () => {
    it('should return full content for non-inference requests', () => {
      const request = new ProxyRequest(
        {
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: 'Simple query' }],
          max_tokens: 10,
        },
        'test.com',
        'req-simple'
      )

      expect(request.getUserContentForNotification()).toBe('Simple query')
      expect(request.getUserContentForNotification()).toBe(request.getUserContent())
    })

    it('should filter system reminders from inference requests with multiple text blocks', () => {
      // Create an inference request (2+ system messages)
      const request = new ProxyRequest(
        {
          model: 'claude-3-opus-20240229',
          messages: [
            { role: 'system', content: 'System prompt 1' },
            { role: 'system', content: 'System prompt 2' },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: '<system-reminder>This is a system reminder</system-reminder>',
                },
                { type: 'text', text: 'This is the actual user content' },
                { type: 'text', text: 'More user content here' },
                {
                  type: 'text',
                  text: '<system-reminder>Another system reminder</system-reminder>',
                },
              ],
            },
          ],
          max_tokens: 100,
        },
        'test.com',
        'req-inference'
      )

      // Should filter out first and last text blocks for inference requests
      const notificationContent = request.getUserContentForNotification()
      expect(notificationContent).toBe('This is the actual user content\nMore user content here')
      expect(notificationContent).not.toContain('system-reminder')
    })

    it('should not filter when inference request has 2 or fewer text blocks', () => {
      const request = new ProxyRequest(
        {
          model: 'claude-3-opus-20240229',
          messages: [
            { role: 'system', content: 'System prompt 1' },
            { role: 'system', content: 'System prompt 2' },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'First text block' },
                { type: 'text', text: 'Second text block' },
              ],
            },
          ],
          max_tokens: 100,
        },
        'test.com',
        'req-two-blocks'
      )

      // Should return all content when there are only 2 text blocks
      expect(request.getUserContentForNotification()).toBe('First text block\nSecond text block')
    })

    it('should handle mixed content types in inference requests', () => {
      const request = new ProxyRequest(
        {
          model: 'claude-3-opus-20240229',
          messages: [
            { role: 'system', content: 'System prompt 1' },
            { role: 'system', content: 'System prompt 2' },
            {
              role: 'user',
              content: [
                { type: 'text', text: '<system-reminder>System info</system-reminder>' },
                { type: 'text', text: 'User question about image:' },
                {
                  type: 'image',
                  source: { type: 'base64', media_type: 'image/png', data: 'base64data' },
                },
                { type: 'text', text: 'What do you see?' },
                { type: 'text', text: '<system-reminder>End reminder</system-reminder>' },
              ],
            },
          ],
          max_tokens: 100,
        },
        'test.com',
        'req-mixed'
      )

      // Should filter first and last text blocks, ignore image blocks
      const notificationContent = request.getUserContentForNotification()
      expect(notificationContent).toBe('User question about image:\nWhat do you see?')
    })

    it('should return empty string when all content is filtered', () => {
      const request = new ProxyRequest(
        {
          model: 'claude-3-opus-20240229',
          messages: [
            { role: 'system', content: 'System prompt 1' },
            { role: 'system', content: 'System prompt 2' },
            {
              role: 'user',
              content: [
                { type: 'text', text: '<system-reminder>Only system reminder 1</system-reminder>' },
                { type: 'text', text: '<system-reminder>Only system reminder 2</system-reminder>' },
                { type: 'text', text: '<system-reminder>Only system reminder 3</system-reminder>' },
              ],
            },
          ],
          max_tokens: 100,
        },
        'test.com',
        'req-all-filtered'
      )

      // When filtering removes first and last, only middle one remains
      expect(request.getUserContentForNotification()).toBe(
        '<system-reminder>Only system reminder 2</system-reminder>'
      )
    })
  })
})
