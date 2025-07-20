import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ClaudeMessagesRequest } from '@claude-nexus/shared'
import { Context } from 'hono'
import { config } from '@claude-nexus/shared/config'
import { getRequestLogger } from '../middleware/logger'

/**
 * Structure of a collected test sample containing request and response data
 */
export interface TestSample {
  timestamp: string
  method: string
  path: string
  headers: Record<string, string>
  body: any
  queryParams: Record<string, string>
  metadata: {
    requestType: string
    isStreaming: boolean
    hasTools: boolean
    modelUsed: string
    messageCount: number
  }
  response?: {
    status: number
    headers: Record<string, string>
    body: any
    metadata?: {
      inputTokens?: number
      outputTokens?: number
      toolCalls?: number
      streamingChunks?: any[]
    }
  }
}

// Regular expressions for sensitive data patterns
const SENSITIVE_PATTERNS = {
  ANTHROPIC_API_KEY: /sk-ant-[a-zA-Z0-9-]+/g,
  BEARER_TOKEN: /Bearer [a-zA-Z0-9-._~+/]+/g,
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  CREDIT_CARD: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  SSN: /\b\d{3}-\d{2}-\d{4}\b/g,
} as const

// Replacement values for masked sensitive data
const MASKED_VALUES = {
  ANTHROPIC_API_KEY: 'sk-ant-****',
  BEARER_TOKEN: 'Bearer ****',
  EMAIL: '****@****.com',
  CREDIT_CARD: '****-****-****-****',
  SSN: '***-**-****',
} as const

/**
 * Collects anonymized API request/response samples for testing purposes.
 * Samples are saved to disk when COLLECT_TEST_SAMPLES environment variable is set to true.
 * All sensitive data (API keys, tokens, emails, etc.) is automatically masked.
 */
export class TestSampleCollector {
  private readonly samplesDir: string
  private readonly enabled: boolean
  private readonly pendingSamples: Map<string, { sample: TestSample; filename: string }>

  constructor() {
    // Use a dedicated directory for test samples
    this.samplesDir = path.join(process.cwd(), config.features.testSamplesDir || 'test-samples')
    this.enabled = config.features.collectTestSamples || false
    this.pendingSamples = new Map()
  }

