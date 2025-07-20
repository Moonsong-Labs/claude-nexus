import { ProxyRequest } from '../domain/entities/ProxyRequest'
import { ProxyResponse } from '../domain/entities/ProxyResponse'
import { RequestContext } from '../domain/value-objects/RequestContext'
import { AuthResult, AuthenticationService } from './AuthenticationService'
import { sendToSlack, initializeDomainSlack, MessageInfo } from './slack'
import { IncomingWebhook } from '@slack/webhook'
import { logger } from '../middleware/logger'

export interface NotificationConfig {
  enabled: boolean
  maxLines: number
  maxLength: number
}

// Types for tool inputs
interface Todo {
  status: 'pending' | 'in_progress' | 'completed'
}

interface ToolInput {
  file_path?: string
  command?: string
  pattern?: string
  path?: string
  todos?: Todo[]
  query?: string
  url?: string
  prompt?: string
  description?: string
}

// Constants
const TRUNCATION_LIMITS = {
  BASH_COMMAND: 50,
  GREP_PATTERN: 30,
  WEB_SEARCH_QUERY: 40,
  GENERIC_TEXT: 40,
} as const

// Helper functions
const getShortPath = (filePath: string | undefined): string => {
  if (!filePath) {
    return ''
  }
  const pathParts = filePath.split('/')
  return pathParts.slice(-2).join('/')
}

const truncate = (str: string | undefined, maxLength: number): string => {
  if (!str) {
    return ''
  }
  return str.length > maxLength ? str.substring(0, maxLength) + '...' : str
}

// Tool formatters
const toolFormatters: Record<string, (input: ToolInput) => string> = {
  Read: input => (input.file_path ? `Reading file: ${getShortPath(input.file_path)}` : ''),
  Write: input => (input.file_path ? `Writing file: ${getShortPath(input.file_path)}` : ''),
  Edit: input => (input.file_path ? `Editing file: ${getShortPath(input.file_path)}` : ''),
  MultiEdit: input => (input.file_path ? `Editing file: ${getShortPath(input.file_path)}` : ''),
  Bash: input =>
    input.command ? `Running: \`${truncate(input.command, TRUNCATION_LIMITS.BASH_COMMAND)}\`` : '',
  Grep: input =>
    input.pattern
      ? `Searching for: "${truncate(input.pattern, TRUNCATION_LIMITS.GREP_PATTERN)}"`
      : '',
  Glob: input => (input.pattern ? `Finding files: ${input.pattern}` : ''),
  LS: input => (input.path ? `Listing: ${getShortPath(input.path)}/` : ''),
  TodoRead: () => 'Checking task list',
  TodoWrite: input => {
    if (!input.todos || !Array.isArray(input.todos)) {
      return ''
    }
    const todos = input.todos
    const pending = todos.filter(t => t.status === 'pending').length
    const inProgress = todos.filter(t => t.status === 'in_progress').length
    const completed = todos.filter(t => t.status === 'completed').length

    const statusParts = []
    if (pending > 0) {
      statusParts.push(`${pending} pending`)
    }
    if (inProgress > 0) {
      statusParts.push(`${inProgress} in progress`)
    }
    if (completed > 0) {
      statusParts.push(`${completed} completed`)
    }

    if (statusParts.length > 0) {
      return `Tasks: ${statusParts.join(', ')}`
    }
    return `Managing ${todos.length} task${todos.length !== 1 ? 's' : ''}`
  },
  WebSearch: input =>
    input.query
      ? `Searching web: "${truncate(input.query, TRUNCATION_LIMITS.WEB_SEARCH_QUERY)}"`
      : '',
  WebFetch: input => {
    if (!input.url) {
      return ''
    }
    try {
      const url = new URL(input.url)
      return `Fetching: ${url.hostname}`
    } catch {
      return 'Fetching URL'
    }
  },
}

