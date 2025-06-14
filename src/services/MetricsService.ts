import { ProxyRequest } from '../domain/entities/ProxyRequest'
import { ProxyResponse } from '../domain/entities/ProxyResponse'
import { RequestContext } from '../domain/value-objects/RequestContext'
import { trackTokens, getTokenStats } from '../tokenTracker'
import { StorageService } from '../storage'
import { logger } from '../middleware/logger'

export interface MetricsConfig {
  enableTokenTracking: boolean
  enableStorage: boolean
  enableTelemetry: boolean
}

export interface TelemetryData {
  requestId: string
  timestamp: number
  domain: string
  apiKey?: string
  model: string
  inputTokens?: number
  outputTokens?: number
  duration?: number
  status: number
  error?: string
  toolCallCount?: number
  requestType?: string
}

/**
 * Service responsible for metrics collection and tracking
 * Handles token tracking, storage, and telemetry
 */
export class MetricsService {
  constructor(
    private config: MetricsConfig = {
      enableTokenTracking: true,
      enableStorage: true,
      enableTelemetry: true
    },
    private storageService?: StorageService,
    private telemetryEndpoint?: string
  ) {}
  
  /**
   * Track metrics for a successful request
   */
  async trackRequest(
    request: ProxyRequest,
    response: ProxyResponse,
    context: RequestContext,
    status: number = 200
  ): Promise<void> {
    const metrics = response.getMetrics()
    
    // Track tokens
    if (this.config.enableTokenTracking) {
      trackTokens(
        context.host,
        metrics.inputTokens,
        metrics.outputTokens,
        request.requestType,
        metrics.toolCallCount
      )
    }
    
    // Store in database
    if (this.config.enableStorage && this.storageService) {
      await this.storeRequest(request, response, context, status)
    }
    
    // Send telemetry
    if (this.config.enableTelemetry && this.telemetryEndpoint) {
      await this.sendTelemetry({
        requestId: context.requestId,
        timestamp: Date.now(),
        domain: context.host,
        apiKey: this.maskApiKey(context.apiKey),
        model: request.model,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        duration: context.getElapsedTime(),
        status,
        toolCallCount: metrics.toolCallCount,
        requestType: request.requestType
      })
    }
    
    // Log metrics
    logger.info('Request metrics tracked', {
      requestId: context.requestId,
      domain: context.host,
      model: request.model,
      inputTokens: metrics.inputTokens,
      outputTokens: metrics.outputTokens,
      duration: context.getElapsedTime(),
      requestType: request.requestType
    })
  }
  
  /**
   * Track error metrics
   */
  async trackError(
    request: ProxyRequest,
    error: Error,
    context: RequestContext,
    status: number = 500
  ): Promise<void> {
    // Track in token stats (error counts)
    if (this.config.enableTokenTracking) {
      trackTokens(context.host, 0, 0, request.requestType, 0)
    }
    
    // Send telemetry
    if (this.config.enableTelemetry && this.telemetryEndpoint) {
      await this.sendTelemetry({
        requestId: context.requestId,
        timestamp: Date.now(),
        domain: context.host,
        apiKey: this.maskApiKey(context.apiKey),
        model: request.model,
        duration: context.getElapsedTime(),
        status,
        error: error.message,
        requestType: request.requestType
      })
    }
    
    logger.error('Request error tracked', {
      requestId: context.requestId,
      domain: context.host,
      error: error.message,
      status
    })
  }
  
  /**
   * Get token statistics
   */
  getStats(domain?: string) {
    return getTokenStats(domain)
  }
  
  /**
   * Store request in database
   */
  private async storeRequest(
    request: ProxyRequest,
    response: ProxyResponse,
    context: RequestContext,
    status: number
  ): Promise<void> {
    if (!this.storageService) return
    
    try {
      const metrics = response.getMetrics()
      
      await this.storageService.storeRequest({
        id: context.requestId,
        domain: context.host,
        timestamp: new Date(context.startTime),
        method: context.method,
        path: context.path,
        headers: context.headers,
        body: request.raw,
        request_type: request.requestType,
        model: request.model,
        input_tokens: metrics.inputTokens,
        output_tokens: metrics.outputTokens,
        total_tokens: metrics.totalTokens,
        tool_call_count: metrics.toolCallCount,
        processing_time: context.getElapsedTime(),
        status_code: status
      })
      
      // Store response
      await this.storageService.storeResponse({
        request_id: context.requestId,
        status_code: status,
        headers: {}, // Response headers if needed
        body: { content: response.content }, // Store as JSON
        timestamp: new Date()
      })
      
    } catch (error) {
      logger.error('Failed to store request/response', {
        requestId: context.requestId,
        error: error.message
      })
    }
  }
  
  /**
   * Send telemetry data
   */
  private async sendTelemetry(data: TelemetryData): Promise<void> {
    if (!this.telemetryEndpoint) return
    
    try {
      const response = await fetch(this.telemetryEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(5000) // 5 second timeout
      })
      
      if (!response.ok) {
        logger.warn('Telemetry request failed', {
          status: response.status,
          endpoint: this.telemetryEndpoint
        })
      }
    } catch (error) {
      // Don't fail the request if telemetry fails
      logger.debug('Failed to send telemetry', {
        error: error.message,
        endpoint: this.telemetryEndpoint
      })
    }
  }
  
  /**
   * Mask API key for telemetry
   */
  private maskApiKey(key?: string): string | undefined {
    if (!key || key.length < 8) return undefined
    if (key.length <= 10) return key
    return `...${key.slice(-10)}`
  }
}