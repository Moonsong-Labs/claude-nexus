import { IncomingWebhook, IncomingWebhookSendArguments } from '@slack/webhook'

export interface SlackConfig {
  webhookUrl: string
  channel?: string
  username?: string
  iconEmoji?: string
  enabled: boolean
}

export interface MessageInfo {
  requestId: string
  domain?: string
  model?: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  apiKey?: string // Masked API key for identification
  inputTokens?: number
  outputTokens?: number
}

let webhook: IncomingWebhook | null = null
let slackConfig: SlackConfig | null = null

/**
 * Initialize Slack integration
 */
export function initializeSlack(config: Partial<SlackConfig>) {
  if (!config.webhookUrl) {
    slackConfig = null
    webhook = null
    return
  }

  slackConfig = {
    webhookUrl: config.webhookUrl,
    channel: config.channel,
    username: config.username || 'Claude Nexus Proxy',
    iconEmoji: config.iconEmoji || ':robot_face:',
    enabled: config.enabled !== false
  }

  webhook = new IncomingWebhook(slackConfig.webhookUrl, {
    channel: slackConfig.channel,
    username: slackConfig.username,
    icon_emoji: slackConfig.iconEmoji
  })
}

/**
 * Parse Slack configuration from environment
 */
export function parseSlackConfig(env: any): Partial<SlackConfig> {
  return {
    webhookUrl: env.SLACK_WEBHOOK_URL,
    channel: env.SLACK_CHANNEL,
    username: env.SLACK_USERNAME,
    iconEmoji: env.SLACK_ICON_EMOJI,
    enabled: env.SLACK_ENABLED !== 'false'
  }
}

/**
 * Format message content for Slack
 */
function formatMessageContent(content: any): string {
  if (!content) {
    return 'No content'
  }
  
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (typeof item === 'string') return item
        if (item.type === 'text' && item.text) return item.text
        if (item.type === 'tool_use') return `🔧 Tool: ${item.name}`
        if (item.type === 'tool_result') return `✅ Tool Result`
        return JSON.stringify(item)
      })
      .join('\n')
  }

  return JSON.stringify(content)
}

/**
 * Initialize domain-specific Slack webhook
 */
export function initializeDomainSlack(slackConfig: Partial<SlackConfig> | undefined): IncomingWebhook | null {
  if (!slackConfig?.webhookUrl) {
    return null
  }

  const config = {
    webhookUrl: slackConfig.webhookUrl,
    channel: slackConfig.channel,
    username: slackConfig.username || 'Claude Nexus Proxy',
    iconEmoji: slackConfig.iconEmoji || ':robot_face:',
    enabled: slackConfig.enabled !== false
  }

  if (!config.enabled) {
    return null
  }

  return new IncomingWebhook(config.webhookUrl, {
    channel: config.channel,
    username: config.username,
    icon_emoji: config.iconEmoji
  })
}

/**
 * Send message to Slack
 */
export async function sendToSlack(info: MessageInfo, domainWebhook?: IncomingWebhook | null) {
  // Use domain-specific webhook if available, otherwise fall back to global webhook
  const webhookToUse = domainWebhook || webhook
  
  // Check if webhook is properly configured and is an instance of IncomingWebhook
  if (!webhookToUse || !(webhookToUse instanceof IncomingWebhook)) {
    return
  }
  
  // Additional check for global webhook configuration
  if (!domainWebhook && !slackConfig?.enabled) {
    return
  }

  // Skip Slack notifications for personal domains (privacy protection)
  if (info.domain && info.domain.toLowerCase().includes('personal')) {
    return
  }

  try {
    // Format content
    let content = formatMessageContent(info.content)
    const maxLength = 3000
    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + '... (truncated)'
    }

    // Create simple text message
    const text = content

    // Create footer with metadata
    const metadata = [
      info.domain || 'Unknown',
      info.model || 'Unknown',
      info.apiKey || ''
    ].filter(Boolean).join(' | ')
    
    const tokenInfo = (info.inputTokens || info.outputTokens) 
      ? ` | Tokens: ${info.inputTokens || 0}/${info.outputTokens || 0}`
      : ''

    const message: IncomingWebhookSendArguments = {
      text,
      attachments: [
        {
          footer: `${metadata}${tokenInfo}`,
          ts: Math.floor(new Date(info.timestamp).getTime() / 1000).toString()
        }
      ]
    }

    await webhookToUse.send(message)
  } catch (error) {
    console.error('Failed to send message to Slack:', error)
  }
}

/**
 * Send error notification to Slack
 */
export async function sendErrorToSlack(requestId: string, error: string, domain?: string, domainWebhook?: IncomingWebhook | null) {
  // Use domain-specific webhook if available, otherwise fall back to global webhook
  const webhookToUse = domainWebhook || webhook
  
  // Check if webhook is properly configured and is an instance of IncomingWebhook
  if (!webhookToUse || !(webhookToUse instanceof IncomingWebhook)) {
    return
  }
  
  // Additional check for global webhook configuration
  if (!domainWebhook && !slackConfig?.enabled) {
    return
  }

  // Skip Slack notifications for personal domains (privacy protection)
  if (domain && domain.toLowerCase().includes('personal')) {
    return
  }

  try {
    const message: IncomingWebhookSendArguments = {
      attachments: [
        {
          color: '#ff0000',
          author_name: ':warning: Error',
          title: `Request ${requestId}`,
          text: error,
          fields: [
            {
              title: 'Domain',
              value: domain || 'Unknown',
              short: true
            },
            {
              title: 'Time',
              value: new Date().toISOString(),
              short: true
            }
          ],
          footer: 'Claude Code Proxy'
        }
      ]
    }

    await webhookToUse.send(message)
  } catch (err) {
    console.error('Failed to send error to Slack:', err)
  }
}