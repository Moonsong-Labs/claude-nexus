import {
  buildAnalysisPrompt,
  parseAnalysisResponse,
  type GeminiContent,
} from '@claude-nexus/shared/prompts/analysis/index.js'
import type { ConversationAnalysis } from '@claude-nexus/shared/types/ai-analysis'
import { logger } from '../../middleware/logger.js'

export interface GeminiApiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>
      role: string
    }
    finishReason: string
  }>
  usageMetadata: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
}

export class GeminiService {
  private apiKey: string
  private modelName: string
  private baseUrl: string

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || ''
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not set in environment variables')
    }

    this.modelName = process.env.GEMINI_MODEL_NAME || 'gemini-2.0-flash-exp'
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models'
  }

  async analyzeConversation(messages: Array<{ role: 'user' | 'model'; content: string }>): Promise<{
    content: string
    data: ConversationAnalysis
    rawResponse: GeminiApiResponse
    promptTokens: number
    completionTokens: number
  }> {
    const startTime = Date.now()

    try {
      const contents = buildAnalysisPrompt(messages)

      logger.debug(`Prepared prompt with ${contents.length} turns`, {
        metadata: { worker: 'analysis-worker' },
      })

      const response = await this.callGeminiApi(contents)

      const analysisText = response.candidates[0]?.content?.parts[0]?.text
      if (!analysisText) {
        throw new Error('No response content from Gemini API')
      }

      const parsedAnalysis = parseAnalysisResponse(analysisText)

      const markdownContent = this.formatAnalysisAsMarkdown(parsedAnalysis)

      logger.info(`Analysis completed in ${Date.now() - startTime}ms`, {
        metadata: {
          worker: 'analysis-worker',
          promptTokens: response.usageMetadata.promptTokenCount,
          completionTokens: response.usageMetadata.candidatesTokenCount,
        },
      })

      return {
        content: markdownContent,
        data: parsedAnalysis,
        rawResponse: response,
        promptTokens: response.usageMetadata.promptTokenCount,
        completionTokens: response.usageMetadata.candidatesTokenCount,
      }
    } catch (error) {
      logger.error('Gemini API error', { error, metadata: { worker: 'analysis-worker' } })
      throw error
    }
  }

  private async callGeminiApi(contents: GeminiContent[]): Promise<GeminiApiResponse> {
    const url = `${this.baseUrl}/${this.modelName}:generateContent`

    const requestBody = {
      contents,
      generationConfig: {
        temperature: 0.1,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
        responseMimeType: 'text/plain',
      },
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    return data as GeminiApiResponse
  }

  private formatAnalysisAsMarkdown(analysis: ConversationAnalysis): string {
    return `# Conversation Analysis

## Summary
${analysis.summary}

## Key Topics
${analysis.keyTopics.map((topic: string) => `- ${topic}`).join('\n')}

## Sentiment
**${analysis.sentiment}**

## User Intent
${analysis.userIntent}

## Outcomes
${analysis.outcomes.length > 0 ? analysis.outcomes.map((outcome: string) => `- ${outcome}`).join('\n') : 'No specific outcomes identified.'}

## Action Items
${analysis.actionItems.length > 0 ? analysis.actionItems.map((item: string) => `- [ ] ${item}`).join('\n') : 'No action items identified.'}

## Technical Details
### Frameworks & Technologies
${analysis.technicalDetails.frameworks.length > 0 ? analysis.technicalDetails.frameworks.map((fw: string) => `- ${fw}`).join('\n') : 'None mentioned.'}

### Issues Encountered
${analysis.technicalDetails.issues.length > 0 ? analysis.technicalDetails.issues.map((issue: string) => `- ${issue}`).join('\n') : 'No issues reported.'}

### Solutions Provided
${analysis.technicalDetails.solutions.length > 0 ? analysis.technicalDetails.solutions.map((solution: string) => `- ${solution}`).join('\n') : 'No solutions discussed.'}

## Conversation Quality
- **Clarity**: ${analysis.conversationQuality.clarity}
- **Completeness**: ${analysis.conversationQuality.completeness}
- **Effectiveness**: ${analysis.conversationQuality.effectiveness}
`
  }
}
