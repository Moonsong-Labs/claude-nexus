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
 * Send message to Slack
 */
export async function sendToSlack(info: MessageInfo) {
  if (!webhook || !slackConfig?.enabled) {
    return
  }

  try {
    const color = info.role === 'user' ? '#36a64f' : '#3AA3E3'
    const emoji = info.role === 'user' ? ':bust_in_silhouette:' : ':robot_face:'
    
    // Truncate content if too long
    let content = formatMessageContent(info.content)
    const maxLength = 3000
    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + '... (truncated)'
    }

    const fields: Array<{title: string, value: string, short?: boolean}> = [
      {
        title: 'Domain',
        value: info.domain || 'Unknown',
        short: true
      },
      {
        title: 'Model',
        value: info.model || 'Unknown',
        short: true
      }
    ]

    if (info.apiKey) {
      fields.push({
        title: 'API Key',
        value: info.apiKey,
        short: true
      })
    }

    if (info.inputTokens || info.outputTokens) {
      fields.push({
        title: 'Tokens',
        value: `In: ${info.inputTokens || 0}, Out: ${info.outputTokens || 0}`,
        short: true
      })
    }

    const message: IncomingWebhookSendArguments = {
      attachments: [
        {
          color,
          author_name: `${emoji} ${info.role === 'user' ? 'User' : 'Assistant'}`,
          title: `Request ${info.requestId}`,
          text: content,
          fields,
          footer: 'Claude Nexus Proxy',
          ts: Math.floor(new Date(info.timestamp).getTime() / 1000).toString()
        }
      ]
    }

    await webhook.send(message)
  } catch (error) {
    console.error('Failed to send message to Slack:', error)
  }
}

/**
 * Send error notification to Slack
 */
export async function sendErrorToSlack(requestId: string, error: string, domain?: string) {
  if (!webhook || !slackConfig?.enabled) {
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

    await webhook.send(message)
  } catch (err) {
    console.error('Failed to send error to Slack:', err)
  }
}