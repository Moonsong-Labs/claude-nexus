import { beforeAll, afterEach, afterAll, vi } from 'vitest'
import { setupServer } from 'msw/node'
import { rest } from 'msw'

// Global test setup
export const mockServer = setupServer()

// Start mock server before all tests
beforeAll(() => {
  mockServer.listen({ onUnhandledRequest: 'error' })
})

// Reset handlers and mocks after each test
afterEach(() => {
  mockServer.resetHandlers()
  vi.clearAllMocks()
  vi.clearAllTimers()

  // Clear environment variables set during tests
  delete process.env.TEST_MODE
})

// Clean up after all tests
afterAll(() => {
  mockServer.close()
})

// Global test utilities
global.testUtils = {
  // Add common test utilities here
  waitForMs: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  // Mock streaming response helper
  createStreamResponse: (chunks: any[]) => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
          await new Promise(resolve => setTimeout(resolve, 10))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    })
  },
}

// Common MSW handlers that can be used across tests
export const defaultHandlers = [
  // Mock Claude API messages endpoint
  rest.post('https://api.anthropic.com/v1/messages', (req, res, ctx) => {
    const apiKey = req.headers.get('x-api-key')
    const authHeader = req.headers.get('authorization')

    // Check authentication
    if (!apiKey && !authHeader) {
      return res(ctx.status(401), ctx.json({ error: 'Unauthorized' }))
    }

    // Return mock response
    return res(
      ctx.status(200),
      ctx.json({
        id: 'msg_test_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Hello! This is a test response.',
          },
        ],
        model: 'claude-3-opus-20240229',
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
      })
    )
  }),

  // Mock OAuth token refresh
  rest.post('https://console.anthropic.com/v1/oauth/token', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        access_token: 'new_access_token_' + Date.now(),
        refresh_token: 'new_refresh_token_' + Date.now(),
        expires_in: 3600,
        token_type: 'Bearer',
      })
    )
  }),

  // Mock telemetry endpoint
  rest.post('https://telemetry.example.com/*', (req, res, ctx) => {
    return res(ctx.status(200), ctx.json({ status: 'ok' }))
  }),

  // Mock Slack webhook
  rest.post('https://hooks.slack.com/*', (req, res, ctx) => {
    return res(ctx.status(200), ctx.text('ok'))
  }),
]

// Set default handlers
mockServer.use(...defaultHandlers)

// Extend global namespace for TypeScript
declare global {
  var testUtils: {
    waitForMs: (ms: number) => Promise<void>
    createStreamResponse: (chunks: any[]) => Response
  }
}
