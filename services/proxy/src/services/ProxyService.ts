import { ProxyRequest } from '../domain/entities/ProxyRequest'
import { ProxyResponse } from '../domain/entities/ProxyResponse'
import { RequestContext } from '../domain/value-objects/RequestContext'
import { AuthenticationService } from './AuthenticationService'
import { ClaudeApiClient } from './ClaudeApiClient'
import { NotificationService } from './NotificationService'
import { MetricsService } from './MetricsService'
import { ClaudeMessagesRequest } from '../types/claude'
import { logger } from '../middleware/logger'
import { testSampleCollector } from './TestSampleCollector'
import { extractMessageHashes, generateConversationId } from '@claude-nexus/shared'
import { StorageAdapter } from '../storage/StorageAdapter.js'

/**
 * Main proxy service that orchestrates the request flow
 * This is the core business logic separated from HTTP concerns
 */
export class ProxyService {
  constructor(
    private authService: AuthenticationService,
    private apiClient: ClaudeApiClient,
    private notificationService: NotificationService,
    private metricsService: MetricsService,
    private storageAdapter?: StorageAdapter
  ) {}

  /**
   * Handle a proxy request
   */
  async handleRequest(
    rawRequest: ClaudeMessagesRequest,
    context: RequestContext
  ): Promise<Response> {
    const log = {
      debug: (message: string, metadata?: Record<string, any>) => {
        logger.debug(message, { requestId: context.requestId, domain: context.host, metadata })
      },
      info: (message: string, metadata?: Record<string, any>) => {
        logger.info(message, { requestId: context.requestId, domain: context.host, metadata })
      },
      warn: (message: string, metadata?: Record<string, any>) => {
        logger.warn(message, { requestId: context.requestId, domain: context.host, metadata })
      },
      error: (message: string, error?: Error, metadata?: Record<string, any>) => {
        logger.error(message, {
          requestId: context.requestId,
          domain: context.host,
          error: error
            ? {
                message: error.message,
                stack: error.stack,
                code: (error as any).code,
              }
            : undefined,
          metadata,
        })
      },
    }

    // Create domain entities
    const request = new ProxyRequest(rawRequest, context.host, context.requestId, context.apiKey)

    const response = new ProxyResponse(context.requestId, request.isStreaming)

    // Collect test sample if enabled
    if (context.honoContext) {
      await testSampleCollector.collectSample(context.honoContext, rawRequest, request.requestType)
    }

    // Extract conversation data if storage is enabled
    let conversationData: { currentMessageHash: string; parentMessageHash: string | null; conversationId: string } | undefined
    
    if (this.storageAdapter && rawRequest.messages && rawRequest.messages.length > 0) {
      try {
        const { currentMessageHash, parentMessageHash } = extractMessageHashes(rawRequest.messages)
        
        // Find or create conversation ID
        let conversationId: string
        if (parentMessageHash) {
          // Try to find existing conversation
          const existingConversationId = await this.storageAdapter.findConversationByParentHash(parentMessageHash)
          conversationId = existingConversationId || generateConversationId()
        } else {
          // This is the start of a new conversation
          conversationId = generateConversationId()
        }
        
        conversationData = { currentMessageHash, parentMessageHash, conversationId }
        
        log.debug('Conversation tracking', {
          currentMessageHash,
          parentMessageHash,
          conversationId,
          isNewConversation: !parentMessageHash || !await this.storageAdapter.findConversationByParentHash(parentMessageHash)
        })
      } catch (error) {
        log.warn('Failed to extract conversation data', error as Error)
      }
    }

    try {
      // Authenticate
      const auth = context.host.toLowerCase().includes('personal')
        ? await this.authService.authenticatePersonalDomain(context)
        : await this.authService.authenticateNonPersonalDomain(context)

      // Forward to Claude
      log.info('Forwarding request to Claude', {
        model: request.model,
        streaming: request.isStreaming,
        requestType: request.requestType,
        authSource: context.apiKey ? 'passthrough from request' : 'domain credential file',
      })

      const claudeResponse = await this.apiClient.forward(request, auth)

      // Process response based on streaming mode
      let finalResponse: Response

      if (request.isStreaming) {
        finalResponse = await this.handleStreamingResponse(
          claudeResponse,
          request,
          response,
          context,
          auth,
          conversationData
        )
      } else {
        finalResponse = await this.handleNonStreamingResponse(
          claudeResponse,
          request,
          response,
          context,
          auth
        )
      }

      // Track metrics for successful request
      // Note: For streaming responses, metrics are tracked after stream completes
      if (!request.isStreaming) {
        await this.metricsService.trackRequest(request, response, context, claudeResponse.status, conversationData)
      }

      // Send notifications
      // Note: For streaming responses, notifications are sent after stream completes
      if (!request.isStreaming) {
        await this.notificationService.notify(request, response, context, auth)
      }

      return finalResponse
    } catch (error) {
      // Track error metrics
      await this.metricsService.trackError(
        request,
        error instanceof Error ? error : new Error(String(error)),
        context,
        (error as any).statusCode || 500
      )

      // Notify about error
      await this.notificationService.notifyError(
        error instanceof Error ? error : new Error(String(error)),
        context
      )

      throw error
    }
  }

