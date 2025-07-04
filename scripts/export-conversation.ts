#!/usr/bin/env bun
import { Pool } from 'pg'
import { writeFile } from 'fs/promises'
import { resolve } from 'path'
import type { TestCase, TestRequest } from '../packages/e2e/src/types/test-case.js'

// Parse command line arguments
const args = process.argv.slice(2)
if (args.length < 1) {
  console.error(
    'Usage: bun run scripts/export-conversation.ts <conversation-id|request-ids...> [--output=file.json]'
  )
  process.exit(1)
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

const pool = new Pool({ connectionString: databaseUrl })

async function exportConversation(conversationId: string): Promise<any[]> {
  const result = await pool.query(
    `SELECT 
      request_id,
      domain,
      timestamp,
      path,
      method,
      headers,
      body,
      response_body,
      conversation_id,
      branch_id,
      parent_request_id,
      current_message_hash,
      parent_message_hash,
      system_hash,
      parent_task_request_id,
      is_subtask,
      message_count
    FROM api_requests
    WHERE conversation_id = $1
    ORDER BY timestamp ASC`,
    [conversationId]
  )

  return result.rows
}

async function exportRequests(requestIds: string[]): Promise<any[]> {
  const result = await pool.query(
    `SELECT 
      request_id,
      domain,
      timestamp,
      path,
      method,
      headers,
      body,
      response_body,
      conversation_id,
      branch_id,
      parent_request_id,
      current_message_hash,
      parent_message_hash,
      system_hash,
      parent_task_request_id,
      is_subtask,
      message_count
    FROM api_requests
    WHERE request_id = ANY($1)
    ORDER BY timestamp ASC`,
    [requestIds]
  )

  return result.rows
}

function convertToTestCase(requests: any[]): TestCase {
  const testRequests: TestRequest[] = []
  const conversationIds = new Set<string>()
  const branchIds = new Set<string>()

  for (let i = 0; i < requests.length; i++) {
    const req = requests[i]

    // Track unique values
    if (req.conversation_id) conversationIds.add(req.conversation_id)
    if (req.branch_id) branchIds.add(req.branch_id)

    const testRequest: TestRequest = {
      domain: req.domain,
      path: req.path,
      method: req.method,
      body: req.body,
      expectDatabase: {
        conversationId: i === 0 ? '$new' : conversationIds.size > 1 ? req.conversation_id : '$same',
        branchId: req.branch_id === 'main' ? '$main' : req.branch_id,
        parentRequestId: req.parent_request_id
          ? i > 0 && req.parent_request_id === requests[i - 1].request_id
            ? '$previous'
            : req.parent_request_id
          : '$null',
        currentMessageHash: '$any',
        parentMessageHash: req.parent_message_hash ? '$any' : '$null',
        systemHash: req.system_hash ? '$any' : '$null',
        isSubtask: req.is_subtask || undefined,
        messageCount: req.message_count,
      },
    }

    // Remove undefined values
    Object.keys(testRequest.expectDatabase!).forEach(key => {
      if (
        testRequest.expectDatabase![key as keyof typeof testRequest.expectDatabase] === undefined
      ) {
        delete testRequest.expectDatabase![key as keyof typeof testRequest.expectDatabase]
      }
    })

    testRequests.push(testRequest)
  }

  return {
    description: `Exported conversation from ${new Date().toISOString()}`,
    requests: testRequests,
  }
}

async function main() {
  try {
    let requests: any[]

    // Check if it's a UUID (conversation ID) or multiple request IDs
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    if (args.length === 1 && isUuid.test(args[0])) {
      console.log(`Exporting conversation ${args[0]}...`)
      requests = await exportConversation(args[0])
    } else {
      console.log(`Exporting ${args.length} requests...`)
      requests = await exportRequests(args.filter(arg => !arg.startsWith('--')))
    }

    if (requests.length === 0) {
      console.error('No requests found')
      process.exit(1)
    }

    console.log(`Found ${requests.length} requests`)

    const testCase = convertToTestCase(requests)

    // Determine output file
    const outputArg = args.find(arg => arg.startsWith('--output='))
    const outputFile = outputArg
      ? resolve(process.cwd(), outputArg.split('=')[1])
      : resolve(process.cwd(), `packages/e2e/src/fixtures/exported-${Date.now()}.json`)

    await writeFile(outputFile, JSON.stringify(testCase, null, 2))
    console.log(`✅ Exported to ${outputFile}`)
  } catch (error) {
    console.error('Export failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
