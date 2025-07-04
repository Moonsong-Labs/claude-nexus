import { z } from 'zod'

// Define the Zod schema for runtime validation
export const ConversationAnalysisSchema = z.object({
  summary: z
    .string()
    .describe('A concise, neutral summary of the entire conversation (2-4 sentences).'),
  keyTopics: z.array(z.string()).describe('A list of the main subjects discussed (3-5 topics).'),
  sentiment: z
    .enum(['positive', 'neutral', 'negative', 'mixed'])
    .describe("The overall sentiment of the user's messages."),
  userIntent: z.string().describe('The primary goal or question the user was trying to address.'),
  outcomes: z
    .array(z.string())
    .describe('Key conclusions, resolutions, or final answers provided.'),
  actionItems: z
    .array(z.string())
    .describe('A list of clear, actionable tasks for the user or assistant.'),
  technicalDetails: z
    .object({
      frameworks: z.array(z.string()).describe('Technologies, frameworks, or libraries mentioned.'),
      issues: z.array(z.string()).describe('Technical problems or errors encountered.'),
      solutions: z.array(z.string()).describe('Proposed or implemented solutions.'),
    })
    .describe('Specific technical elements identified in the conversation.'),
  conversationQuality: z
    .object({
      clarity: z
        .enum(['high', 'medium', 'low'])
        .describe('How clear and well-structured the conversation was.'),
      completeness: z
        .enum(['complete', 'partial', 'incomplete'])
        .describe("Whether the user's goals were fully addressed."),
      effectiveness: z
        .enum(['highly effective', 'effective', 'needs improvement'])
        .describe('Overall effectiveness of the interaction.'),
    })
    .describe('Assessment of the conversation quality.'),
})

// Infer the TypeScript type from the Zod schema
export type ConversationAnalysis = z.infer<typeof ConversationAnalysisSchema>
