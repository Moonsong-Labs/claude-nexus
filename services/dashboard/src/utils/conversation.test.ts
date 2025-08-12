import { describe, it, expect } from 'bun:test'
import { parseConversation } from './conversation'

describe('conversation parsing', () => {
  it('should parse system messages correctly', async () => {
    const requestData = {
      request_body: {
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant.',
          },
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      },
      response_body: {
        content: 'Hi there! How can I help you today?',
        role: 'assistant',
      },
      request_tokens: 20,
      response_tokens: 10,
      model: 'claude-3-opus',
      timestamp: new Date().toISOString(),
    }

    const result = await parseConversation(requestData)

    // Check that we have 3 messages (system, user, assistant)
    expect(result.messages).toHaveLength(3)

    // Check the system message
    const systemMessage = result.messages[0]
    expect(systemMessage.role).toBe('system')
    expect(systemMessage.content).toBe('You are a helpful assistant.')
    expect(systemMessage.htmlContent).toContain('You are a helpful assistant.')

    // Check the user message
    const userMessage = result.messages[1]
    expect(userMessage.role).toBe('user')
    expect(userMessage.content).toBe('Hello')

    // Check the assistant message
    const assistantMessage = result.messages[2]
    expect(assistantMessage.role).toBe('assistant')
    expect(assistantMessage.content).toBe('Hi there! How can I help you today?')
  })

  it('should handle multiple system messages', async () => {
    const requestData = {
      request_body: {
        messages: [
          {
            role: 'system',
            content: 'You are Claude.',
          },
          {
            role: 'system',
            content: 'Be concise in your responses.',
          },
          {
            role: 'user',
            content: 'What is 2+2?',
          },
        ],
      },
      response_body: {
        content: '4',
        role: 'assistant',
      },
      request_tokens: 30,
      response_tokens: 5,
      model: 'claude-3-opus',
      timestamp: new Date().toISOString(),
    }

    const result = await parseConversation(requestData)

    // Check that we have 4 messages (2 system, 1 user, 1 assistant)
    expect(result.messages).toHaveLength(4)

    // Check both system messages are preserved
    expect(result.messages[0].role).toBe('system')
    expect(result.messages[0].content).toBe('You are Claude.')

    expect(result.messages[1].role).toBe('system')
    expect(result.messages[1].content).toBe('Be concise in your responses.')
  })

  it('should handle system messages with markdown', async () => {
    const requestData = {
      request_body: {
        messages: [
          {
            role: 'system',
            content:
              '# System Instructions\n\n- Be helpful\n- Be **honest**\n- Use `code blocks` when appropriate',
          },
          {
            role: 'user',
            content: 'Test',
          },
        ],
      },
      response_body: {
        content: 'Test response',
        role: 'assistant',
      },
      request_tokens: 50,
      response_tokens: 10,
      model: 'claude-3-opus',
      timestamp: new Date().toISOString(),
    }

    const result = await parseConversation(requestData)

    const systemMessage = result.messages[0]
    expect(systemMessage.role).toBe('system')

    // Check that markdown is parsed to HTML
    expect(systemMessage.htmlContent).toContain('<h1>System Instructions</h1>')
    expect(systemMessage.htmlContent).toContain('<li>Be helpful</li>')
    expect(systemMessage.htmlContent).toContain('<strong>honest</strong>')
    expect(systemMessage.htmlContent).toContain('<code>code blocks</code>')
  })
})