// Default formatter for unknown tools
const defaultToolFormatter = (input: ToolInput): string => {
  if (input.prompt && typeof input.prompt === 'string') {
    return truncate(input.prompt, TRUNCATION_LIMITS.GENERIC_TEXT)
  }
  if (input.description && typeof input.description === 'string') {
    return truncate(input.description, TRUNCATION_LIMITS.GENERIC_TEXT)
  }
  return ''
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
      maxLength: 3000,
    }
  ) {}

  /**
   * Set the authentication service for domain-specific configurations
   * @param authService - The authentication service instance
   */
  setAuthService(authService: AuthenticationService) {
    this.authService = authService
  }

  /**
   * Send notification for a request/response pair
   * @param request - The proxy request
   * @param response - The proxy response
   * @param context - The request context
   * @param auth - The authentication result
   */
  async notify(
    request: ProxyRequest,
    response: ProxyResponse,
    context: RequestContext,
    auth: AuthResult
  ): Promise<void> {
    if (!this.shouldSendNotification(request, context)) {
      return
    }

    try {
      const domainWebhook = await this.getDomainWebhook(context.host)
      const conversationMessage = this.buildConversationMessage(request, response)

      // Send the conversation to Slack
      await sendToSlack(
        {
          requestId: context.requestId,
          domain: context.host,
          model: request.model,
          role: 'conversation',
          content: conversationMessage,
          timestamp: new Date().toISOString(),
          apiKey: this.authService ? this.authService.getMaskedCredentialInfo(auth) : undefined,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        },
        domainWebhook
      )
    } catch (error) {
      // Don't fail the request if notification fails
      logger.error('Failed to send notification', {
        requestId: context.requestId,
        domain: context.host,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      })
    }
  }

  /**
   * Check if notification should be sent
   */
  private shouldSendNotification(request: ProxyRequest, context: RequestContext): boolean {
    if (!this.config.enabled || request.requestType !== 'inference') {
      return false
    }

    // Check if user message changed
    const userContent = request.getUserContentForNotification()
    const previousContent = this.getPreviousMessage(context.host)
    const userMessageChanged = userContent !== previousContent

    if (userContent) {
      this.setPreviousMessage(context.host, userContent)
    }

    return userMessageChanged
  }

  /**
   * Get domain-specific Slack webhook
   */
  private async getDomainWebhook(host: string): Promise<IncomingWebhook | null> {
    const slackConfig = this.authService ? await this.authService.getSlackConfig(host) : undefined
    return slackConfig ? initializeDomainSlack(slackConfig) : null
  }

  /**
   * Build conversation message for notification
   */
  private buildConversationMessage(request: ProxyRequest, response: ProxyResponse): string {
    let conversationMessage = ''

    // Add user message
    const userContent = request.getUserContentForNotification()
    if (userContent) {
      conversationMessage += `:bust_in_silhouette: User: ${userContent}\n`
    }

    // Add assistant response
    const assistantContent = response.getTruncatedContent(
      this.config.maxLines,
      this.config.maxLength
    )
    if (assistantContent) {
      conversationMessage += `:robot_face: Claude: ${assistantContent}\n`
    }

    // Add tool calls if any
    const toolCalls = response.toolCalls
    if (toolCalls.length > 0) {
      for (const tool of toolCalls) {
        const formatter = toolFormatters[tool.name] || defaultToolFormatter
        const details = tool.input ? formatter(tool.input as ToolInput) : ''
        conversationMessage += `    :wrench: ${tool.name}${details ? ` - ${details}` : ''}\n`
      }
    }

    return conversationMessage
  }

  /**
   * Send error notification
   * @param error - The error to notify about
   * @param context - The request context
   */
  async notifyError(error: Error, context: RequestContext): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    try {
      const domainWebhook = await this.getDomainWebhook(context.host)

      await sendToSlack(
        {
          requestId: context.requestId,
          domain: context.host,
          role: 'assistant',
          content: `Error: ${error.message}`,
          timestamp: new Date().toISOString(),
          metadata: {
            errorType: error.constructor.name,
            path: context.path,
          },
        } as MessageInfo,
        domainWebhook
      )
    } catch (notifyError) {
      logger.error('Failed to send error notification', {
        requestId: context.requestId,
        domain: context.host,
        metadata: {
          originalError: {
            message: error.message,
            type: error.constructor.name,
          },
          notifyError:
            notifyError instanceof Error
              ? { message: notifyError.message, stack: notifyError.stack }
              : { message: String(notifyError) },
        },
      })
    }
  }

  /**
   * Get previous message for a domain
   * @param domain - The domain to get the previous message for
   * @returns The previous message or empty string
   */
  private getPreviousMessage(domain: string): string {
    return this.previousMessages.get(domain) || ''
  }

  /**
   * Set previous message for a domain
   * @param domain - The domain to set the message for
   * @param message - The message content to store
   */
  private setPreviousMessage(domain: string, message: string): void {
    // Implement cache size limit
    if (this.previousMessages.size >= this.maxCacheSize) {
      const firstKey = this.previousMessages.keys().next().value
      if (firstKey !== undefined) {
        this.previousMessages.delete(firstKey)
      }
    }
    this.previousMessages.set(domain, message)
  }
}
