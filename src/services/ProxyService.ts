import { ProxyRequest } from '../domain/entities/ProxyRequest'
import { ProxyResponse } from '../domain/entities/ProxyResponse'
import { RequestContext } from '../domain/value-objects/RequestContext'
import { AuthenticationService } from './AuthenticationService'
import { ClaudeApiClient } from './ClaudeApiClient'
import { NotificationService } from './NotificationService'
import { MetricsService } from './MetricsService'
import { ClaudeMessagesRequest } from '../types/claude'
import { ValidationError } from '../types/errors'
import { getRequestLogger } from '../middleware/logger'

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
    const logger = getRequestLogger(context as any)
    
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
    
    try {
      // Authenticate
      logger.debug('Authenticating request')
      const auth = await this.authService.authenticate(context)
      
      // Forward to Claude
      logger.info('Forwarding request to Claude', {
        model: request.model,
        streaming: request.isStreaming,
        requestType: request.requestType
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
      await this.metricsService.trackRequest(
        request,
        response,
        context,
        claudeResponse.status
      )
      
      // Send notifications
      await this.notificationService.notify(
        request,
        response,
        context,
        auth
      )
      
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
    const logger = getRequestLogger(context as any)
    
    // Process the response
    const jsonResponse = await this.apiClient.processResponse(
      claudeResponse,
      response
    )
    
    logger.debug('Non-streaming response processed', {
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
    const logger = getRequestLogger(context as any)
    
    // Create a transform stream to process events
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    
    // Process stream in background
    this.processStream(
      claudeResponse,
      response,
      writer,
      context
    ).catch(error => {
      logger.error('Stream processing error', error)
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
    context: RequestContext
  ): Promise<void> {
    const logger = getRequestLogger(context as any)
    
    try {
      const encoder = new TextEncoder()
      
      // Process each chunk
      for await (const chunk of this.apiClient.processStreamingResponse(
        claudeResponse,
        response
      )) {
        await writer.write(encoder.encode(chunk))
      }
      
      logger.debug('Streaming response completed', {
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        toolCalls: response.toolCallCount
      })
      
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