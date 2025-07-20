/**
 * Utilities for detecting and parsing Spark tool recommendations
 * @module spark
 */

// Constants
const SPARK_TOOL_NAME = 'mcp__spark__get_recommendation' as const
const NONE_VALUE = 'None' as const

// Type definitions for Claude API structures
interface TextContent {
  type: 'text'
  text: string
}

interface ToolUseContent {
  type: 'tool_use'
  id: string
  name: string
  input?: {
    request?: {
      query?: string
      context?: string | string[]
    }
  }
}

interface ToolResultContent {
  type: 'tool_result'
  tool_use_id: string
  content: TextContent[]
}

// Spark-specific types
export interface SparkRecommendation {
  sessionId: string
  request: string
  response: string
  feedback?: unknown
  errorMessage?: string | null
  metadata?: Record<string, unknown>
  query?: string
  context?: string | string[]
}

interface SparkApiResponse {
  session_id: string
  request?: string
  response: string
  feedback?: unknown
  error_message?: string | null
  metadata?: Record<string, unknown>
}

interface RecommendationSection {
  id: string
  title: string
}

/**
 * Check if a tool_use block is a Spark recommendation
 * @param toolUse - The tool use content to check
 * @returns True if the tool use is a Spark recommendation
 */
export function isSparkRecommendation(toolUse: unknown): toolUse is ToolUseContent {
  return (
    typeof toolUse === 'object' &&
    toolUse !== null &&
    'name' in toolUse &&
    (toolUse as ToolUseContent).name === SPARK_TOOL_NAME
  )
}

/**
 * Parse a Spark recommendation from a tool_result content
 * @param toolResult - The tool result content containing the recommendation
 * @param toolUse - Optional tool use content for additional context
 * @returns Parsed Spark recommendation or null if parsing fails
 */
export function parseSparkRecommendation(
  toolResult: unknown,
  toolUse?: unknown
): SparkRecommendation | null {
  try {
    // Validate tool result structure
    if (
      !toolResult ||
      typeof toolResult !== 'object' ||
      !('content' in toolResult) ||
      !Array.isArray((toolResult as ToolResultContent).content)
    ) {
      console.warn('Invalid tool result structure for Spark recommendation')
      return null
    }

    const typedToolResult = toolResult as ToolResultContent

    // Find the text content that contains the JSON response
    const textContent = typedToolResult.content.find(
      (item): item is TextContent => item.type === 'text' && typeof item.text === 'string'
    )

    if (!textContent) {
      console.warn('No text content found in Spark tool result')
      return null
    }

    // Parse the JSON from the text content
    let data: unknown
    try {
      data = JSON.parse(textContent.text)
    } catch (parseError) {
      console.error('Failed to parse JSON from Spark recommendation:', parseError)
      return null
    }

    // Validate API response structure
    if (!isValidSparkApiResponse(data)) {
      console.warn('Invalid Spark API response structure')
      return null
    }

    // Extract query and context from tool_use if provided
    let query: string | undefined
    let context: string | string[] | undefined

    if (isValidToolUseContent(toolUse)) {
      query = toolUse.input?.request?.query
      context = toolUse.input?.request?.context
    }

    return {
      sessionId: data.session_id,
      request: data.request || '',
      response: data.response,
      feedback: data.feedback !== NONE_VALUE ? data.feedback : undefined,
      errorMessage: data.error_message ?? null,
      metadata: data.metadata || {},
      query,
      context,
    }
  } catch (error) {
    console.error('Unexpected error parsing Spark recommendation:', error)
    return null
  }
}

/**
 * Type guard to validate Spark API response structure
 * @param data - The data to validate
 * @returns True if data is a valid SparkApiResponse
 */
function isValidSparkApiResponse(data: unknown): data is SparkApiResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'session_id' in data &&
    typeof (data as SparkApiResponse).session_id === 'string' &&
    'response' in data &&
    typeof (data as SparkApiResponse).response === 'string'
  )
}

