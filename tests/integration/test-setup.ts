import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

// Mock Claude API responses
export const mockHandlers = [
  // Mock successful API key authentication
  http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    const xApiKey = request.headers.get('x-api-key')
    
    // Check for valid authentication
    if (!authHeader && !xApiKey) {
      return HttpResponse.json(
        {
          error: {
            type: 'authentication_error',
            message: 'Invalid API key',
          },
        },
        { status: 401 }
      )
    }

    // Mock successful response for valid auth
    if (authHeader === 'Bearer test-api-key' || xApiKey === 'test-api-key') {
      return HttpResponse.json({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Test response' }],
        model: 'claude-3-opus-20240229',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      })
    }

    // Invalid API key
    return HttpResponse.json(
      {
        error: {
          type: 'authentication_error',
          message: 'Invalid API key',
        },
      },
      { status: 401 }
    )
  }),
]

export const server = setupServer(...mockHandlers)

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))

// Reset handlers after each test
afterEach(() => server.resetHandlers())

// Clean up after all tests
afterAll(() => server.close())