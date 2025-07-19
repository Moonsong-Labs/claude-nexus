import { z } from 'zod'
import { ConversationAnalysisSchema } from '../../types/ai-analysis.js'
import { ANALYSIS_PROMPT_CONFIG } from '../../config/ai-analysis.js'
import { truncateConversation, type Message } from '../truncation.js'
import { PROMPT_ASSETS, type AnalysisExample } from './prompt-assets.js'

// Define the structure for Gemini API content
export interface GeminiContent {
  role: 'user' | 'model'
  parts: Array<{ text: string }>
}

/**
 * Loads prompt assets for a given version
 */
function loadPromptAssets(version: string = 'v1') {
  // Use embedded prompt assets instead of filesystem
  if (version in PROMPT_ASSETS) {
    const versionAssets = PROMPT_ASSETS[version as keyof typeof PROMPT_ASSETS]
    return {
      systemPrompt: versionAssets.systemPrompt,
      examples: versionAssets.examples,
    }
  }

  throw new Error(
    `Unknown prompt version: ${version}. Available versions: ${Object.keys(PROMPT_ASSETS).join(', ')}`
  )
}

// Constants for enum values used in JSON schema
const SENTIMENT_VALUES = ['positive', 'neutral', 'negative', 'mixed'] as const
const ACTION_ITEM_TYPES = ['task', 'prompt_improvement', 'follow_up'] as const
const PRIORITY_LEVELS = ['high', 'medium', 'low'] as const
const PROMPTING_CATEGORIES = [
  'clarity',
  'context',
  'structure',
  'specificity',
  'efficiency',
] as const
const FOLLOW_UP_EFFECTIVENESS = ['excellent', 'good', 'needs_improvement'] as const
const TOOL_USAGE_EFFICIENCY = ['optimal', 'good', 'could_improve'] as const
const CONTEXT_WINDOW_MANAGEMENT = ['efficient', 'acceptable', 'wasteful'] as const
const CONVERSATION_CLARITY = ['high', 'medium', 'low'] as const
const CONVERSATION_COMPLETENESS = ['complete', 'partial', 'incomplete'] as const
const CONVERSATION_EFFECTIVENESS = ['highly effective', 'effective', 'needs improvement'] as const

/**
 * Generates a JSON schema string from the Zod schema for LLM consumption.
 *
 * We use manual schema generation instead of automated tools to maintain precise control
 * over the schema format, ensuring it's optimized for LLM understanding with clear
 * descriptions and structured examples.
 *
 * @returns JSON schema string formatted for inclusion in LLM prompts
 */
function generateJsonSchema(): string {
  const schema = {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: ConversationAnalysisSchema.shape.summary._def.description,
      },
      keyTopics: {
        type: 'array',
        items: { type: 'string' },
        description: ConversationAnalysisSchema.shape.keyTopics._def.description,
      },
      sentiment: {
        type: 'string',
        enum: [...SENTIMENT_VALUES],
        description: ConversationAnalysisSchema.shape.sentiment._def.description,
      },
      userIntent: {
        type: 'string',
        description: ConversationAnalysisSchema.shape.userIntent._def.description,
      },
      outcomes: {
        type: 'array',
        items: { type: 'string' },
        description: ConversationAnalysisSchema.shape.outcomes._def.description,
      },
      actionItems: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: [...ACTION_ITEM_TYPES] },
            description: { type: 'string' },
            priority: { type: 'string', enum: [...PRIORITY_LEVELS] },
          },
          required: ['type', 'description'],
        },
        description: ConversationAnalysisSchema.shape.actionItems._def.description,
      },
      promptingTips: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: [...PROMPTING_CATEGORIES],
            },
            issue: { type: 'string' },
            suggestion: { type: 'string' },
            example: { type: 'string' },
          },
          required: ['category', 'issue', 'suggestion'],
        },
        description: ConversationAnalysisSchema.shape.promptingTips._def.description,
      },
      interactionPatterns: {
        type: 'object',
        properties: {
          promptClarity: { type: 'number', minimum: 0, maximum: 10 },
          contextCompleteness: { type: 'number', minimum: 0, maximum: 10 },
          followUpEffectiveness: {
            type: 'string',
            enum: [...FOLLOW_UP_EFFECTIVENESS],
          },
          commonIssues: { type: 'array', items: { type: 'string' } },
          strengths: { type: 'array', items: { type: 'string' } },
        },
        description: ConversationAnalysisSchema.shape.interactionPatterns._def.description,
      },
      technicalDetails: {
        type: 'object',
        properties: {
          frameworks: { type: 'array', items: { type: 'string' } },
          issues: { type: 'array', items: { type: 'string' } },
          solutions: { type: 'array', items: { type: 'string' } },
          toolUsageEfficiency: { type: 'string', enum: [...TOOL_USAGE_EFFICIENCY] },
          contextWindowManagement: {
            type: 'string',
            enum: [...CONTEXT_WINDOW_MANAGEMENT],
          },
        },
        description: ConversationAnalysisSchema.shape.technicalDetails._def.description,
      },
      conversationQuality: {
        type: 'object',
        properties: {
          clarity: { type: 'string', enum: [...CONVERSATION_CLARITY] },
          clarityImprovement: { type: 'string' },
          completeness: { type: 'string', enum: [...CONVERSATION_COMPLETENESS] },
          completenessImprovement: { type: 'string' },
          effectiveness: {
            type: 'string',
            enum: [...CONVERSATION_EFFECTIVENESS],
          },
          effectivenessImprovement: { type: 'string' },
        },
        description: ConversationAnalysisSchema.shape.conversationQuality._def.description,
      },
    },
    required: [
      'summary',
      'keyTopics',
      'sentiment',
      'userIntent',
      'outcomes',
      'actionItems',
      'promptingTips',
      'interactionPatterns',
      'technicalDetails',
      'conversationQuality',
    ],
  }

  return JSON.stringify(schema, null, 2)
}

