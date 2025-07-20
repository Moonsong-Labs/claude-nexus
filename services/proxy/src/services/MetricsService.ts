import { ProxyRequest, RequestType } from '../domain/entities/ProxyRequest'
import { ProxyResponse } from '../domain/entities/ProxyResponse'
import { RequestContext } from '../domain/value-objects/RequestContext'
import { tokenTracker } from './tokenTracker.js'
import { StorageAdapter } from '../storage/StorageAdapter.js'
import { TokenUsageService } from './TokenUsageService.js'
import { logger } from '../middleware/logger'

export interface MetricsConfig {
  enableTokenTracking: boolean
  enableStorage: boolean
}

// Request types that should not be stored in the database
const NON_STORABLE_REQUEST_TYPES = new Set<RequestType>(['query_evaluation', 'quota'])

/**
 * Conversation tracking data for linking messages
 */
export interface ConversationData {
  currentMessageHash: string
  parentMessageHash: string | null
  conversationId: string
  systemHash: string | null
  branchId?: string
  parentRequestId?: string
  parentTaskRequestId?: string
  isSubtask?: boolean
}

/**
 * Parameters for tracking a request
 */
export interface TrackRequestParams {
  status?: number
  conversationData?: ConversationData
  responseHeaders?: Record<string, string>
  fullResponseBody?: any // Claude API response can have various shapes
  accountId?: string
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
    },
    private storageService?: StorageAdapter,
    private tokenUsageService?: TokenUsageService
  ) {}

  /**
   * Track metrics for a successful request
   */
  async trackRequest(
    request: ProxyRequest,
    response: ProxyResponse,
    context: RequestContext,
    params: TrackRequestParams = {}
  ): Promise<void> {
    const { status = 200, conversationData, responseHeaders, fullResponseBody, accountId } = params
    const metrics = response.getMetrics()

    // Track tokens
    if (this.config.enableTokenTracking) {
      tokenTracker.track(
        context.host,
        metrics.inputTokens,
        metrics.outputTokens,
        request.requestType === 'quota' ? undefined : request.requestType,
        metrics.toolCallCount
      )

      // Also track in persistent storage if available
      if (this.tokenUsageService && accountId) {
        await this.tokenUsageService.recordUsage({
          accountId,
          domain: context.host,
          model: request.model,
          requestType: request.requestType,
          inputTokens: metrics.inputTokens,
          outputTokens: metrics.outputTokens,
          totalTokens: metrics.inputTokens + metrics.outputTokens,
          cacheCreationInputTokens: metrics.cacheCreationInputTokens || 0,
          cacheReadInputTokens: metrics.cacheReadInputTokens || 0,
          requestCount: 1,
        })
      }
    }

    // Store in database
    if (this.config.enableStorage && this.storageService) {
      await this.storeRequest(
        request,
        response,
        context,
        status,
        conversationData,
        responseHeaders,
        fullResponseBody,
        accountId
      )
    }

    // Log metrics
    logger.info('Request processed', {
      requestId: context.requestId,
      domain: context.host,
      metadata: {
        model: request.model,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        duration: context.getElapsedTime(),
        requestType: request.requestType,
        stored: request.requestType === 'inference' && this.config.enableStorage,
      },
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
      tokenTracker.track(
        context.host,
        0,
        0,
        request.requestType === 'quota' ? undefined : request.requestType,
        0
      )
    }

    logger.error('Request error tracked', {
      requestId: context.requestId,
      domain: context.host,
      metadata: {
        error: error.message,
        status,
      },
    })
  }

  /**
   * Get token statistics
   */
  getStats(domain?: string) {
    const allStats = tokenTracker.getStats()
    if (domain) {
      return allStats[domain] || null
    }
    return allStats
  }

  /**
   * Store request in database
   */
  private async storeRequest(
    request: ProxyRequest,
    response: ProxyResponse,
    context: RequestContext,
    status: number,
    conversationData?: ConversationData,
    responseHeaders?: Record<string, string>,
    fullResponseBody?: any,
    accountId?: string
  ): Promise<void> {
    if (!this.storageService) {
      return
    }

    // Skip storing requests based on type
    if (NON_STORABLE_REQUEST_TYPES.has(request.requestType)) {
      logger.debug('Skipping storage for non-storable request type', {
        requestId: context.requestId,
        domain: context.host,
        metadata: {
          requestType: request.requestType,
        },
      })
      return
    }

    try {
      const metrics = response.getMetrics()

      // Calculate message count from request body
      let messageCount = 0
      if (request.raw.messages && Array.isArray(request.raw.messages)) {
        messageCount = request.raw.messages.length
      }

      await this.storageService.storeRequest({
        id: context.requestId,
        domain: context.host,
        accountId: accountId,
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
        cache_creation_input_tokens: metrics.cacheCreationInputTokens,
        cache_read_input_tokens: metrics.cacheReadInputTokens,
        usage_data: metrics.fullUsageData,
        tool_call_count: metrics.toolCallCount,
        processing_time: context.getElapsedTime(),
        status_code: status,
        currentMessageHash: conversationData?.currentMessageHash,
        parentMessageHash: conversationData?.parentMessageHash,
        conversationId: conversationData?.conversationId,
        branchId: conversationData?.branchId,
        systemHash: conversationData?.systemHash,
        messageCount: messageCount,
        parentRequestId: conversationData?.parentRequestId,
        parentTaskRequestId: conversationData?.parentTaskRequestId,
        isSubtask: conversationData?.isSubtask,
      })

      // Store response
      await this.storageService.storeResponse({
        request_id: context.requestId,
        status_code: status,
        headers: responseHeaders || {}, // Store full response headers
        body: fullResponseBody || { content: response.content }, // Store full response body if available, fallback to content
        timestamp: new Date(),
        input_tokens: metrics.inputTokens,
        output_tokens: metrics.outputTokens,
        total_tokens: metrics.totalTokens,
        cache_creation_input_tokens: metrics.cacheCreationInputTokens,
        cache_read_input_tokens: metrics.cacheReadInputTokens,
        usage_data: metrics.fullUsageData,
        tool_call_count: metrics.toolCallCount,
        processing_time: context.getElapsedTime(),
      })

      // Process Task tool invocations if we have the full response body
      if (fullResponseBody) {
        await this.storageService.processTaskToolInvocations(
          context.requestId,
          fullResponseBody,
          context.host
        )
      }
    } catch (error) {
      logger.error('Failed to store request/response', {
        requestId: context.requestId,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }
}
