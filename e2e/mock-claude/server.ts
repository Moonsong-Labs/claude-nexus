import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { nanoid } from 'nanoid'

const app = new Hono()

// Mock responses for different scenarios
const mockResponses = {
  default: {
    id: 'msg_mock_' + nanoid(),
    type: 'message',
    role: 'assistant',
    content: [{
      type: 'text',
      text: 'The capital of France is Paris.'
    }],
    model: 'claude-3-opus-20240229',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 15
    }
  },
  
  streaming: {
    chunks: [
      { type: 'message_start', message: { id: 'msg_mock_stream', type: 'message', role: 'assistant', content: [], model: 'claude-3-opus-20240229', stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Lines of ' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'logic, pure ' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'and bright' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 15 } },
      { type: 'message_stop' }
    ]
  }
}

// Health check
app.get('/health', (c) => c.json({ status: 'ok', service: 'mock-claude' }))

// Main chat completions endpoint
app.post('/v1/messages', async (c) => {
  const body = await c.req.json()
  const requestId = 'req_' + nanoid()
  
  // Set response headers
  c.header('x-request-id', requestId)
  c.header('anthropic-ratelimit-requests-limit', '1000')
  c.header('anthropic-ratelimit-requests-remaining', '999')
  c.header('anthropic-ratelimit-requests-reset', new Date(Date.now() + 3600000).toISOString())
  c.header('anthropic-ratelimit-tokens-limit', '100000')
  c.header('anthropic-ratelimit-tokens-remaining', '99985')
  c.header('anthropic-ratelimit-tokens-reset', new Date(Date.now() + 3600000).toISOString())
  
  // Check for error simulation
  const lastMessage = body.messages?.[body.messages.length - 1]?.content
  if (typeof lastMessage === 'string') {
    if (lastMessage.includes('ERROR_400')) {
      return c.json({ 
        type: 'error', 
        error: { type: 'invalid_request_error', message: 'Invalid request' } 
      }, 400)
    }
    if (lastMessage.includes('ERROR_429')) {
      return c.json({ 
        type: 'error', 
        error: { type: 'rate_limit_error', message: 'Rate limit exceeded' } 
      }, 429)
    }
    if (lastMessage.includes('ERROR_500')) {
      return c.json({ 
        type: 'error', 
        error: { type: 'api_error', message: 'Internal server error' } 
      }, 500)
    }
  }
  
  // Handle streaming
  if (body.stream) {
    return stream(c, async (stream) => {
      c.header('content-type', 'text/event-stream')
      c.header('cache-control', 'no-cache')
      
      for (const chunk of mockResponses.streaming.chunks) {
        await stream.write(`event: ${chunk.type}\ndata: ${JSON.stringify(chunk)}\n\n`)
        await stream.sleep(10) // Small delay between chunks
      }
    })
  }
  
  // Non-streaming response
  const response = { ...mockResponses.default }
  
  // Customize response based on input
  if (lastMessage?.includes('Tell me about Python')) {
    response.content[0].text = 'Python is a high-level programming language known for its simplicity and readability.'
  } else if (lastMessage?.includes('What about its syntax?')) {
    response.content[0].text = 'Python uses indentation to define code blocks and has a clean, readable syntax.'
  } else if (lastMessage?.includes('What about its performance?')) {
    response.content[0].text = 'Python is an interpreted language, which can be slower than compiled languages for CPU-intensive tasks.'
  }
  
  response.id = 'msg_' + nanoid()
  response.usage.input_tokens = JSON.stringify(body).length / 4 // Rough estimate
  
  return c.json(response)
})

// Start server
console.log('Mock Claude API server starting on port 8080...')
export default {
  port: 8080,
  hostname: '0.0.0.0',  // Listen on all interfaces
  fetch: app.fetch,
}