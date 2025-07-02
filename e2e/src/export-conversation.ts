#!/usr/bin/env bun
import { Client } from 'pg'
import { writeFile } from 'fs/promises'
import { join } from 'path'

interface ExportOptions {
  conversationId?: string
  requestIds?: string[]
  outputFile?: string
  databaseUrl?: string
  includeChunks?: boolean
}

async function exportConversation(options: ExportOptions) {
  const dbUrl = options.databaseUrl || process.env.DATABASE_URL
  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable or --database-url option required')
  }

  const client = new Client({ connectionString: dbUrl })
  await client.connect()

  try {
    let requests: any[] = []
    let chunks: any[] = []

    if (options.conversationId) {
      // Export full conversation
      console.log(`Exporting conversation ${options.conversationId}...`)
      
      const requestsResult = await client.query(
        `SELECT * FROM api_requests 
         WHERE conversation_id = $1 
         ORDER BY created_at`,
        [options.conversationId]
      )
      requests = requestsResult.rows

      if (options.includeChunks) {
        // Get all chunks for these requests
        const requestIds = requests.map(r => r.request_id)
        if (requestIds.length > 0) {
          const chunksResult = await client.query(
            `SELECT * FROM streaming_chunks 
             WHERE api_request_id = ANY($1) 
             ORDER BY api_request_id, chunk_index`,
            [requestIds]
          )
          chunks = chunksResult.rows
        }
      }
    } else if (options.requestIds && options.requestIds.length > 0) {
      // Export specific requests
      console.log(`Exporting ${options.requestIds.length} requests...`)
      
      const requestsResult = await client.query(
        `SELECT * FROM api_requests 
         WHERE request_id = ANY($1) 
         ORDER BY created_at`,
        [options.requestIds]
      )
      requests = requestsResult.rows

      if (options.includeChunks) {
        const chunksResult = await client.query(
          `SELECT * FROM streaming_chunks 
           WHERE api_request_id = ANY($1) 
           ORDER BY api_request_id, chunk_index`,
          [options.requestIds]
        )
        chunks = chunksResult.rows
      }
    } else {
      throw new Error('Either --conversation-id or --request-ids must be provided')
    }

    // Prepare export data
    const exportData = {
      exportedAt: new Date().toISOString(),
      requests: requests.map(req => ({
        request_id: req.request_id,
        conversation_id: req.conversation_id,
        branch_id: req.branch_id,
        parent_request_id: req.parent_request_id,
        parent_message_hash: req.parent_message_hash,
        current_message_hash: req.current_message_hash,
        system_hash: req.system_hash,
        created_at: req.created_at,
        domain: req.domain,
        request_body: req.request_body,
        response_body: req.response_body,
        input_tokens: req.input_tokens,
        output_tokens: req.output_tokens,
        total_tokens: req.total_tokens,
        stream: req.stream,
        parent_task_request_id: req.parent_task_request_id,
        is_subtask: req.is_subtask,
      })),
      chunks: chunks.map(chunk => ({
        api_request_id: chunk.api_request_id,
        chunk_index: chunk.chunk_index,
        content: chunk.content,
        created_at: chunk.created_at,
      })),
    }

    // Write to file
    const outputFile = options.outputFile || 
      (options.conversationId 
        ? `conversation-${options.conversationId}.json`
        : `requests-${Date.now()}.json`)
    
    await writeFile(outputFile, JSON.stringify(exportData, null, 2))
    
    console.log(`Exported ${requests.length} requests`)
    if (chunks.length > 0) {
      console.log(`Exported ${chunks.length} streaming chunks`)
    }
    console.log(`Output written to: ${outputFile}`)

  } finally {
    await client.end()
  }
}

// CLI interface
if (import.meta.main) {
  const args = process.argv.slice(2)
  const options: ExportOptions = {}

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--conversation-id':
      case '-c':
        options.conversationId = args[++i]
        break
      case '--request-ids':
      case '-r':
        options.requestIds = args[++i].split(',')
        break
      case '--output':
      case '-o':
        options.outputFile = args[++i]
        break
      case '--database-url':
      case '-d':
        options.databaseUrl = args[++i]
        break
      case '--include-chunks':
        options.includeChunks = true
        break
      case '--help':
      case '-h':
        console.log(`
Usage: bun run export-conversation.ts [options]

Options:
  -c, --conversation-id <id>    Export full conversation by ID
  -r, --request-ids <ids>       Export specific requests (comma-separated)
  -o, --output <file>          Output file name (default: auto-generated)
  -d, --database-url <url>     Database connection URL (default: DATABASE_URL env)
  --include-chunks             Include streaming chunks in export
  -h, --help                   Show this help message

Examples:
  # Export full conversation
  bun run export-conversation.ts -c 123e4567-e89b-12d3-a456-426614174000

  # Export specific requests
  bun run export-conversation.ts -r req1,req2,req3 -o my-requests.json

  # Export with streaming chunks
  bun run export-conversation.ts -c 123e4567 --include-chunks
        `)
        process.exit(0)
      default:
        console.error(`Unknown option: ${args[i]}`)
        process.exit(1)
    }
  }

  exportConversation(options).catch(error => {
    console.error('Export failed:', error)
    process.exit(1)
  })
}