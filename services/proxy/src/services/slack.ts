import { IncomingWebhook, IncomingWebhookSendArguments } from '@slack/webhook'
import { SlackConfig } from '../credentials'

export interface MessageInfo {
  requestId: string
  domain?: string
  model?: string
  role: 'user' | 'assistant' | 'conversation'
  content: string
  timestamp: string
  apiKey?: string // Masked API key for identification
  inputTokens?: number
  outputTokens?: number
}

// Constants
const MAX_CONTENT_LENGTH = 3000
const DEFAULT_USERNAME = 'Claude Nexus Proxy'
const DEFAULT_ICON_EMOJI = ':robot_face:'
const PERSONAL_DOMAIN_KEYWORD = 'personal'

/**
 * SlackService class for managing Slack notifications
 */
export class SlackService {
  private webhook: IncomingWebhook | null = null
  private config: SlackConfig | null = null

  /**
   * Initialize the Slack service with configuration
   */
  initialize(config: Partial<SlackConfig>): void {
    if (!config.webhook_url) {
      this.config = null
      this.webhook = null
      return
    }

    this.config = {
      webhook_url: config.webhook_url,
      channel: config.channel,
      username: config.username || DEFAULT_USERNAME,
      icon_emoji: config.icon_emoji || DEFAULT_ICON_EMOJI,
      enabled: config.enabled !== false,
    }

    this.webhook = new IncomingWebhook(this.config.webhook_url, {
      channel: this.config.channel,
      username: this.config.username,
      icon_emoji: this.config.icon_emoji,
    })
  }

  /**
   * Check if the service is enabled
   */
  isEnabled(): boolean {
    return this.config?.enabled === true && this.webhook !== null
  }

  /**
   * Send message to Slack
   */
  async sendMessage(info: MessageInfo): Promise<void> {
    if (!this.isEnabled()) {
      return
    }

    // Skip Slack notifications for personal domains (privacy protection)
    if (info.domain?.toLowerCase().includes(PERSONAL_DOMAIN_KEYWORD)) {
      return
    }

    try {
      // Format content
      let content = formatMessageContent(info.content)
      if (content.length > MAX_CONTENT_LENGTH) {
        content = content.substring(0, MAX_CONTENT_LENGTH) + '... (truncated)'
      }

      // Create metadata footer
      const metadata = [info.domain || 'Unknown', info.model || 'Unknown', info.apiKey || '']
        .filter(Boolean)
        .join(' | ')

      const tokenInfo =
        info.inputTokens || info.outputTokens
          ? ` | Tokens: ${info.inputTokens || 0}/${info.outputTokens || 0}`
          : ''

      const message: IncomingWebhookSendArguments = {
        text: content,
        attachments: [
          {
            footer: `${metadata}${tokenInfo}`,
            ts: Math.floor(new Date(info.timestamp).getTime() / 1000).toString(),
          },
        ],
      }

      if (this.webhook) {
        await this.webhook.send(message)
      }
    } catch (error) {
      console.error('Failed to send message to Slack:', error)
    }
  }

  /**
   * Send error notification to Slack
   */
  async sendError(requestId: string, error: string, domain?: string): Promise<void> {
    if (!this.isEnabled()) {
      return
    }

    // Skip Slack notifications for personal domains (privacy protection)
    if (domain?.toLowerCase().includes(PERSONAL_DOMAIN_KEYWORD)) {
      return
    }

    try {
      const message: IncomingWebhookSendArguments = {
        attachments: [
          {
            color: '#ff0000',
            author_name: '⚠️ Error',
            title: `Request ${requestId}`,
            text: error,
            fields: [
              {
                title: 'Domain',
                value: domain || 'Unknown',
                short: true,
              },
              {
                title: 'Time',
                value: new Date().toISOString(),
                short: true,
              },
            ],
            footer: 'Claude Code Proxy',
          },
        ],
      }

      if (this.webhook) {
        await this.webhook.send(message)
      }
    } catch (err) {
      console.error('Failed to send error to Slack:', err)
    }
  }
}

/**
 * Parse Slack configuration from environment
 */
export function parseSlackConfig(env: Record<string, string | undefined>): Partial<SlackConfig> {
  return {
    webhook_url: env.SLACK_WEBHOOK_URL,
    channel: env.SLACK_CHANNEL,
    username: env.SLACK_USERNAME,
    icon_emoji: env.SLACK_ICON_EMOJI,
    enabled: env.SLACK_ENABLED !== 'false',
  }
}

/**
 * Format message content for Slack
 */
function formatMessageContent(content: unknown): string {
  if (!content) {
    return 'No content'
  }

  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (typeof item === 'string') {
          return item
        }
        if (item.type === 'text' && item.text) {
          return item.text
        }
        if (item.type === 'tool_use') {
          return `🔧 Tool: ${item.name}`
        }
        if (item.type === 'tool_result') {
          return `✅ Tool Result`
        }
        return JSON.stringify(item)
      })
      .join('\n')
  }

  return JSON.stringify(content)
}

/**
 * Create a domain-specific Slack service
 */
export function createDomainSlackService(
  slackConfig: Partial<SlackConfig> | undefined
): SlackService | null {
  if (!slackConfig?.webhook_url || slackConfig.enabled === false) {
    return null
  }

  const service = new SlackService()
  service.initialize(slackConfig)
  return service
}

// Singleton instance for backward compatibility
let globalSlackService: SlackService | null = null

/**
 * Initialize global Slack integration (backward compatibility)
 */
export function initializeSlack(config: Partial<SlackConfig>): void {
  if (!globalSlackService) {
    globalSlackService = new SlackService()
  }
  globalSlackService.initialize(config)
}

/**
 * Send message to Slack (backward compatibility)
 */
export async function sendToSlack(
  info: MessageInfo,
  domainService?: SlackService | null
): Promise<void> {
  const serviceToUse = domainService || globalSlackService
  if (!serviceToUse) {
    return
  }
  await serviceToUse.sendMessage(info)
}

/**
 * Send error notification to Slack (backward compatibility)
 */
export async function sendErrorToSlack(
  requestId: string,
  error: string,
  domain?: string,
  domainService?: SlackService | null
): Promise<void> {
  const serviceToUse = domainService || globalSlackService
  if (!serviceToUse) {
    return
  }
  await serviceToUse.sendError(requestId, error, domain)
}

/**
 * Initialize domain-specific Slack webhook (backward compatibility)
 * @deprecated Use createDomainSlackService instead
 */
export function initializeDomainSlack(
  slackConfig: Partial<SlackConfig> | undefined
): SlackService | null {
  return createDomainSlackService(slackConfig)
}