  /**
   * Handle non-streaming response
   */
  private async handleNonStreamingResponse(
    claudeResponse: Response,
    request: ProxyRequest,
    response: ProxyResponse,
    context: RequestContext,
    _auth: any
  ): Promise<Response> {
    const log = {
      debug: (message: string, metadata?: Record<string, any>) => {
        logger.debug(message, { requestId: context.requestId, domain: context.host, metadata })
      },
      info: (message: string, metadata?: Record<string, any>) => {
        logger.info(message, { requestId: context.requestId, domain: context.host, metadata })
      },
      warn: (message: string, metadata?: Record<string, any>) => {
        logger.warn(message, { requestId: context.requestId, domain: context.host, metadata })
      },
      error: (message: string, error?: Error, metadata?: Record<string, any>) => {
        logger.error(message, {
          requestId: context.requestId,
          domain: context.host,
          error: error
            ? {
                message: error.message,
                stack: error.stack,
                code: (error as any).code,
              }
            : undefined,
          metadata,
        })
      },
    }

    // Process the response
    const jsonResponse = await this.apiClient.processResponse(claudeResponse, response)

    log.debug('Non-streaming response processed', {
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      toolCalls: response.toolCallCount,
    })

    // Return the response
    return new Response(JSON.stringify(jsonResponse), {
      status: claudeResponse.status,
      headers: {
        'Content-Type': 'application/json',
        ...this.getCorsHeaders(),
      },
    })
  }

  /**
   * Handle streaming response
   */
  private async handleStreamingResponse(
    claudeResponse: Response,
    request: ProxyRequest,
    response: ProxyResponse,
    context: RequestContext,
    auth: any,
    conversationData?: {
      currentMessageHash: string
      parentMessageHash: string | null
      conversationId: string
    }
  ): Promise<Response> {
    const log = {
      debug: (message: string, metadata?: Record<string, any>) => {
        logger.debug(message, { requestId: context.requestId, domain: context.host, metadata })
      },
      info: (message: string, metadata?: Record<string, any>) => {
        logger.info(message, { requestId: context.requestId, domain: context.host, metadata })
      },
      warn: (message: string, metadata?: Record<string, any>) => {
        logger.warn(message, { requestId: context.requestId, domain: context.host, metadata })
      },
      error: (message: string, error?: Error, metadata?: Record<string, any>) => {
        logger.error(message, {
          requestId: context.requestId,
          domain: context.host,
          error: error
            ? {
                message: error.message,
                stack: error.stack,
                code: (error as any).code,
              }
            : undefined,
          metadata,
        })
      },
    }

    // Create a transform stream to process events
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()

    // Process stream in background
    this.processStream(claudeResponse, response, writer, context, request, auth, conversationData).catch(
      async error => {
        log.error(
          'Stream processing error',
          error instanceof Error ? error : new Error(String(error))
        )

        // Try to send error to client in SSE format
        try {
          const encoder = new TextEncoder()
          const errorEvent = {
            type: 'error',
            error: {
              type: 'stream_error',
              message: error instanceof Error ? error.message : String(error),
            },
          }
          await writer.write(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`))
        } catch (writeError) {
          log.error(
            'Failed to write error to stream',
            writeError instanceof Error ? writeError : undefined
          )
        }
      }
    )

    // Return streaming response immediately
    return new Response(readable, {
      status: claudeResponse.status,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...this.getCorsHeaders(),
      },
    })
  }

  /**
   * Process streaming response
   */
  private async processStream(
    claudeResponse: Response,
    response: ProxyResponse,
    writer: WritableStreamDefaultWriter,
    context: RequestContext,
    request: ProxyRequest,
    auth: any,
    conversationData?: {
      currentMessageHash: string
      parentMessageHash: string | null
      conversationId: string
    }
  ): Promise<void> {
    const log = {
      debug: (message: string, metadata?: Record<string, any>) => {
        logger.debug(message, { requestId: context.requestId, domain: context.host, metadata })
      },
      info: (message: string, metadata?: Record<string, any>) => {
        logger.info(message, { requestId: context.requestId, domain: context.host, metadata })
      },
      warn: (message: string, metadata?: Record<string, any>) => {
        logger.warn(message, { requestId: context.requestId, domain: context.host, metadata })
      },
      error: (message: string, error?: Error, metadata?: Record<string, any>) => {
        logger.error(message, {
          requestId: context.requestId,
          domain: context.host,
          error: error
            ? {
                message: error.message,
                stack: error.stack,
                code: (error as any).code,
              }
            : undefined,
          metadata,
        })
      },
    }

    try {
      const encoder = new TextEncoder()

      // Process each chunk
      for await (const chunk of this.apiClient.processStreamingResponse(claudeResponse, response)) {
        await writer.write(encoder.encode(chunk))
      }

      // Stream completed - now track metrics and send notifications
      log.debug('Stream completed', {
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        toolCalls: response.toolCallCount,
      })

      // Track metrics after streaming completes
      await this.metricsService.trackRequest(request, response, context, claudeResponse.status, conversationData)

      // Send notifications after streaming completes
      await this.notificationService.notify(request, response, context, auth)
    } catch (error) {
      // Track error metrics
      await this.metricsService.trackError(
        request,
        error instanceof Error ? error : new Error(String(error)),
        context,
        (error as any).statusCode || 500
      )

      // Notify about error
      await this.notificationService.notifyError(
        error instanceof Error ? error : new Error(String(error)),
        context
      )

      throw error
    } finally {
      await writer.close()
    }
  }

  /**
   * Get CORS headers
   */
  private getCorsHeaders(): Record<string, string> {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    }
  }
}
