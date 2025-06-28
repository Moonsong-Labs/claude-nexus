/**
 * Utilities for detecting and parsing Spark tool recommendations
 */

export interface SparkRecommendation {
  sessionId: string
  request: string
  response: string
  feedback?: any
  errorMessage?: string | null
  metadata?: Record<string, any>
}

/**
 * Check if a tool_use block is a Spark recommendation
 */
export function isSparkRecommendation(toolUse: any): boolean {
  return toolUse?.name === 'mcp__spark__get_recommendation'
}

/**
 * Parse a Spark recommendation from a tool_result content
 */
export function parseSparkRecommendation(toolResult: any): SparkRecommendation | null {
  try {
    // Tool result content is usually an array with text blocks
    if (!toolResult?.content || !Array.isArray(toolResult.content)) {
      return null
    }

    // Find the text content that contains the JSON response
    const textContent = toolResult.content.find((item: any) => item.type === 'text' && item.text)

    if (!textContent) {
      return null
    }

    // Parse the JSON from the text content
    const data = JSON.parse(textContent.text)

    // Validate required fields
    if (!data.session_id || !data.response) {
      return null
    }

    return {
      sessionId: data.session_id,
      request: data.request || '',
      response: data.response,
      feedback: data.feedback !== 'None' ? data.feedback : undefined,
      errorMessage: data.error_message,
      metadata: data.metadata || {},
    }
  } catch (error) {
    console.error('Failed to parse Spark recommendation:', error)
    return null
  }
}

/**
 * Extract all Spark session IDs from a conversation
 */
export function extractSparkSessionIds(messages: any[]): string[] {
  const sessionIds: string[] = []

  for (const message of messages) {
    if (!message.content || !Array.isArray(message.content)) {
      continue
    }

    for (let i = 0; i < message.content.length; i++) {
      const content = message.content[i]

      // Check if this is a Spark tool use
      if (content.type === 'tool_use' && isSparkRecommendation(content)) {
        // Look for the corresponding tool_result in the next message
        const nextMessage = messages[messages.indexOf(message) + 1]
        if (nextMessage?.content && Array.isArray(nextMessage.content)) {
          const toolResult = nextMessage.content.find(
            (item: any) => item.type === 'tool_result' && item.tool_use_id === content.id
          )

          if (toolResult) {
            const recommendation = parseSparkRecommendation(toolResult)
            if (recommendation) {
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
 */
export function formatSparkRecommendation(recommendation: SparkRecommendation): string {
  // The response is already in markdown format
  return recommendation.response
}

/**
 * Get sections from a Spark recommendation for feedback
 */
export function getRecommendationSections(
  recommendation: SparkRecommendation
): Array<{ id: string; title: string }> {
  const sections: Array<{ id: string; title: string }> = []

  // Parse sections from the markdown response
  // Look for headers with {#section-id} format
  const sectionRegex = /^#+\s+(.+?)\s*{#([^}]+)}/gm
  let match

  while ((match = sectionRegex.exec(recommendation.response)) !== null) {
    sections.push({
      id: match[2],
      title: match[1].trim(),
    })
  }

  return sections
}

/**
 * Extract source URLs from a Spark recommendation
 */
export function getRecommendationSources(recommendation: SparkRecommendation): string[] {
  const sources: string[] = []

  // Look for the sources table in the markdown
  const tableRegex = /\|\s*https?:\/\/[^\s|]+/g
  const matches = recommendation.response.match(tableRegex)

  if (matches) {
    for (const match of matches) {
      const url = match.replace(/\|\s*/, '').trim()
      if (!sources.includes(url)) {
        sources.push(url)
      }
    }
  }

  return sources
}
