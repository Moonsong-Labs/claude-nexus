import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'
import { formatDuration as formatDurationUtil } from './formatters.js'
import { isSparkRecommendation, parseSparkRecommendation } from './spark.js'
import { stripSystemReminder } from '@claude-nexus/shared'

export interface ParsedMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  htmlContent: string
  isLong: boolean
  truncatedHtml?: string
  hiddenLineCount?: number
  isToolUse?: boolean
  isToolResult?: boolean
  toolName?: string
  toolId?: string
  timestamp?: Date
  sparkRecommendation?: {
    sessionId: string
    recommendation: any
    toolUse?: any
  }
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

  // Track pending Spark tool uses across messages
  const pendingSparkToolUses: Map<string, any> = new Map()

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
      const parsedMsg = await parseMessage(msg, messageTime, pendingSparkToolUses)
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
      timestamp,
      pendingSparkToolUses
    )
    messages.push(parsedMsg)
  } else if (response.type === 'message' && response.role === 'assistant') {
    // Handle case where response is already in message format
    const parsedMsg = await parseMessage(response, timestamp, pendingSparkToolUses)
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

async function parseMessage(
  msg: any,
  timestamp?: Date,
  pendingSparkToolUses?: Map<string, any>
): Promise<ParsedMessage> {
  let content = ''
  let isToolUse = false
  let isToolResult = false
  let toolName = ''
  let toolId = ''
  let sparkRecommendation: ParsedMessage['sparkRecommendation'] = undefined

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

    // Filter out system-reminder content items and deduplicate tool_use/tool_result by ID
    const seenToolUseIds = new Set<string>()
    const seenToolResultIds = new Set<string>()

    const filteredContent = msg.content.filter((item: any) => {
      // Skip text items that contain system-reminder blocks
      if (item.type === 'text' && typeof item.text === 'string') {
        // If the entire text is just a system-reminder, filter it out
        const stripped = stripSystemReminder(item.text)
        if (stripped.trim().length === 0) {
          return false
        }
      }

      // Deduplicate tool_use items by ID
      if (item.type === 'tool_use' && item.id) {
        if (seenToolUseIds.has(item.id)) {
          return false // Skip duplicate
        }
        seenToolUseIds.add(item.id)
      }

      // Deduplicate tool_result items by tool_use_id
      if (item.type === 'tool_result' && item.tool_use_id) {
        if (seenToolResultIds.has(item.tool_use_id)) {
          return false // Skip duplicate
        }
        seenToolResultIds.add(item.tool_use_id)
      }

      return true
    })

    // Process each filtered content block in order
    filteredContent.forEach((block: any) => {
      switch (block.type) {
        case 'text':
          // Strip system-reminder blocks from text content
          contentParts.push(stripSystemReminder(block.text))
          break

        case 'tool_use': {
          // Check if this is a Spark recommendation tool
          if (isSparkRecommendation(block) && pendingSparkToolUses && block.id) {
            pendingSparkToolUses.set(block.id, block)
          }

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
        }

        case 'tool_result': {
          // Check if this is a Spark recommendation result
          if (pendingSparkToolUses && block.tool_use_id) {
            const pendingSparkToolUse = pendingSparkToolUses.get(block.tool_use_id)
            if (pendingSparkToolUse) {
              const recommendation = parseSparkRecommendation(block, pendingSparkToolUse)
              if (recommendation) {
                sparkRecommendation = {
                  sessionId: recommendation.sessionId,
                  recommendation,
                  toolUse: pendingSparkToolUse,
                }

                // Create a special marker for Spark recommendations
                contentParts.push(`[[SPARK_RECOMMENDATION:${recommendation.sessionId}]]`)
                pendingSparkToolUses.delete(block.tool_use_id)
                break
              }
            }
          }

          let resultContent = '**Tool Result**'
          if (block.tool_use_id) {
            resultContent += ` (ID: ${block.tool_use_id})`
          }
          resultContent += '\n\n'

          // Handle tool result content
          if (typeof block.content === 'string') {
            // Strip system-reminder blocks from tool result content
            const cleanContent = stripSystemReminder(block.content)
            // Tool results might contain HTML/code, wrap in code block for safety
            resultContent += '```\n' + cleanContent + '\n```'
          } else if (Array.isArray(block.content)) {
            // Process each content item in the tool result
            const resultParts: string[] = []

            for (const contentItem of block.content) {
              if (contentItem.type === 'text') {
                const text = contentItem.text
                // Wrap in code block if it looks like it might contain HTML or code
                if (text.includes('<') || text.includes('>') || text.includes('```')) {
                  resultParts.push('```\n' + text + '\n```')
                } else {
                  resultParts.push(text)
                }
              } else if (contentItem.type === 'image' && contentItem.source) {
                // Handle image content
                const { source } = contentItem
                if (source.type === 'base64' && source.data && source.media_type) {
                  // Validate media_type to prevent XSS
                  const validImageTypes = [
                    'image/png',
                    'image/jpeg',
                    'image/jpg',
                    'image/gif',
                    'image/webp',
                  ]
                  if (!validImageTypes.includes(source.media_type)) {
                    resultParts.push('<!-- Unsupported image type -->')
                  } else {
                    // Check data size to prevent performance issues (10MB limit)
                    const sizeInBytes = source.data.length * 0.75 // Approximate base64 to bytes
                    if (sizeInBytes > 10 * 1024 * 1024) {
                      resultParts.push('<!-- Image too large (max 10MB) -->')
                    } else {
                      // Create a data URI for the image
                      const dataUri = `data:${source.media_type};base64,${source.data}`
                      // Add image HTML with proper class for styling
                      resultParts.push(
                        `<img src="${dataUri}" alt="Tool result image" class="tool-result-image" loading="lazy" />`
                      )
                    }
                  }
                } else {
                  resultParts.push('<!-- Unsupported image format -->')
                }
              }
            }

            resultContent += resultParts.join('\n\n')
          }
          contentParts.push(resultContent)
          break
        }
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
      'img',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      code: ['class'],
      pre: ['class'],
      img: ['src', 'alt', 'class', 'loading'],
    },
    allowedSchemesByTag: {
      img: ['data', 'http', 'https'],
    },
    // Don't escape entities in code blocks
    textFilter: function (text, tagName) {
      if (tagName === 'code' || tagName === 'pre') {
        return text
      }
      return text
    },
    transformTags: {
      img: (tagName, attribs) => {
        // Extra validation for data URIs - only allow image types
        const src = attribs.src || ''
        if (src.startsWith('data:')) {
          if (!src.startsWith('data:image/')) {
            // Remove non-image data URIs for security
            return {
              tagName: 'span',
              attribs: {},
              text: '[Invalid image data]',
            }
          }
        }
        return {
          tagName,
          attribs,
        }
      },
    },
  })

  // Check if message is long
  const isLong = content.length > MESSAGE_TRUNCATE_LENGTH
  let truncatedHtml
  let hiddenLineCount = 0

  if (isLong) {
    // Calculate number of hidden lines
    const fullLines = content.split('\n')

    // Check if content has images that would be broken by truncation
    const hasImage = content.includes('<img src="data:image/')
    let truncatedContent = content.substring(0, MESSAGE_TRUNCATE_LENGTH)

    if (hasImage) {
      // Check if truncation would break an image tag
      const truncatedHasCompleteImage =
        (truncatedContent.match(/<img[^>]+\/>/g) || []).length ===
        (truncatedContent.match(/<img/g) || []).length

      if (!truncatedHasCompleteImage) {
        // Truncation breaks an image, so truncate before the broken image
        const lastCompleteImgEnd = truncatedContent.lastIndexOf('/>')
        const lastImgStart = truncatedContent.lastIndexOf('<img')

        if (lastImgStart > lastCompleteImgEnd) {
          // We're in the middle of an image tag
          truncatedContent = content.substring(0, lastImgStart).trim()
        }
      }

      // If we have images in the full content but none in truncated, add a thumbnail
      const fullImageMatches = content.match(/<img[^>]+\/>/g)
      const truncatedImageMatches = truncatedContent.match(/<img[^>]+\/>/g)

      if (fullImageMatches && !truncatedImageMatches) {
        // Add the first image as a thumbnail with data attribute for enhancement
        const thumbnailImg = fullImageMatches[0]
          .replace(
            'class="tool-result-image"',
            'class="tool-result-image tool-result-image-thumbnail"'
          )
          .replace('loading="lazy"', 'loading="eager"')
          .replace('<img', '<img data-thumbnail-expand="true"')
        truncatedContent = truncatedContent + '\n\n' + thumbnailImg
      }
    }

    truncatedContent += '...'
    const truncatedLines = truncatedContent.split('\n')
    hiddenLineCount = Math.max(0, fullLines.length - truncatedLines.length + 1) // +1 because last line might be partial

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
        'img',
      ]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        code: ['class'],
        pre: ['class'],
        img: ['src', 'alt', 'class', 'loading'],
      },
      allowedSchemesByTag: {
        img: ['data', 'http', 'https'],
      },
      // Don't escape entities in code blocks
      textFilter: function (text, tagName) {
        if (tagName === 'code' || tagName === 'pre') {
          return text
        }
        return text
      },
      transformTags: {
        img: (tagName, attribs) => {
          // Extra validation for data URIs - only allow image types
          const src = attribs.src || ''
          if (src.startsWith('data:')) {
            if (!src.startsWith('data:image/')) {
              // Remove non-image data URIs for security
              return {
                tagName: 'span',
                attribs: {},
                text: '[Invalid image data]',
              }
            }
          }
          return {
            tagName,
            attribs,
          }
        },
      },
    })
  }

  return {
    role: msg.role,
    content,
    htmlContent,
    isLong,
    truncatedHtml,
    hiddenLineCount,
    isToolUse,
    isToolResult,
    toolName,
    toolId,
    timestamp,
    sparkRecommendation,
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