  /**
   * Collects a request sample and prepares it for storage
   * @param context - Hono context containing request information
   * @param validatedBody - The validated Claude API request body
   * @param requestType - Type of request (query_evaluation, inference, or quota)
   * @returns Sample ID if collection is enabled and successful, undefined otherwise
   */
  async collectSample(
    context: Context,
    validatedBody: ClaudeMessagesRequest,
    requestType: 'query_evaluation' | 'inference' | 'quota'
  ): Promise<string | undefined> {
    if (!this.enabled) {
      return undefined
    }

    const logger = getRequestLogger(context)

    try {
      // Ensure samples directory exists
      await fs.mkdir(this.samplesDir, { recursive: true })

      // Extract headers (sanitized)
      const headers = this.sanitizeHeaders(context.req.raw.headers)

      // Determine sample type
      const sampleType = this.determineSampleType(validatedBody, requestType)

      // Create test sample
      const sample: TestSample = {
        timestamp: new Date().toISOString(),
        method: context.req.method,
        path: context.req.path,
        headers,
        body: this.sanitizeBody(validatedBody),
        queryParams: this.extractQueryParams(context),
        metadata: {
          requestType,
          isStreaming: validatedBody.stream || false,
          hasTools: !!(validatedBody.tools && validatedBody.tools.length > 0),
          modelUsed: validatedBody.model,
          messageCount: validatedBody.messages.length,
        },
      }

      // Generate a unique sample ID
      const sampleId = `${sampleType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const filename = `${sampleId}.json`

      // Store the sample temporarily
      this.pendingSamples.set(sampleId, { sample, filename })

      logger.debug(`Test sample prepared: ${filename}`)

      return sampleId
    } catch (error) {
      logger.error('Failed to collect test sample', error instanceof Error ? error : undefined)
      return undefined
    }
  }

  /**
   * Updates a previously collected sample with response data
   * @param sampleId - The ID of the sample to update
   * @param response - The HTTP response object
   * @param responseBody - The parsed response body
   * @param metadata - Optional metadata about the response (tokens, tool calls, etc.)
   */
  async updateSampleWithResponse(
    sampleId: string,
    response: Response,
    responseBody: any,
    metadata?: {
      inputTokens?: number
      outputTokens?: number
      toolCalls?: number
      streamingChunks?: any[]
    }
  ): Promise<void> {
    if (!this.enabled || !sampleId) {
      return
    }

    const pendingSample = this.pendingSamples.get(sampleId)
    if (!pendingSample) {
      return
    }

    try {
      // Extract response headers
      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      // Add response data to the sample
      pendingSample.sample.response = {
        status: response.status,
        headers: this.sanitizeHeaders(response.headers),
        body: this.sanitizeResponseBody(responseBody),
        metadata,
      }

      // Write the complete sample to file
      const filepath = path.join(this.samplesDir, pendingSample.filename)
      await fs.writeFile(filepath, JSON.stringify(pendingSample.sample, null, 2), 'utf-8')

      // Clean up from pending samples
      this.pendingSamples.delete(sampleId)

      // Successfully updated test sample
    } catch {
      // Failed to update test sample - not critical for main flow
      // Silently ignore to avoid polluting logs
    }
  }

  private sanitizeResponseBody(body: any): any {
    if (!body) {
      return body
    }

    // Create a deep copy
    const sanitized = JSON.parse(JSON.stringify(body))

    // Sanitize content in the response
    if (sanitized.content && Array.isArray(sanitized.content)) {
      sanitized.content = this.sanitizeContentArray(sanitized.content)
    }

    return sanitized
  }

  private sanitizeContentArray(content: any[]): any[] {
    return content.map((block: any) => {
      if (block.type === 'text' && typeof block.text === 'string') {
        return {
          ...block,
          text: this.removeSensitiveContent(block.text),
        }
      }
      return block
    })
  }

  private determineSampleType(body: ClaudeMessagesRequest, requestType: string): string {
    const parts = [
      requestType,
      ...(body.stream ? ['streaming'] : []),
      ...(body.tools?.length ? ['with_tools'] : []),
      ...(body.system ? ['with_system'] : []),
    ]

    const modelFamily = this.getModelFamily(body.model)
    if (modelFamily) {
      parts.push(modelFamily)
    }

    return parts.join('_')
  }

  private getModelFamily(model: string): string {
    if (model.includes('opus')) {
      return 'opus'
    }
    if (model.includes('sonnet')) {
      return 'sonnet'
    }
    if (model.includes('haiku')) {
      return 'haiku'
    }
    return 'unknown'
  }

  private sanitizeHeaders(headers: Headers): Record<string, string> {
    const sanitized: Record<string, string> = {}

    // List of headers to include (sanitized)
    const includeHeaders = [
      'content-type',
      'user-agent',
      'accept',
      'accept-encoding',
      'host',
      'content-length',
      'anthropic-version',
      'anthropic-beta',
    ]

    headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase()

      if (includeHeaders.includes(lowerKey)) {
        sanitized[key] = value
      } else if (lowerKey === 'authorization' || lowerKey === 'x-api-key') {
        // Mask sensitive headers
        sanitized[key] = this.maskSensitiveValue(value)
      }
    })

    return sanitized
  }

  private sanitizeBody(body: ClaudeMessagesRequest): any {
    // Create a deep copy to avoid modifying the original
    const sanitized = JSON.parse(JSON.stringify(body))

    // Remove any API keys or sensitive data that might be in the messages
    if (sanitized.messages) {
      sanitized.messages = sanitized.messages.map((msg: any) => {
        if (typeof msg.content === 'string') {
          return {
            ...msg,
            content: this.removeSensitiveContent(msg.content),
          }
        } else if (Array.isArray(msg.content)) {
          // Handle content blocks
          return {
            ...msg,
            content: this.sanitizeContentArray(msg.content),
          }
        }
        return msg
      })
    }

    if (sanitized.system) {
      if (typeof sanitized.system === 'string') {
        sanitized.system = this.removeSensitiveContent(sanitized.system)
      } else if (Array.isArray(sanitized.system)) {
        // Handle system as array of content blocks
        sanitized.system = this.sanitizeContentArray(sanitized.system)
      }
    }

    return sanitized
  }

  private removeSensitiveContent(content: string): string {
    let sanitized = content

    // Apply all sensitive pattern replacements
    Object.entries(SENSITIVE_PATTERNS).forEach(([key, pattern]) => {
      sanitized = sanitized.replace(pattern, MASKED_VALUES[key as keyof typeof MASKED_VALUES])
    })

    return sanitized
  }

  private maskSensitiveValue(value: string): string {
    if (value.startsWith('sk-ant-')) {
      return 'sk-ant-****'
    }
    if (value.startsWith('Bearer ')) {
      return 'Bearer ****'
    }
    return '****'
  }

  private extractQueryParams(context: Context): Record<string, string> {
    const url = new URL(context.req.url)
    const params: Record<string, string> = {}

    url.searchParams.forEach((value, key) => {
      params[key] = value
    })

    return params
  }
}

// Export singleton instance
export const testSampleCollector = new TestSampleCollector()
