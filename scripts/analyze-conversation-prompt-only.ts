#!/usr/bin/env bun
/**
 * Generate conversation efficiency analysis prompt without sending to AI
 *
 * Usage: bun run scripts/analyze-conversation-prompt-only.ts <conversation-id>
 */

import { Pool } from 'pg'
import { config } from 'dotenv'
import { ClaudeMessage, ClaudeContent } from '@claude-nexus/shared'

config()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

interface ConversationRequest {
  request_id: string
  timestamp: string
  body: any
  response_body: any
  duration_ms: number
  total_tokens: number
  is_subtask: boolean
  parent_task_request_id?: string
}

/**
 * Compact tool content to essential information
 */
function compactToolContent(content: ClaudeContent): string {
  if (content.type === 'tool_use') {
    const inputStr = content.input ? JSON.stringify(content.input).slice(0, 100) : ''
    return `[TOOL_USE: ${content.name} (${inputStr}...)]`
  } else if (content.type === 'tool_result') {
    const resultStr = content.content ? JSON.stringify(content.content).slice(0, 100) : ''
    return `[TOOL_RESULT: ${content.tool_use_id} (${resultStr}...)]`
  }
  return ''
}

/**
 * Compact a message to essential text representation
 */
function compactMessage(message: ClaudeMessage): string {
  const role = message.role.toUpperCase()

  if (typeof message.content === 'string') {
    return `${role}: ${message.content}`
  }

  // Handle array content
  const textParts: string[] = []

  for (const content of message.content) {
    if (content.type === 'text' && content.text) {
      // Skip system reminders
      if (content.text.startsWith('<system-reminder>')) {
        continue
      }
      textParts.push(content.text)
    } else if (content.type === 'tool_use' || content.type === 'tool_result') {
      textParts.push(compactToolContent(content))
    } else if (content.type === 'image') {
      textParts.push('[IMAGE]')
    }
  }

  return textParts.length > 0 ? `${role}: ${textParts.join(' ')}` : ''
}

/**
 * Extract command usage from messages
 */
function extractCommands(messages: ClaudeMessage[]): Set<string> {
  const commands = new Set<string>()

  for (const message of messages) {
    if (Array.isArray(message.content)) {
      for (const content of message.content) {
        if (content.type === 'tool_use' && content.name) {
          commands.add(content.name)
        }
      }
    }
  }

  return commands
}

/**
 * Generate analysis prompt for Gemini
 */
function generateAnalysisPrompt(conversationData: {
  messages: ClaudeMessage[]
  compactedText: string
  metadata: {
    totalRequests: number
    totalTokens: number
    totalDuration: number
    commands: string[]
    hasSubtasks: boolean
  }
}): string {
  return `You are an AI conversation efficiency expert. Analyze this conversation between a user and an AI coding assistant to identify opportunities for improvement.

CONVERSATION METADATA:
- Total Requests: ${conversationData.metadata.totalRequests}
- Total Tokens Used: ${conversationData.metadata.totalTokens}
- Total Duration: ${(conversationData.metadata.totalDuration / 1000).toFixed(2)} seconds
- Commands Used: ${conversationData.metadata.commands.join(', ')}
- Has Subtasks: ${conversationData.metadata.hasSubtasks}

COMPACTED CONVERSATION:
${conversationData.compactedText}

ANALYSIS TASKS:
1. **Command Efficiency**: Analyze if the right tools/commands were used at the right time. Suggest better command sequences or alternatives.

2. **Prompt Quality**: Evaluate the user's prompts. Were they clear, specific, and well-structured? Suggest improvements.

3. **Task Decomposition**: Did the conversation flow efficiently? Could complex tasks have been broken down better?

4. **Agent Performance**: Identify any inefficiencies in the AI's approach (e.g., unnecessary steps, missed opportunities, redundant actions).

5. **Optimization Opportunities**: 
   - What commands could have been used but weren't?
   - How could the conversation have been shortened?
   - What patterns indicate inefficiency?

6. **Best Practices**: Based on this conversation, what general best practices would you recommend for:
   - Writing better prompts
   - Using commands more effectively
   - Structuring complex tasks

Please provide specific, actionable recommendations with examples from the conversation.`
}