/**
 * Type guard to validate tool use content
 * @param toolUse - The tool use to validate
 * @returns True if toolUse is a valid ToolUseContent
 */
function isValidToolUseContent(toolUse: unknown): toolUse is ToolUseContent {
  return (
    typeof toolUse === 'object' &&
    toolUse !== null &&
    'type' in toolUse &&
    (toolUse as ToolUseContent).type === 'tool_use'
  )
}

/**
 * Extract all Spark session IDs from a conversation
 * @param messages - Array of conversation messages
 * @returns Array of unique session IDs found in the conversation
 */
export function extractSparkSessionIds(messages: unknown[]): string[] {
  const sessionIds: string[] = []

  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const message = messages[messageIndex]

    // Validate message structure
    if (
      !message ||
      typeof message !== 'object' ||
      !('content' in message) ||
      !Array.isArray((message as { content: unknown }).content)
    ) {
      continue
    }

    const messageContent = (message as { content: unknown[] }).content

    for (const content of messageContent) {
      // Check if this is a Spark tool use
      if (isSparkRecommendation(content)) {
        const toolUseContent = content as ToolUseContent

        // Look for the corresponding tool_result in the next message
        const nextMessage = messages[messageIndex + 1]
        if (
          nextMessage &&
          typeof nextMessage === 'object' &&
          'content' in nextMessage &&
          Array.isArray((nextMessage as { content: unknown }).content)
        ) {
          const nextMessageContent = (nextMessage as { content: unknown[] }).content
          const toolResult = nextMessageContent.find(
            (item): item is ToolResultContent =>
              typeof item === 'object' &&
              item !== null &&
              'type' in item &&
              item.type === 'tool_result' &&
              'tool_use_id' in item &&
              item.tool_use_id === toolUseContent.id
          )

          if (toolResult) {
            const recommendation = parseSparkRecommendation(toolResult, toolUseContent)
            if (recommendation && !sessionIds.includes(recommendation.sessionId)) {
              sessionIds.push(recommendation.sessionId)
            }
          }
        }
      }
    }
  }

  return sessionIds
}

/**
 * Format a Spark recommendation for display
 * @param recommendation - The recommendation to format
 * @returns Formatted markdown string
 */
export function formatSparkRecommendation(recommendation: SparkRecommendation): string {
  // The response is already in markdown format
  return recommendation.response
}

/**
 * Get sections from a Spark recommendation for feedback
 * @param recommendation - The recommendation to extract sections from
 * @returns Array of sections with id and title
 */
export function getRecommendationSections(
  recommendation: SparkRecommendation
): RecommendationSection[] {
  const sections: RecommendationSection[] = []

  // Validate input
  if (!recommendation.response || typeof recommendation.response !== 'string') {
    console.warn('Invalid recommendation response for section extraction')
    return sections
  }

  // Parse sections from the markdown response
  // Look for headers with {#section-id} format
  const sectionRegex = /^#+\s+(.+?)\s*{#([^}]+)}/gm
  let match: RegExpExecArray | null

  while ((match = sectionRegex.exec(recommendation.response)) !== null) {
    const title = match[1].trim()
    const id = match[2].trim()

    if (title && id) {
      sections.push({ id, title })
    }
  }

  return sections
}

/**
 * Extract source URLs from a Spark recommendation
 * @param recommendation - The recommendation to extract sources from
 * @returns Array of unique source URLs
 */
export function getRecommendationSources(recommendation: SparkRecommendation): string[] {
  // Validate input
  if (!recommendation.response || typeof recommendation.response !== 'string') {
    console.warn('Invalid recommendation response for source extraction')
    return []
  }

  const sources = new Set<string>()

  // Look for the sources table in the markdown
  const tableRegex = /\|\s*(https?:\/\/[^\s|]+)/g
  let match: RegExpExecArray | null

  while ((match = tableRegex.exec(recommendation.response)) !== null) {
    const url = match[1].trim()
    if (url) {
      sources.add(url)
    }
  }

  return Array.from(sources)
}
