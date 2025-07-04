import { Pool } from 'pg'
import tiktoken from 'tiktoken'
import {
  ConversationAnalysisRequest,
  ConversationAnalysisResponse,
  ConversationMessage,
  TruncationStrategy,
  AnalysisError,
  stripSystemReminder,
} from '@claude-nexus/shared'
import { logger } from '../middleware/logger.js'
import { CONVERSATION_ANALYSIS_PROMPT } from '../prompts/analysis-prompt.js'

const DEFAULT_TRUNCATION_STRATEGY: TruncationStrategy = {
  maxTokens: 900000,
  preserveFirst: 5,
  preserveLast: 20,
  placeholderText: '\n\n[... truncated middle portion of conversation ...]\n\n',
}

export class ConversationAnalyzer {
  private pool: Pool
  private tokenEncoder: any

  constructor(pool: Pool) {
    this.pool = pool
    // Use cl100k_base encoding which Claude uses
    this.tokenEncoder = tiktoken.encoding_for_model('gpt-4')
  }

  /**
   * Analyze a conversation and return structured insights
   */
  async analyzeConversation(
    request: ConversationAnalysisRequest
  ): Promise<ConversationAnalysisResponse> {
    try {
      // Check cache first
      const cached = await this.getCachedAnalysis(request.conversationId)
      if (cached) {
        logger.info('Returning cached conversation analysis', {
          metadata: {
            conversationId: request.conversationId,
          },
        })
        return cached
      }

      // Extract messages from database
      const messages = await this.extractConversationMessages(
        request.conversationId,
        request.includeBranches
      )

      if (messages.length === 0) {
        throw {
          type: 'conversation_not_found',
          message: 'No messages found for this conversation',
        } as AnalysisError
      }

      // Apply truncation if needed
      const truncatedMessages = await this.applyTruncation(
        messages,
        request.maxTokens || DEFAULT_TRUNCATION_STRATEGY.maxTokens
      )

      // Build the analysis prompt
      const prompt = this.buildAnalysisPrompt(truncatedMessages.messages)

      // Call Claude API
      const analysis = await this.callClaudeAPI(prompt)

      // Prepare response
      const response: ConversationAnalysisResponse = {
        ...analysis,
        metadata: {
          messageCount: messages.length,
          truncated: truncatedMessages.truncated,
          analyzedAt: new Date().toISOString(),
          tokenCount: truncatedMessages.tokenCount,
          modelUsed: 'claude-3-haiku-20240307',
        },
      }

      // Cache the result
      await this.cacheAnalysis(request.conversationId, response)

      return response
    } catch (error: any) {
      logger.error('Failed to analyze conversation', {
        metadata: {
          conversationId: request.conversationId,
          error: error.message || error,
        },
      })
      throw error
    }
  }

  /**
   * Extract conversation messages from the database
   */
  private async extractConversationMessages(
    conversationId: string,
    includeBranches: boolean = true
  ): Promise<ConversationMessage[]> {
    const query = `
      SELECT 
        ar.request_id,
        ar.body,
        ar.response_body,
        ar.created_at,
        ar.branch_id,
        ar.message_count
      FROM api_requests ar
      WHERE ar.conversation_id = $1
        AND ar.request_type = 'inference'
        ${!includeBranches ? "AND (ar.branch_id = 'main' OR ar.branch_id IS NULL)" : ''}
      ORDER BY ar.created_at ASC
    `

    const result = await this.pool.query(query, [conversationId])
    const messages: ConversationMessage[] = []
    let messageNumber = 0

    for (const row of result.rows) {
      try {
        // Extract messages from request body
        if (row.body?.messages && Array.isArray(row.body.messages)) {
          for (const msg of row.body.messages) {
            messageNumber++
            const content = this.extractMessageContent(msg)
            if (content) {
              messages.push({
                role: msg.role,
                content: content,
                timestamp: row.created_at,
                messageNumber,
              })
            }
          }
        }

        // Extract assistant response
        if (row.response_body?.content) {
          messageNumber++
          const content = this.extractMessageContent({
            role: 'assistant',
            content: row.response_body.content,
          })
          if (content) {
            messages.push({
              role: 'assistant',
              content: content,
              timestamp: row.created_at,
              messageNumber,
            })
          }
        }
      } catch (err) {
        logger.warn('Failed to parse message from request', {
          metadata: {
            requestId: row.request_id,
            error: err,
          },
        })
      }
    }

    return messages
  }