/**
 * Fetch conversation from database
 */
async function fetchConversation(conversationId: string): Promise<ConversationRequest[]> {
  const query = `
    SELECT 
      request_id, timestamp, body, response_body, 
      duration_ms, total_tokens, is_subtask, parent_task_request_id
    FROM api_requests 
    WHERE conversation_id = $1
    ORDER BY timestamp ASC
  `

  const result = await pool.query(query, [conversationId])
  return result.rows
}

/**
 * Process conversation into analyzable format
 */
function processConversation(requests: ConversationRequest[]) {
  const allMessages: ClaudeMessage[] = []
  let totalTokens = 0
  let totalDuration = 0
  const commands = new Set<string>()
  let hasSubtasks = false

  for (const request of requests) {
    // Add request messages
    if (request.body?.messages) {
      for (const msg of request.body.messages) {
        allMessages.push(msg)

        // Extract commands
        if (Array.isArray(msg.content)) {
          for (const content of msg.content) {
            if (content.type === 'tool_use' && content.name) {
              commands.add(content.name)
            }
          }
        }
      }
    }

    // Add response message
    if (request.response_body?.content) {
      const assistantMsg: ClaudeMessage = {
        role: 'assistant',
        content: request.response_body.content,
      }
      allMessages.push(assistantMsg)

      // Extract commands from response
      if (Array.isArray(request.response_body.content)) {
        for (const content of request.response_body.content) {
          if (content.type === 'tool_use' && content.name) {
            commands.add(content.name)
          }
        }
      }
    }

    totalTokens += request.total_tokens || 0
    totalDuration += request.duration_ms || 0

    if (request.is_subtask || request.parent_task_request_id) {
      hasSubtasks = true
    }
  }

  // Compact messages
  const compactedLines: string[] = []
  for (const message of allMessages) {
    const compacted = compactMessage(message)
    if (compacted) {
      compactedLines.push(compacted)
    }
  }

  return {
    messages: allMessages,
    compactedText: compactedLines.join('\n\n'),
    metadata: {
      totalRequests: requests.length,
      totalTokens,
      totalDuration,
      commands: Array.from(commands),
      hasSubtasks,
    },
  }
}

async function main() {
  const conversationId = process.argv[2]

  if (!conversationId) {
    console.error('Usage: bun run scripts/analyze-conversation-prompt-only.ts <conversation-id>')
    process.exit(1)
  }

  try {
    console.log(`Fetching conversation ${conversationId}...`)
    const requests = await fetchConversation(conversationId)

    if (requests.length === 0) {
      console.error('No requests found for this conversation ID')
      process.exit(1)
    }

    console.log(`Found ${requests.length} requests in conversation`)

    // Process conversation
    const conversationData = processConversation(requests)
    console.log(`Processed ${conversationData.messages.length} messages`)
    console.log(`Commands used: ${conversationData.metadata.commands.join(', ')}`)
    console.log(`Total tokens: ${conversationData.metadata.totalTokens}`)
    console.log(`Duration: ${(conversationData.metadata.totalDuration / 1000).toFixed(2)} seconds`)

    // Generate analysis prompt
    const analysisPrompt = generateAnalysisPrompt(conversationData)

    // Print stats
    console.log('\n=== PROMPT STATISTICS ===')
    console.log(`Prompt length: ${analysisPrompt.length} characters`)
    console.log(`Estimated tokens: ~${Math.ceil(analysisPrompt.length / 4)} tokens`)
    console.log(`Conversation compacted from ${conversationData.messages.length} messages`)

    // Save prompt to file
    const filename = `analysis-prompt-${conversationId}-${Date.now()}.txt`
    await Bun.write(filename, analysisPrompt)
    console.log(`\nPrompt saved to: ${filename}`)

    // Also save conversation data
    const dataFilename = `analysis-data-${conversationId}-${Date.now()}.json`
    await Bun.write(dataFilename, JSON.stringify(conversationData, null, 2))
    console.log(`Conversation data saved to: ${dataFilename}`)
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
