import { serve, type Server } from 'bun'

export function createMockClaudeServer(port: number): Server {
  return serve({
    port,
    fetch(req) {
      const url = new URL(req.url)

      if (url.pathname === '/mock-claude/v1/messages' && req.method === 'POST') {
        // Return a simple mock response
        return new Response(
          JSON.stringify({
            id: 'msg_mock_' + Date.now(),
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'This is a mock response for E2E testing.',
              },
            ],
            model: 'claude-3-sonnet-20240229',
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: {
              input_tokens: 10,
              output_tokens: 8,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      return new Response('Not Found', { status: 404 })
    },
  })
}
