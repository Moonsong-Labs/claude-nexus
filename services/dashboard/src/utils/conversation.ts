import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'
import { formatDuration as formatDurationUtil } from './formatters.js'

export interface ParsedMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  htmlContent: string
  isLong: boolean
  truncatedHtml?: string
  isToolUse?: boolean
  isToolResult?: boolean
  toolName?: string
  toolId?: string
  timestamp?: Date
  metadata?: {
    tokenCount?: number
    toolCalls?: any[]
  }
}

export interface ConversationData {
  messages: ParsedMessage[]
  toolUsage: Record<string, number>
  totalInputTokens: number
  totalOutputTokens: number
  model: string
  duration?: number
  error?: {
    type: string
    message: string
    statusCode?: number
  }
  rawResponse?: any
}

const MESSAGE_TRUNCATE_LENGTH = 300

export async function parseConversation(requestData: any): Promise<ConversationData> {
  const request = requestData.request_body || {}
  const response = requestData.response_body || {}
  const timestamp = requestData.timestamp ? new Date(requestData.timestamp) : new Date()

  const messages: ParsedMessage[] = []
  const toolUsage: Record<string, number> = {}

  // Helper function to process message content for tool usage
  const processMessageContentForTools = (content: any[]) => {
    if (!Array.isArray(content)) {
      return
    }
    for (const block of content) {
      if (block.type === 'tool_use' && block.name) {
        toolUsage[block.name] = (toolUsage[block.name] || 0) + 1
      }
    }
  }

  // Parse request messages
  if (request.messages && Array.isArray(request.messages)) {
    for (let i = 0; i < request.messages.length; i++) {
      const msg = request.messages[i]
      // Process tool usage for this message
      if (msg.content && Array.isArray(msg.content)) {
        processMessageContentForTools(msg.content)
      }
      // For user messages, use the request timestamp
      // For older messages in conversation, estimate based on position
      const messageTime = new Date(timestamp)
      if (i < request.messages.length - 1) {
        // Earlier messages - subtract some time
        messageTime.setSeconds(messageTime.getSeconds() - (request.messages.length - i) * 30)
      }
      const parsedMsg = await parseMessage(msg, messageTime)
      messages.push(parsedMsg)
    }
  }

  // Parse assistant response
  if (response.content) {
    // Process tool usage for assistant response if content is an array
    if (Array.isArray(response.content)) {
      processMessageContentForTools(response.content)
    }
    // Assistant response gets the actual timestamp
    const parsedMsg = await parseMessage(
      {
        role: 'assistant',
        content: response.content,
      },
      timestamp
    )
    messages.push(parsedMsg)
  } else if (response.type === 'message' && response.role === 'assistant') {
    // Handle case where response is already in message format
    const parsedMsg = await parseMessage(response, timestamp)
    messages.push(parsedMsg)
  }

  // Check for errors
  let error
  if (response.error) {
    error = {
      type: response.error.type || 'unknown_error',
      message: response.error.message || 'An error occurred',
      statusCode: requestData.status_code,
    }
  }

  return {
    messages,
    toolUsage,
    totalInputTokens: requestData.request_tokens || 0,
    totalOutputTokens: requestData.response_tokens || 0,
    model: requestData.model || 'unknown',
    duration: requestData.duration,
    error,
    rawResponse: response,
  }
}

