import { ProxyRequest } from '../domain/entities/ProxyRequest'
import { ProxyResponse } from '../domain/entities/ProxyResponse'
import { AuthResult } from './AuthenticationService'
import { UpstreamError, TimeoutError, getErrorMessage, isClaudeError } from '@claude-nexus/shared'
import { ClaudeMessagesResponse, ClaudeStreamEvent, ClaudeErrorResponse } from '../types/claude'
import { logger } from '../middleware/logger'
import { claudeApiCircuitBreaker } from '../utils/circuit-breaker'
import { retryWithBackoff, retryConfigs, isRetryableError } from '../utils/retry'
// Constants for SSE protocol
const SSE_DATA_PREFIX = 'data: '
const SSE_DONE_SIGNAL = '[DONE]'

export interface ClaudeApiConfig {
  baseUrl: string
  timeout: number
}

/**
 * Claude API specific retry condition
 */
function isClaudeRetryableError(error: unknown): boolean {
  if (isRetryableError(error)) {
    return true
  }

  // Claude-specific error messages
  if (
    error instanceof Error &&
    (error.message.includes('overloaded_error') || error.message.includes('rate_limit_error'))
  ) {
    return true
  }

  return false
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
   * @param request - The proxy request to forward
   * @param auth - Authentication result containing headers
   * @returns Response from Claude API
   * @throws UpstreamError - If Claude API returns an error
   * @throws TimeoutError - If request times out
   */
  async forward(request: ProxyRequest, auth: AuthResult): Promise<Response> {
    const url = `${this.config.baseUrl}/v1/messages`
    const headers = request.createHeaders(auth.headers)

    // Use circuit breaker for protection
    return claudeApiCircuitBreaker.execute(async () => {
      // Use retry logic for transient failures
      return retryWithBackoff(
        async () => this.makeRequest(url, request, headers),
        { ...retryConfigs.standard, retryCondition: isClaudeRetryableError },
        { requestId: request.requestId, operation: 'claude_api_call' }
      )
    })
  }

  /**
   * Make the actual HTTP request
   * @param url - The Claude API endpoint URL
   * @param request - The proxy request containing the body
   * @param headers - HTTP headers to send
   * @returns Raw response from Claude API
   * @throws UpstreamError - For API errors
   * @throws TimeoutError - For timeout errors
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
        let parsedError: unknown

        try {
          parsedError = JSON.parse(errorBody)
          if (isClaudeError(parsedError)) {
            errorMessage = `${parsedError.error.type}: ${parsedError.error.message}`
          }
        } catch {
          // Use text error if not JSON
          errorMessage = errorBody || errorMessage
          parsedError = { error: { message: errorBody, type: 'api_error' } } as ClaudeErrorResponse
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
   * Process a non-streaming response
   * @param response - Raw response from Claude API
   * @param proxyResponse - Proxy response object to update with token usage
   * @returns Parsed Claude API response
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
   * @param response - Raw streaming response from Claude API
   * @param proxyResponse - Proxy response object to update with streaming events
   * @yields Server-sent event strings to forward to the client
   * @throws Error - If response body is not available
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

          if (line.startsWith(SSE_DATA_PREFIX)) {
            const data = line.slice(SSE_DATA_PREFIX.length)

            if (data === SSE_DONE_SIGNAL) {
              yield this.formatSSEData(SSE_DONE_SIGNAL)
              continue
            }

            try {
              const event = JSON.parse(data) as ClaudeStreamEvent
              proxyResponse.processStreamEvent(event)
              yield this.formatSSEData(data)
            } catch (error) {
              logger.warn('Failed to parse streaming event', {
                requestId: proxyResponse.requestId,
                error: getErrorMessage(error),
                metadata: {
                  data,
                  lineContent: line,
                  eventType: 'parse_error',
                },
              })
              // Still forward the data even if we can't parse it
              yield this.formatSSEData(data)
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

  /**
   * Format a server-sent event data line
   * @param data - The data to format
   * @returns Formatted SSE data line with newlines
   */
  private formatSSEData(data: string): string {
    return `${SSE_DATA_PREFIX}${data}\n\n`
  }
}
