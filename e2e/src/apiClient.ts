import type { ClaudeMessage } from '../../packages/shared/src/types'

export interface ProxyRequestOptions {
  domain: string
  clientApiKey: string
  claudeApiKey?: string
  body: {
    model: string
    messages: ClaudeMessage[]
    stream?: boolean
    system?: string | any[]
    max_tokens?: number
  }
}

export interface ProxyResponse {
  statusCode: number
  headers: Record<string, string>
  body: any
  requestId?: string
  conversationId?: string
  branchId?: string
  parentRequestId?: string
}

export class ApiClient {
  constructor(private proxyUrl: string) {}

  async sendRequest(options: ProxyRequestOptions): Promise<ProxyResponse> {
    const url = `${this.proxyUrl}/v1/messages`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Host: options.domain,
      Authorization: `Bearer ${options.clientApiKey}`,
    }

    if (options.claudeApiKey) {
      headers['x-api-key'] = options.claudeApiKey
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(options.body),
    })

    let body: any
    const contentType = response.headers.get('content-type')

    if (options.body.stream) {
      // Handle streaming response
      body = await this.consumeStream(response)
    } else if (contentType?.includes('application/json')) {
      body = await response.json()
    } else {
      body = await response.text()
    }

    // Extract tracking headers
    const requestId = response.headers.get('x-request-id') || undefined
    const conversationId = response.headers.get('x-conversation-id') || undefined
    const branchId = response.headers.get('x-branch-id') || undefined
    const parentRequestId = response.headers.get('x-parent-request-id') || undefined

    return {
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
      requestId,
      conversationId,
      branchId,
      parentRequestId,
    }
  }

  private async consumeStream(response: Response): Promise<any> {
    if (!response.body) {
      throw new Error('No response body for streaming request')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const chunks: string[] = []
    let finalResponse: any = {}

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        chunks.push(chunk)

        // Parse SSE events
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const event = JSON.parse(data)
              // Capture the final message for validation
              if (event.type === 'message_delta' && event.delta?.stop_reason) {
                finalResponse = event
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    return {
      chunks,
      chunkCount: chunks.length,
      finalResponse,
    }
  }
}
