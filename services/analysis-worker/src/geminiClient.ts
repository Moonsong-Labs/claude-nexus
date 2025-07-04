import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai'
import {
  config,
  type GeminiAnalysisResult,
  type GeminiUsage,
  type ApiRequestRow,
  type Message,
} from '@claude-nexus/shared'
import pLimit from 'p-limit'

/**
 * Client for interacting with the Gemini API
 */
export class GeminiClient {
  private genAI: GoogleGenerativeAI
  private model: GenerativeModel
  private rateLimiter: ReturnType<typeof pLimit>

  constructor() {
    if (!config.gemini.apiKey) {
      throw new Error('GEMINI_API_KEY is required')
    }

    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey)
    this.model = this.genAI.getGenerativeModel({
      model: config.gemini.model,
    })

    // Configure rate limiting based on requests per minute
    const requestsPerMinute = config.analysisWorker.rateLimit
    const requestsPerSecond = Math.ceil(requestsPerMinute / 60)
    this.rateLimiter = pLimit(requestsPerSecond)
  }

  /**
   * Analyze a conversation using Gemini
   */
  async analyzeConversation(
    messages: ApiRequestRow[],
    truncateAfter = 50
  ): Promise<{ analysis: GeminiAnalysisResult; usage: GeminiUsage }> {
    // Prepare the prompt
    const prompt = this.preparePrompt(messages, truncateAfter)

    try {
      // Call Gemini API with rate limiting
      const result = await this.rateLimiter(async () =>
        this.model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          },
        })
      )

      const response = await result.response
      const text = response.text()

      // Parse the response
      const analysis = this.parseAnalysisResult(text)

      // Extract token usage
      const usage = await this.extractUsage(result)

      return { analysis, usage }
    } catch (error) {
      console.error('Gemini API error:', error)
      throw new Error(
        `Failed to analyze conversation: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Prepare the analysis prompt
   */
  private preparePrompt(messages: ApiRequestRow[], truncateAfter: number): string {
    // Sort messages by timestamp
    const sortedMessages = [...messages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    // Truncate if necessary
    const messagesToAnalyze = sortedMessages.slice(-truncateAfter)

    // Format messages for analysis
    const formattedMessages = messagesToAnalyze
      .map(msg => {
        const request = msg.body
        const response = msg.response_body

        let content = ''

        // Extract user message
        if (request?.messages) {
          const lastMessage = request.messages[request.messages.length - 1]
          if (lastMessage?.role === 'user') {
            content += `User: ${this.extractMessageContent(lastMessage)}\n`
          }
        }

        // Extract assistant response
        if (response?.content) {
          content += `Assistant: ${this.extractMessageContent(response)}\n`
        }

        return content
      })
      .join('\n---\n\n')

    // Build the analysis prompt
    return `You are an AI conversation analyst. Analyze the following conversation between a user and an AI assistant.

Provide a comprehensive analysis including:
1. A brief summary of the conversation
2. The overall sentiment (positive, negative, neutral, or mixed)
3. Key topics discussed
4. Any action items or follow-ups mentioned
5. Insights about the conversation flow and effectiveness

Format your response as a JSON object with the following structure:
{
  "summary": "Brief summary of the conversation",
  "sentiment": "positive|negative|neutral|mixed",
  "key_topics": ["topic1", "topic2", ...],
  "action_items": ["action1", "action2", ...],
  "insights": ["insight1", "insight2", ...]
}

Conversation to analyze:

${formattedMessages}

Provide only the JSON response, no additional text.`
  }

  /**
   * Extract message content from various formats
   */
  private extractMessageContent(message: Message): string {
    if (typeof message.content === 'string') {
      return message.content
    }

    if (Array.isArray(message.content)) {
      return message.content
        .map(block => {
          if (block.type === 'text') {
            return block.text
          }
          if (block.type === 'tool_use') {
            return `[Tool: ${block.name}]`
          }
          if (block.type === 'tool_result') {
            return `[Tool Result]`
          }
          return '[Unknown Content]'
        })
        .join(' ')
    }

    return '[Unable to extract content]'
  }

  /**
   * Parse the analysis result from Gemini's response
   */
  private parseAnalysisResult(text: string): GeminiAnalysisResult {
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in response')
      }

      const parsed = JSON.parse(jsonMatch[0])

      // Validate and normalize the result
      return {
        summary: parsed.summary || 'No summary available',
        sentiment: this.normalizeSentiment(parsed.sentiment),
        key_topics: Array.isArray(parsed.key_topics) ? parsed.key_topics : [],
        action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
        insights: Array.isArray(parsed.insights) ? parsed.insights : [],
        metadata: {
          analyzed_at: new Date().toISOString(),
          model: config.gemini.model,
        },
      }
    } catch (error) {
      console.error('Failed to parse Gemini response:', error)
      console.error('Raw response:', text)

      // Return a fallback result
      return {
        summary: 'Failed to analyze conversation',
        sentiment: 'neutral',
        key_topics: [],
        action_items: [],
        insights: [],
        metadata: {
          analyzed_at: new Date().toISOString(),
          model: config.gemini.model,
          error: 'Failed to parse response',
        },
      }
    }
  }

  /**
   * Normalize sentiment value
   */
  private normalizeSentiment(sentiment: unknown): 'positive' | 'negative' | 'neutral' | 'mixed' {
    const normalized = String(sentiment).toLowerCase()
    if (['positive', 'negative', 'neutral', 'mixed'].includes(normalized)) {
      return normalized as 'positive' | 'negative' | 'neutral' | 'mixed'
    }
    return 'neutral'
  }

  /**
   * Extract token usage from the Gemini result
   */
  private async extractUsage(result: unknown): Promise<GeminiUsage> {
    // Gemini API may provide usage information differently
    // This is a placeholder implementation
    try {
      const res = result as {
        response?: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }
      }
      const promptTokens = res.response?.usageMetadata?.promptTokenCount || 0
      const completionTokens = res.response?.usageMetadata?.candidatesTokenCount || 0

      return {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      }
    } catch {
      // Fallback if usage data is not available
      return {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      }
    }
  }
}
