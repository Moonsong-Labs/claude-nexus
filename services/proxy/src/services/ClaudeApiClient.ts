import { ProxyRequest } from '../domain/entities/ProxyRequest'
import { ProxyResponse } from '../domain/entities/ProxyResponse'
import { AuthResult } from './AuthenticationService'
import { UpstreamError, TimeoutError } from '../types/errors'
import { ClaudeMessagesResponse, ClaudeStreamEvent, isClaudeError } from '../types/claude'
import { logger } from '../middleware/logger'
import { claudeApiCircuitBreaker } from '../utils/circuit-breaker'
import { retryWithBackoff, retryConfigs } from '../utils/retry'
import { getErrorMessage } from '@claude-nexus/shared'

export interface ClaudeApiConfig {
  baseUrl: string
  timeout: number
}

/**
 * Client for communicating with Claude API
 * Handles both streaming and non-streaming requests
 */
export class ClaudeApiClient {
  constructor(
    private config: ClaudeApiConfig = {
      baseUrl: 'https://api.anthropic.com',
      timeout: 600000, // 10 minutes
    }
  ) {}

  /**
   * Forward a request to Claude API
   */
  async forward(request: ProxyRequest, auth: AuthResult): Promise<Response> {
    const url = `${this.config.baseUrl}/v1/messages`
    const headers = request.createHeaders(auth.headers)

    // Use circuit breaker for protection
    return claudeApiCircuitBreaker.execute(async () => {
      // Use retry logic for transient failures
      return retryWithBackoff(
        async () => this.makeRequest(url, request, headers),
        retryConfigs.standard,
        { requestId: request.requestId, operation: 'claude_api_call' }
      )
    })
  }

  /**
   * Forward a request to a specific Claude API endpoint
   */
  async forwardToEndpoint(
    endpoint: string,
    method: string,
    body: any,
    auth: AuthResult
  ): Promise<Response> {
    const url = `${this.config.baseUrl}${endpoint}`
    
    // Create headers from auth result
    const headers: Record<string, string> = {
      ...auth.headers,
      'Content-Type': 'application/json',
    }

    // Use circuit breaker for protection
    return claudeApiCircuitBreaker.execute(async () => {
      // Use retry logic for transient failures
      return retryWithBackoff(
        async () => this.makeGenericRequest(url, method, body, headers),
        retryConfigs.standard,
        { operation: 'claude_api_generic_call' }
      )
    })
  }

  /**
   * Make the actual HTTP request
   */
  private async makeRequest(
    url: string,
    request: ProxyRequest,
    headers: Record<string, string>
  ): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request.raw),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      // Check for errors
      if (!response.ok) {
        const errorBody = await response.text()
        let errorMessage = `Claude API error: ${response.status}`
        let parsedError: any

        try {
          parsedError = JSON.parse(errorBody)
          if (isClaudeError(parsedError)) {
            errorMessage = `${parsedError.error.type}: ${parsedError.error.message}`
          }
        } catch {
          // Use text error if not JSON
          errorMessage = errorBody || errorMessage
          parsedError = { error: { message: errorBody, type: 'api_error' } }
        }

        throw new UpstreamError(
          errorMessage,
          response.status,
          {
            requestId: request.requestId,
            status: response.status,
            body: errorBody,
          },
          parsedError
        )
      }

      return response
    } catch (error) {
      clearTimeout(timeout)

      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError('Claude API request timeout', {
          requestId: request.requestId,
          timeout: this.config.timeout,
        })
      }

      throw error
    }
  }

  /**
   * Make a generic HTTP request (for non-messages endpoints)
   */
  private async makeGenericRequest(
    url: string,
    method: string,
    body: any,
    headers: Record<string, string>
  ): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const options: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      }

      // Only add body for methods that support it
      if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
        options.body = JSON.stringify(body)
      }

      const response = await fetch(url, options)

      clearTimeout(timeout)

      // Check for errors
      if (!response.ok) {
        const errorBody = await response.text()
        let errorMessage = `Claude API error: ${response.status}`
        let parsedError: any

        try {
          parsedError = JSON.parse(errorBody)
          if (isClaudeError(parsedError)) {
            errorMessage = `${parsedError.error.type}: ${parsedError.error.message}`
          }
        } catch {
          // Use text error if not JSON
          errorMessage = errorBody || errorMessage
          parsedError = { error: { message: errorBody, type: 'api_error' } }
        }

        throw new UpstreamError(
          errorMessage,
          response.status,
          {
            status: response.status,
            body: errorBody,
            endpoint: url,
          },
          parsedError
        )
      }

      return response
    } catch (error) {
      clearTimeout(timeout)

      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError('Claude API request timeout', {
          endpoint: url,
          timeout: this.config.timeout,
        })
      }

      throw error
    }
  }

  /**
   * Process a non-streaming response
   */
  async processResponse(
    response: Response,
    proxyResponse: ProxyResponse
  ): Promise<ClaudeMessagesResponse> {
    const json = (await response.json()) as ClaudeMessagesResponse

    logger.debug('Claude API raw response', {
      requestId: proxyResponse.requestId,
      metadata: {
        usage: json.usage,
        hasContent: !!json.content,
        contentLength: json.content?.length,
        model: json.model,
        stopReason: json.stop_reason,
      },
    })

    proxyResponse.processResponse(json)
    return json
  }

  /**
   * Process a streaming response
   */
  async *processStreamingResponse(
    response: Response,
    proxyResponse: ProxyResponse
  ): AsyncGenerator<string, void, unknown> {
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body reader available')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.trim() === '') {
            continue
          }

          if (line.startsWith('data: ')) {
            const data = line.slice(6)

            if (data === '[DONE]') {
              yield 'data: [DONE]\n\n'
              continue
            }

            try {
              const event = JSON.parse(data) as ClaudeStreamEvent
              proxyResponse.processStreamEvent(event)
              yield `data: ${data}\n\n`
            } catch (error) {
              logger.warn('Failed to parse streaming event', {
                requestId: proxyResponse.requestId,
                error: getErrorMessage(error),
                data,
              })
              // Still forward the data even if we can't parse it
              yield `data: ${data}\n\n`
            }
          } else {
            // Forward non-data lines as-is (like event: types)
            yield line + '\n'
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        yield buffer + '\n'
      }
    } finally {
      reader.releaseLock()
    }
  }
}
