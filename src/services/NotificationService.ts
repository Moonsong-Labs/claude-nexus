import { ProxyRequest } from '../domain/entities/ProxyRequest'
import { ProxyResponse } from '../domain/entities/ProxyResponse'
import { RequestContext } from '../domain/value-objects/RequestContext'
import { AuthResult } from './AuthenticationService'
import { sendToSlack, initializeDomainSlack } from '../slack'
import { logger } from '../middleware/logger'

export interface NotificationConfig {
  enabled: boolean
  maxLines: number
  maxLength: number
}

/**
 * Service responsible for sending notifications
 * Currently supports Slack, but could be extended to other channels
 */
export class NotificationService {
  private previousMessages = new Map<string, string>()
  private readonly maxCacheSize = 1000
  
  constructor(
    private config: NotificationConfig = {
      enabled: true,
      maxLines: 20,
      maxLength: 3000
    }
  ) {}
  
  /**
   * Send notification for a request/response pair
   */
  async notify(
    request: ProxyRequest,
    response: ProxyResponse,
    context: RequestContext,
    auth: AuthResult
  ): Promise<void> {
    if (!this.config.enabled) return
    
    try {
      // Initialize Slack for the domain
      await initializeDomainSlack(context.host)
      
      // Check if user message changed
      const userContent = request.getUserContent()
      const previousContent = this.getPreviousMessage(context.host)
      const userMessageChanged = userContent !== previousContent
      
      if (userContent) {
        this.setPreviousMessage(context.host, userContent)
      }
      
      // Build notification payload
      const notification = this.buildNotification(
        request,
        response,
        context,
        auth,
        userMessageChanged
      )
      
      // Send to Slack
      await sendToSlack(
        notification.message,
        notification.userContent,
        notification.assistantContent,
        notification.metadata
      )
      
      logger.debug('Notification sent', {
        requestId: context.requestId,
        domain: context.host,
        hasUserContent: !!notification.userContent,
        hasAssistantContent: !!notification.assistantContent
      })
      
    } catch (error) {
      // Don't fail the request if notification fails
      logger.error('Failed to send notification', {
        requestId: context.requestId,
        domain: context.host,
        error: error.message
      })
    }
  }
  
  /**
   * Send error notification
   */
  async notifyError(
    error: Error,
    context: RequestContext
  ): Promise<void> {
    if (!this.config.enabled) return
    
    try {
      await sendToSlack(
        `Error processing request`,
        `Error: ${error.message}`,
        undefined,
        {
          domain: context.host,
          requestId: context.requestId,
          errorType: error.constructor.name,
          path: context.path
        }
      )
    } catch (notifyError) {
      logger.error('Failed to send error notification', {
        requestId: context.requestId,
        originalError: error.message,
        notifyError: notifyError.message
      })
    }
  }
  
  /**
   * Build notification payload
   */
  private buildNotification(
    request: ProxyRequest,
    response: ProxyResponse,
    context: RequestContext,
    auth: AuthResult,
    userMessageChanged: boolean
  ) {
    const metrics = response.getMetrics()
    
    // Build metadata
    const metadata = {
      domain: context.host,
      model: request.model,
      streaming: request.isStreaming ? 'Yes' : 'No',
      inputTokens: metrics.inputTokens,
      outputTokens: metrics.outputTokens,
      totalTokens: metrics.totalTokens,
      toolCalls: metrics.toolCallCount,
      requestType: request.requestType,
      apiKeyInfo: auth.type === 'api_key' ? auth.key.substring(0, 10) + '****' : 'OAuth',
      processingTime: `${context.getElapsedTime()}ms`
    }
    
    // Prepare content
    const userContent = userMessageChanged ? request.getUserContent() : undefined
    const assistantContent = response.getTruncatedContent(
      this.config.maxLines,
      this.config.maxLength
    )
    
    return {
      message: userMessageChanged ? 'New conversation' : 'Continued conversation',
      userContent,
      assistantContent,
      metadata
    }
  }
  
  /**
   * Get previous message for a domain
   */
  private getPreviousMessage(domain: string): string {
    return this.previousMessages.get(domain) || ''
  }
  
  /**
   * Set previous message for a domain
   */
  private setPreviousMessage(domain: string, message: string): void {
    // Implement cache size limit
    if (this.previousMessages.size >= this.maxCacheSize) {
      const firstKey = this.previousMessages.keys().next().value
      this.previousMessages.delete(firstKey)
    }
    this.previousMessages.set(domain, message)
  }
}