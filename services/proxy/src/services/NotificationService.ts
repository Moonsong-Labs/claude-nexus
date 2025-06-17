import { ProxyRequest } from '../domain/entities/ProxyRequest'
import { ProxyResponse } from '../domain/entities/ProxyResponse'
import { RequestContext } from '../domain/value-objects/RequestContext'
import { AuthResult, AuthenticationService } from './AuthenticationService'
import { sendToSlack, initializeDomainSlack, MessageInfo } from './slack.js'
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
  private authService?: AuthenticationService
  
  constructor(
    private config: NotificationConfig = {
      enabled: true,
      maxLines: 20,
      maxLength: 3000
    }
  ) {}
  
  setAuthService(authService: AuthenticationService) {
    this.authService = authService
  }
  
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
    
    // Only send notifications for inference requests
    if (request.requestType !== 'inference') return
    
    try {
      // Get Slack config for the domain
      const slackConfig = this.authService ? await this.authService.getSlackConfig(context.host) : undefined
      
      // Initialize Slack for the domain
      const domainWebhook = initializeDomainSlack(slackConfig)
      
      // Check if user message changed
      const userContent = request.getUserContentForNotification()
      const previousContent = this.getPreviousMessage(context.host)
      const userMessageChanged = userContent !== previousContent
      
      if (userContent) {
        this.setPreviousMessage(context.host, userContent)
      }
      
      // Only send notifications when user message changes
      if (!userMessageChanged) return
      
      // Prepare the conversation message
      let conversationMessage = ''
      
      // Add user message
      if (userContent) {
        conversationMessage += `:bust_in_silhouette: **User**: ${userContent}\n`
      }
      
      // Add assistant response
      const assistantContent = response.getTruncatedContent(this.config.maxLines, this.config.maxLength)
      if (assistantContent) {
        conversationMessage += `:robot_face: **Claude**: ${assistantContent}\n`
      }
      
      // Add tool calls if any
      const toolCalls = response.toolCalls
      if (toolCalls.length > 0) {
        for (const tool of toolCalls) {
          conversationMessage += `:wrench: **${tool.name}**\n`
        }
      }
      
      // Send the conversation to Slack
      await sendToSlack({
        requestId: context.requestId,
        domain: context.host,
        model: request.model,
        role: 'conversation',
        content: conversationMessage,
        timestamp: new Date().toISOString(),
        apiKey: this.authService ? this.authService.getMaskedCredentialInfo(auth) : undefined,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens
      }, domainWebhook)
      
    } catch (error) {
      // Don't fail the request if notification fails
      logger.error('Failed to send notification', {
        requestId: context.requestId,
        domain: context.host,
        error: error instanceof Error ? { message: error.message } : { message: String(error) }
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
      // Get Slack config for the domain
      const slackConfig = this.authService ? await this.authService.getSlackConfig(context.host) : undefined
      const domainWebhook = initializeDomainSlack(slackConfig)
      
      await sendToSlack(
        {
          requestId: context.requestId,
          domain: context.host,
          role: 'assistant',
          content: `Error: ${error.message}`,
          timestamp: new Date().toISOString(),
          metadata: {
            errorType: error.constructor.name,
            path: context.path
          }
        } as MessageInfo,
        domainWebhook
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