/**
 * Formats examples for inclusion in the prompt
 * @param examples Array of analysis examples to format
 * @returns Formatted string of examples for LLM consumption
 */
function formatExamples(examples: AnalysisExample[]): string {
  return examples
    .map((example, i) => {
      return `### Example ${i + 1}\n\nFor this conversation:\n${JSON.stringify(example.transcript, null, 2)}\n\nThe analysis would be:\n${JSON.stringify(example.expectedOutput, null, 2)}`
    })
    .join('\n\n')
}

/**
 * Builds the analysis prompt using the multi-turn format recommended by Gemini
 *
 * @param messages - The conversation messages to analyze
 * @param config - Optional configuration override
 * @param customPrompt - Optional custom prompt to override the default
 * @returns Array of Gemini content objects ready for API submission
 */
export function buildAnalysisPrompt(
  messages: Message[],
  config = ANALYSIS_PROMPT_CONFIG,
  customPrompt?: string
): GeminiContent[] {
  // 1. Truncate the conversation if needed
  const truncatedMessages = truncateConversation(messages)

  // 2. Use custom prompt if provided, otherwise load default
  let finalInstruction: string

  if (customPrompt) {
    // Use the custom prompt directly
    finalInstruction = customPrompt
  } else {
    // Load prompt assets and build default prompt
    const { systemPrompt, examples } = loadPromptAssets(config.PROMPT_VERSION)

    // Generate schema and format examples
    const jsonSchema = generateJsonSchema()
    const formattedExamples = formatExamples(examples)

    // Build the final instruction by replacing placeholders
    finalInstruction = systemPrompt
      .replace('{{JSON_SCHEMA}}', jsonSchema)
      .replace('{{EXAMPLES}}', formattedExamples)
  }

  // 5. Build the multi-turn content array
  const contents: GeminiContent[] = [
    // First, include the conversation as native messages
    ...truncatedMessages.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }],
    })),
    // Then add the analysis instruction as a final user message
    {
      role: 'user' as const,
      parts: [
        {
          text: `Based on the preceding conversation, provide a complete analysis.\n\n${finalInstruction}`,
        },
      ],
    },
  ]

  return contents
}

// Define the response schema that includes the analysis wrapper
export const ConversationAnalysisResponseSchema = z.object({
  analysis: ConversationAnalysisSchema,
})

/**
 * Validates and parses the LLM's response
 *
 * @param response - The raw response from the LLM
 * @returns Parsed and validated ConversationAnalysis object
 * @throws Error with detailed validation information if parsing fails
 */
export function parseAnalysisResponse(
  response: string
): z.infer<typeof ConversationAnalysisSchema> {
  try {
    // Extract JSON from code block if present
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
    const jsonString = jsonMatch ? jsonMatch[1] : response.trim()

    // Parse JSON
    const parsed = JSON.parse(jsonString)

    // Validate with Zod (expecting the analysis wrapper)
    const validated = ConversationAnalysisResponseSchema.parse(parsed)

    // Return the analysis object
    return validated.analysis
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Provide detailed error information for debugging
      const details = error.errors
        .map(e => {
          const path = e.path.join('.')
          const field = path || 'root'
          return `Field '${field}': ${e.message}`
        })
        .join('; ')

      throw new Error(`Invalid analysis response format - ${details}`)
    } else if (error instanceof SyntaxError) {
      // Include the problematic JSON snippet for debugging
      const preview = response.length > 100 ? response.substring(0, 100) + '...' : response
      throw new Error(
        `Failed to parse analysis response as JSON: ${error.message}. Response preview: ${preview}`
      )
    }
    throw error
  }
}

/**
 * Gets the analysis prompt template with placeholders
 * This is used to display the prompt in the UI
 */
export function getAnalysisPromptTemplate(config = ANALYSIS_PROMPT_CONFIG): string {
  // Load prompt assets
  const { systemPrompt, examples } = loadPromptAssets(config.PROMPT_VERSION)

  // Generate schema and format examples
  const jsonSchema = generateJsonSchema()
  const formattedExamples = formatExamples(examples)

  // Build the final instruction by replacing placeholders
  const finalInstruction = systemPrompt
    .replace('{{JSON_SCHEMA}}', jsonSchema)
    .replace('{{EXAMPLES}}', formattedExamples)

  return finalInstruction
}
