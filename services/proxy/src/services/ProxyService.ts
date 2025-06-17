import { ProxyRequest } from '../domain/entities/ProxyRequest'
import { ProxyResponse } from '../domain/entities/ProxyResponse'
import { RequestContext } from '../domain/value-objects/RequestContext'
import { AuthenticationService } from './AuthenticationService'
import { ClaudeApiClient } from './ClaudeApiClient'
import { NotificationService } from './NotificationService'
import { MetricsService } from './MetricsService'
import { ClaudeMessagesRequest } from '../types/claude'
import { ValidationError } from '../types/errors'
import { logger } from '../middleware/logger'
import { testSampleCollector } from './TestSampleCollector'

/**
 * Main proxy service that orchestrates the request flow
 * This is the core business logic separated from HTTP concerns
 */
export class ProxyService {
  constructor(
    private authService: AuthenticationService,
    private apiClient: ClaudeApiClient,
    private notificationService: NotificationService,
    private metricsService: MetricsService
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
          error: error ? {
            message: error.message,
            stack: error.stack,
            code: (error as any).code
          } : undefined,
          metadata
        })
      }
    }
    
    // Create domain entities
    const request = new ProxyRequest(
      rawRequest,
      context.host,
      context.requestId,
      context.apiKey
    )
    
    const response = new ProxyResponse(
      context.requestId,
      request.isStreaming
    )
    
    // Collect test sample if enabled
    await testSampleCollector.collectSample(
      context.honoContext,
      rawRequest,
      request.requestType
    )
    
    try {
      // Authenticate
      // log.debug('Authenticating request', {
      //   hasRequestApiKey: !!context.apiKey,
      //   apiKeySource: context.apiKey ? 'request header' : 'will check credential file'
      // })
      
      const auth = await this.authService.authenticate(context)
      
      // log.debug('Authentication completed', {
      //   authType: auth.type,
      //   usingCredentialFile: !context.apiKey
      // })
      
      // Forward to Claude
      log.info('Forwarding request to Claude', {
        model: request.model,
        streaming: request.isStreaming,
        requestType: request.requestType,
        authSource: context.apiKey ? 'passthrough from request' : 'domain credential file'
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
          auth
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
        await this.metricsService.trackRequest(
          request,
          response,
          context,
          claudeResponse.status
        )
      }
      
      // Send notifications
      // Note: For streaming responses, notifications are sent after stream completes
      if (!request.isStreaming) {
        await this.notificationService.notify(
          request,
          response,
          context,
          auth
        )
      }
      
      return finalResponse
      
    } catch (error) {
      // Track error metrics
      await this.metricsService.trackError(
        request,
        error,
        context,
        error.statusCode || 500
      )
      
      // Notify about error
      await this.notificationService.notifyError(error, context)
      
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
    auth: any
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
          error: error ? {
            message: error.message,
            stack: error.stack,
            code: (error as any).code
          } : undefined,
          metadata
        })
      }
    }
    
    // Process the response
    const jsonResponse = await this.apiClient.processResponse(
      claudeResponse,
      response
    )
    
    log.debug('Non-streaming response processed', {
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      toolCalls: response.toolCallCount
    })
    
    // Return the response
    return new Response(JSON.stringify(jsonResponse), {
      status: claudeResponse.status,
      headers: {
        'Content-Type': 'application/json',
        ...this.getCorsHeaders()
      }
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
    auth: any
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
          error: error ? {
            message: error.message,
            stack: error.stack,
            code: (error as any).code
          } : undefined,
          metadata
        })
      }
    }
    
    // Create a transform stream to process events
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    
    // Process stream in background
    this.processStream(
      claudeResponse,
      response,
      writer,
      context,
      request,
      auth
    ).catch(error => {
      log.error('Stream processing error', error instanceof Error ? error : new Error(String(error)))
    })
    
    // Return streaming response immediately
    return new Response(readable, {
      status: claudeResponse.status,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...this.getCorsHeaders()
      }
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
    auth: any
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
          error: error ? {
            message: error.message,
            stack: error.stack,
            code: (error as any).code
          } : undefined,
          metadata
        })
      }
    }
    
    try {
      const encoder = new TextEncoder()
      
      // Process each chunk
      for await (const chunk of this.apiClient.processStreamingResponse(
        claudeResponse,
        response
      )) {
        await writer.write(encoder.encode(chunk))
      }
      
      // Stream completed - now track metrics and send notifications
      log.debug('Stream completed', {
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        toolCalls: response.toolCallCount
      })
      
      // Track metrics after streaming completes
      await this.metricsService.trackRequest(
        request,
        response,
        context,
        claudeResponse.status
      )
      
      // Send notifications after streaming completes
      await this.notificationService.notify(
        request,
        response,
        context,
        auth
      )
      
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
    }
  }
}