  /**
   * Extract clean content from a message
   */
  private extractMessageContent(msg: any): string {
    if (!msg || !msg.content) {
      return ''
    }

    if (typeof msg.content === 'string') {
      return stripSystemReminder(msg.content).trim()
    }

    if (Array.isArray(msg.content)) {
      const parts: string[] = []
      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          const cleaned = stripSystemReminder(block.text).trim()
          if (cleaned) {
            parts.push(cleaned)
          }
        } else if (block.type === 'tool_use' && block.name) {
          parts.push(`[Tool Use: ${block.name}]`)
        } else if (block.type === 'tool_result') {
          parts.push('[Tool Result]')
        }
      }
      return parts.join('\n\n')
    }

    return ''
  }

  /**
   * Apply smart truncation to messages if they exceed token limit
   */
  private async applyTruncation(
    messages: ConversationMessage[],
    maxTokens: number
  ): Promise<{ messages: ConversationMessage[]; truncated: boolean; tokenCount: number }> {
    // Count total tokens
    const messagesText = messages.map(m => `${m.role}: ${m.content}`).join('\n\n')
    const tokenCount = this.tokenEncoder.encode(messagesText).length

    if (tokenCount <= maxTokens) {
      return { messages, truncated: false, tokenCount }
    }

    // Apply truncation strategy
    const strategy = DEFAULT_TRUNCATION_STRATEGY
    const firstMessages = messages.slice(0, strategy.preserveFirst)
    const lastMessages = messages.slice(-strategy.preserveLast)

    // Create placeholder message
    const placeholderMessage: ConversationMessage = {
      role: 'system',
      content: strategy.placeholderText,
      timestamp: new Date().toISOString(),
    }

    const truncatedMessages = [...firstMessages, placeholderMessage, ...lastMessages]
    const truncatedText = truncatedMessages.map(m => `${m.role}: ${m.content}`).join('\n\n')
    const truncatedTokenCount = this.tokenEncoder.encode(truncatedText).length

    return {
      messages: truncatedMessages,
      truncated: true,
      tokenCount: truncatedTokenCount,
    }
  }

  /**
   * Build the analysis prompt with messages
   */
  private buildAnalysisPrompt(messages: ConversationMessage[]): string {
    const formattedMessages = messages
      .map((m, i) => {
        const prefix = `[Message ${i + 1} - ${m.role}]:`
        return `${prefix}\n${m.content}`
      })
      .join('\n\n---\n\n')

    return CONVERSATION_ANALYSIS_PROMPT.replace('{messages}', formattedMessages)
  }

  /**
   * Call Claude API for analysis
   */
  private async callClaudeAPI(prompt: string): Promise<any> {
    // Get proxy base URL from environment
    const proxyUrl = process.env.PROXY_BASE_URL || 'http://localhost:3000'

    // Use dashboard credentials for API call if available
    // Otherwise, fall back to localhost credentials
    const dashboardDomain = process.env.DASHBOARD_DOMAIN || 'localhost'
    const dashboardApiKey = process.env.DASHBOARD_API_KEY || process.env.PROXY_API_KEY || ''

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Only add auth header if we have a key
    if (dashboardApiKey) {
      headers['Authorization'] = `Bearer ${dashboardApiKey}`
    }

    // Only add Host header if not localhost
    if (dashboardDomain !== 'localhost') {
      headers['Host'] = dashboardDomain
    }

    const response = await fetch(`${proxyUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 2000,
        temperature: 0.1, // Low temperature for consistent analysis
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw {
        type: 'analysis_failed',
        message: `Claude API error: ${response.status}`,
        details: error,
      } as AnalysisError
    }

    const result = (await response.json()) as any
    const content =
      typeof result.content === 'string'
        ? result.content
        : result.content[0]?.type === 'text'
          ? result.content[0].text
          : ''

    // Parse JSON response
    try {
      // Remove any markdown code blocks if present
      const cleanContent = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
      const analysis = JSON.parse(cleanContent)

      // Validate the structure
      if (!this.validateAnalysisResponse(analysis)) {
        throw new Error('Invalid analysis response structure')
      }

      return analysis
    } catch (parseError) {
      logger.error('Failed to parse Claude response as JSON', {
        metadata: {
          response: content,
          error: parseError,
        },
      })
      throw {
        type: 'invalid_response',
        message: 'Claude returned invalid JSON',
        details: content,
      } as AnalysisError
    }
  }

  /**
   * Validate the analysis response structure
   */
  private validateAnalysisResponse(analysis: any): boolean {
    // Check required fields
    if (
      typeof analysis.summary !== 'string' ||
      !Array.isArray(analysis.keyTopics) ||
      typeof analysis.userIntent !== 'string' ||
      !Array.isArray(analysis.outcomes) ||
      !Array.isArray(analysis.actionItems)
    ) {
      return false
    }

    // Check sentiment
    if (!['positive', 'neutral', 'negative', 'mixed'].includes(analysis.sentiment)) {
      return false
    }

    // Optional fields validation
    if (analysis.technicalDetails) {
      if (
        (analysis.technicalDetails.language !== null &&
          typeof analysis.technicalDetails.language !== 'string') ||
        !Array.isArray(analysis.technicalDetails.frameworks) ||
        !Array.isArray(analysis.technicalDetails.errors)
      ) {
        return false
      }
    }

    if (analysis.conversationQuality) {
      if (
        typeof analysis.conversationQuality.clarity !== 'number' ||
        typeof analysis.conversationQuality.completeness !== 'number' ||
        typeof analysis.conversationQuality.resolution !== 'boolean'
      ) {
        return false
      }
    }

    return true
  }

  /**
   * Get cached analysis if exists
   */
  private async getCachedAnalysis(
    conversationId: string
  ): Promise<ConversationAnalysisResponse | null> {
    const query = `
      SELECT analysis_result, created_at, model_used, input_tokens, output_tokens
      FROM conversation_analyses
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `

    const result = await this.pool.query(query, [conversationId])
    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      ...row.analysis_result,
      metadata: {
        ...row.analysis_result.metadata,
        modelUsed: row.model_used,
      },
    }
  }

  /**
   * Cache analysis result
   */
  private async cacheAnalysis(
    conversationId: string,
    analysis: ConversationAnalysisResponse
  ): Promise<void> {
    const query = `
      INSERT INTO conversation_analyses (conversation_id, analysis_result, model_used, input_tokens, output_tokens)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (conversation_id) 
      DO UPDATE SET 
        analysis_result = EXCLUDED.analysis_result,
        model_used = EXCLUDED.model_used,
        input_tokens = EXCLUDED.input_tokens,
        output_tokens = EXCLUDED.output_tokens,
        created_at = CURRENT_TIMESTAMP
    `

    await this.pool.query(query, [
      conversationId,
      JSON.stringify(analysis),
      analysis.metadata.modelUsed,
      0, // We don't track input tokens separately yet
      0, // We don't track output tokens separately yet
    ])
  }
}
