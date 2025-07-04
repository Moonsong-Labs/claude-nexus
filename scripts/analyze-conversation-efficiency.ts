#!/usr/bin/env bun
/**
 * Analyze conversation efficiency by compacting messages and sending to AI for analysis
 *
 * Usage: bun run scripts/analyze-conversation-efficiency.ts <conversation-id> [model]
 * Models: gemini (default), gemini-pro, o3
 */

import { Pool } from 'pg'
import { config } from 'dotenv'
import { ClaudeMessage, ClaudeContent } from '@claude-nexus/shared'
import { GoogleGenerativeAI } from '@google/generative-ai'

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
  system: ClaudeMessage[]
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

SYSTEM USED:
${JSON.stringify(conversationData.system)}
CONVERSATION:
${JSON.stringify(conversationData.messages)}}

ANALYSIS TASKS (Keep each answer concise and short):
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

Please provide specific, actionable recommendations with examples from the conversation.

In addition, provide a brief summary of the conversation goal, in 1 SINGLE SENTENCE ONLY`
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
    WHERE conversation_id = $1 and timestamp = (select max(timestamp) from api_requests where conversation_id = $1)
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
  let system = []

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
    system = request.body?.system || []

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
    system: system,
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

/**
 * Send analysis to Gemini
 */
async function analyzeWithGemini(
  prompt: string,
  modelName: string = 'gemini-2.0-flash-exp'
): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY environment variable is required')
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: modelName })

  const result = await model.generateContent(prompt)
  return result.response.text()
}

/**
 * Send analysis to OpenAI O3
 */
async function analyzeWithO3(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required')
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'o3-mini',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}

async function main() {
  const conversationId = process.argv[2]
  const model = process.argv[3] || 'gemini'
  const savePrompt = process.argv[4] === '--save-prompt'

  if (!conversationId) {
    console.error(
      'Usage: bun run scripts/analyze-conversation-efficiency.ts <conversation-id> [model] [--save-prompt]'
    )
    console.error('Models: gemini (default), gemini-pro, o3')
    console.error('Options: --save-prompt (saves the prompt to a file)')
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

    // Generate analysis prompt
    const analysisPrompt = generateAnalysisPrompt(conversationData)

    // Print the full prompt
    console.log('\n=== ANALYSIS PROMPT ===')
    console.log('Length:', analysisPrompt.length, 'characters')
    console.log('---')
    console.log(analysisPrompt)
    console.log('=== END OF PROMPT ===\n')

    // Save prompt to file if requested
    if (savePrompt) {
      const filename = `analysis-prompt-${conversationId}-${Date.now()}.txt`
      await Bun.write(filename, analysisPrompt)
      console.log(`Prompt saved to: ${filename}`)
    }

    // Analyze with selected model
    let analysis: string
    switch (model) {
      case 'gemini-pro':
        console.log('\nSending to Gemini 2.5 Pro for analysis...')
        analysis = await analyzeWithGemini(analysisPrompt, 'gemini-2.5-pro')
        break
      case 'o3':
        console.log('\nSending to O3 for analysis...')
        analysis = await analyzeWithO3(analysisPrompt)
        break
      case 'gemini':
      default:
        console.log('\nSending to Gemini Flash for analysis...')
        analysis = await analyzeWithGemini(analysisPrompt)
        break
    }

    console.log('\n=== CONVERSATION EFFICIENCY ANALYSIS ===\n')
    console.log(analysis)
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