async function parseMessage(msg: any, timestamp?: Date): Promise<ParsedMessage> {
  let content = ''
  let isToolUse = false
  let isToolResult = false
  let toolName = ''
  let toolId = ''

  // Handle different content formats
  if (typeof msg.content === 'string') {
    content = msg.content
  } else if (Array.isArray(msg.content)) {
    // Process all content blocks in order
    const contentParts: string[] = []
    const toolUseBlocks = msg.content.filter((c: any) => c.type === 'tool_use')
    const toolResultBlocks = msg.content.filter((c: any) => c.type === 'tool_result')
    
    // Track if we have any tool blocks for metadata
    isToolUse = toolUseBlocks.length > 0
    isToolResult = toolResultBlocks.length > 0
    
    // If there are tool blocks, use the first one for metadata (backward compatibility)
    if (toolUseBlocks.length > 0) {
      toolName = toolUseBlocks[0].name || 'Unknown Tool'
      toolId = toolUseBlocks[0].id || ''
    } else if (toolResultBlocks.length > 0) {
      toolId = toolResultBlocks[0].tool_use_id || ''
    }

    // Process each content block in order
    msg.content.forEach((block: any, index: number) => {
      switch (block.type) {
        case 'text':
          contentParts.push(block.text)
          break
          
        case 'tool_use':
          let toolContent = `**Tool Use: ${block.name || 'Unknown Tool'}**`
          if (block.id) {
            toolContent += ` (ID: ${block.id})`
          }
          toolContent += '\n\n'
          
          // Add tool input if available
          if (block.input) {
            const jsonStr = JSON.stringify(block.input, null, 2)
            toolContent += '```json\n' + jsonStr + '\n```'
          }
          contentParts.push(toolContent)
          break
          
        case 'tool_result':
          let resultContent = '**Tool Result**'
          if (block.tool_use_id) {
            resultContent += ` (ID: ${block.tool_use_id})`
          }
          resultContent += '\n\n'
          
          // Handle tool result content
          if (typeof block.content === 'string') {
            // Tool results might contain HTML/code, wrap in code block for safety
            resultContent += '```\n' + block.content + '\n```'
          } else if (Array.isArray(block.content)) {
            const resultText = block.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join('\n\n')
            // Wrap in code block if it looks like it might contain HTML or code
            if (resultText.includes('<') || resultText.includes('>') || resultText.includes('```')) {
              resultContent += '```\n' + resultText + '\n```'
            } else {
              resultContent += resultText
            }
          }
          contentParts.push(resultContent)
          break
      }
    })
    
    // Join all parts with proper separation
    content = contentParts.join('\n\n---\n\n').trim()
  }

  // Render markdown to HTML
  const dirtyHtml = await marked.parse(content)
  const htmlContent = sanitizeHtml(dirtyHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'pre',
      'code',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      code: ['class'],
      pre: ['class'],
    },
    // Don't escape entities in code blocks
    textFilter: function (text, tagName) {
      if (tagName === 'code' || tagName === 'pre') {
        return text
      }
      return text
    },
  })

  // Check if message is long
  const isLong = content.length > MESSAGE_TRUNCATE_LENGTH
  let truncatedHtml

  if (isLong) {
    const truncatedContent = content.substring(0, MESSAGE_TRUNCATE_LENGTH) + '...'
    const dirtyTruncatedHtml = await marked.parse(truncatedContent)
    truncatedHtml = sanitizeHtml(dirtyTruncatedHtml, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat([
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'pre',
        'code',
      ]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        code: ['class'],
        pre: ['class'],
      },
      // Don't escape entities in code blocks
      textFilter: function (text, tagName) {
        if (tagName === 'code' || tagName === 'pre') {
          return text
        }
        return text
      },
    })
  }

  return {
    role: msg.role,
    content,
    htmlContent,
    isLong,
    truncatedHtml,
    isToolUse,
    isToolResult,
    toolName,
    toolId,
    timestamp,
    metadata: {
      tokenCount: msg.tokenCount,
      toolCalls: msg.toolCalls,
    },
  }
}

// Cost calculation utilities
const DEFAULT_INPUT_COST_PER_MTOK = 15.0 // $15 per million tokens (Opus default)
const DEFAULT_OUTPUT_COST_PER_MTOK = 75.0 // $75 per million tokens (Opus default)

export function calculateCost(
  inputTokens: number,
  outputTokens: number
): {
  inputCost: number
  outputCost: number
  totalCost: number
  formattedTotal: string
} {
  const inputCostPerMtok =
    parseFloat(process.env.ANTHROPIC_INPUT_COST_PER_MTOK || '') || DEFAULT_INPUT_COST_PER_MTOK
  const outputCostPerMtok =
    parseFloat(process.env.ANTHROPIC_OUTPUT_COST_PER_MTOK || '') || DEFAULT_OUTPUT_COST_PER_MTOK

  const inputCost = (inputTokens / 1_000_000) * inputCostPerMtok
  const outputCost = (outputTokens / 1_000_000) * outputCostPerMtok
  const totalCost = inputCost + outputCost

  return {
    inputCost,
    outputCost,
    totalCost,
    formattedTotal: `$${totalCost.toFixed(4)}`,
  }
}

// Re-export formatDuration from formatters for backward compatibility
export const formatDuration = formatDurationUtil

// Format timestamp for display
export function formatMessageTime(date?: Date): string {
  if (!date) {
    return ''
  }

  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')

  return `${hours}:${minutes}:${seconds}`
}
