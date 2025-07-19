#!/usr/bin/env bun

import { Pool } from 'pg'
import { config } from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { z } from 'zod'

// Load environment variables
config()

const __dirname = dirname(fileURLToPath(import.meta.url))

// Constants
const COMPACT_CONVERSATION_MARKER = 'This session is being continued from a previous conversation'
const SUMMARY_MARKER = 'The conversation is summarized below:'
const DEFAULT_FIXTURE_DIR = join(
  __dirname,
  '..',
  'packages/shared/src/utils/__tests__/fixtures/conversation-linking'
)

// Environment configuration
const TEST_FIXTURE_DIR = process.env.TEST_FIXTURE_DIR || DEFAULT_FIXTURE_DIR

// Validation schemas
const RequestDataSchema = z.object({
  request_id: z.string(),
  domain: z.string(),
  conversation_id: z.string().nullable(),
  branch_id: z.string().nullable(),
  current_message_hash: z.string().nullable(),
  parent_message_hash: z.string().nullable(),
  system_hash: z.string().nullable(),
  headers: z.any(),
  body: z.any(),
  response_body: z.any(),
  response_headers: z.any(),
})

type RequestData = z.infer<typeof RequestDataSchema>

// Remove the old interface since we're using Zod
//
interface TestFixture {
  description: string
  type: 'standard' | 'compact'
  expectedLink: boolean
  expectedSummaryContent?: string
  expectedBranchPattern?: string
  parent: {
    request_id: string
    domain: string
    conversation_id: string | null
    branch_id: string | null
    current_message_hash: string | null
    parent_message_hash: string | null
    system_hash: string | null
    body: any // Include full request body for test validation
    response_body: any
  }
  child: {
    request_id: string
    domain: string
    body: any
  }
}

async function fetchRequestData(pool: Pool, requestId: string): Promise<RequestData | null> {
  const query = `
    SELECT 
      request_id,
      domain,
      conversation_id,
      branch_id,
      current_message_hash,
      parent_message_hash,
      system_hash,
      headers,
      body,
      response_body,
      response_headers
    FROM api_requests
    WHERE request_id = $1
  `

  try {
    const result = await pool.query(query, [requestId])

    if (result.rows.length === 0) {
      return null
    }

    // Validate the data structure
    const parsed = RequestDataSchema.safeParse(result.rows[0])
    if (!parsed.success) {
      console.error(`Invalid request data structure for ${requestId}:`, parsed.error.format())
      throw new Error(`Request ${requestId} has invalid data structure`)
    }

    return parsed.data
  } catch (error) {
    if (error instanceof Error && error.message.includes('invalid data structure')) {
      throw error
    }
    throw new Error(`Database query failed for request ${requestId}: ${error}`)
  }
}

function detectFixtureType(childBody: any): 'standard' | 'compact' {
  if (!childBody.messages || childBody.messages.length === 0) {
    return 'standard'
  }

  const firstMessage = childBody.messages[0]

  // Check all content items in the first message
  if (typeof firstMessage.content === 'string') {
    if (firstMessage.content.includes(COMPACT_CONVERSATION_MARKER)) {
      return 'compact'
    }
  } else if (Array.isArray(firstMessage.content)) {
    for (const item of firstMessage.content) {
      if (item.type === 'text' && item.text.includes(COMPACT_CONVERSATION_MARKER)) {
        return 'compact'
      }
    }
  }

  return 'standard'
}

function extractSummaryContent(childBody: any): string | undefined {
  if (!childBody.messages || childBody.messages.length === 0) {
    return undefined
  }

  const firstMessage = childBody.messages[0]

  // Check all content items for the summary
  let fullContent = ''
  if (typeof firstMessage.content === 'string') {
    fullContent = firstMessage.content
  } else if (Array.isArray(firstMessage.content)) {
    fullContent = firstMessage.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n')
  }

  // Just return the raw content after the marker - no normalization
  // The test will handle the normalization comparison
  const markerIndex = fullContent.indexOf(SUMMARY_MARKER)
  if (markerIndex > -1) {
    const startIndex = markerIndex + SUMMARY_MARKER.length
    return fullContent.substring(startIndex).trim()
  }

  return undefined
}

function generateBranchPattern(branchId: string | null): string | undefined {
  if (!branchId || branchId === 'main') {
    return undefined
  }

  // Common branch patterns
  if (branchId.startsWith('compact_')) {
    // The compact branch format is compact_HHMMSS (6 digits)
    return '^compact_\\d{6}$' // Fixed: removed extra backslashes
  }
  if (branchId.startsWith('branch_')) {
    return '^branch_\\d+$' // Fixed: removed extra backslashes
  }

  return undefined
}

async function generateTestFixture(
  pool: Pool,
  parentId: string,
  childId: string,
  description?: string
): Promise<TestFixture> {
  // Fetch both requests
  const [parentData, childData] = await Promise.all([
    fetchRequestData(pool, parentId),
    fetchRequestData(pool, childId),
  ])

  if (!parentData) {
    throw new Error(`Parent request ${parentId} not found`)
  }

  if (!childData) {
    throw new Error(`Child request ${childId} not found`)
  }

  // Filter out tools field from bodies to reduce fixture size
  const filterToolsField = (body: any) => {
    if (!body) return body

    const filtered = { ...body }
    // Remove the tools field which can be very large
    delete filtered.tools
    return filtered
  }

  // Sanitize sensitive data
  const sanitizeData = (data: any): any => {
    if (!data) return data

    // Deep clone to avoid modifying original
    const sanitized = JSON.parse(JSON.stringify(data))

    // Remove sensitive headers if present
    if (sanitized.headers) {
      if (sanitized.headers.authorization) {
        sanitized.headers.authorization = 'Bearer sk-ant-***'
      }
      if (sanitized.headers['x-api-key']) {
        sanitized.headers['x-api-key'] = '***'
      }
      if (sanitized.headers['anthropic-dangerous-direct-browser-access']) {
        sanitized.headers['anthropic-dangerous-direct-browser-access'] = 'true'
      }
    }

    // Sanitize API keys in body if present
    if (sanitized.api_key) {
      sanitized.api_key = 'sk-ant-***'
    }

    return sanitized
  }

  // Filter and sanitize bodies
  const parentBody = sanitizeData(filterToolsField(parentData.body))
  const childBody = sanitizeData(filterToolsField(childData.body))

  // Detect fixture type
  const fixtureType = detectFixtureType(childData.body)

  // Build the fixture
  const fixture: TestFixture = {
    description: description || `Test linking between ${parentId} and ${childId}`,
    type: fixtureType,
    expectedLink: childData.conversation_id === parentData.conversation_id,
    parent: {
      request_id: parentData.request_id,
      domain: parentData.domain,
      conversation_id: parentData.conversation_id,
      branch_id: parentData.branch_id,
      current_message_hash: parentData.current_message_hash,
      parent_message_hash: parentData.parent_message_hash,
      system_hash: parentData.system_hash,
      body: parentBody,
      response_body: sanitizeData(parentData.response_body),
    },
    child: {
      request_id: childData.request_id,
      domain: childData.domain,
      body: childBody,
    },
  }

  // Add optional fields for compact conversations
  if (fixtureType === 'compact') {
    const summaryContent = extractSummaryContent(childData.body)
    if (summaryContent) {
      fixture.expectedSummaryContent = summaryContent
    }

    const branchPattern = generateBranchPattern(childData.branch_id)
    if (branchPattern) {
      fixture.expectedBranchPattern = branchPattern
    }
  }

  return fixture
}

// Command line arguments parsing
const args = {
  parentId: process.argv[2],
  childId: process.argv[3],
  outputFile: process.argv[4],
  description: process.argv[5],
  dryRun: process.argv.includes('--dry-run'),
  verbose: process.argv.includes('--verbose'),
  quiet: process.argv.includes('--quiet'),
}

function log(message: string, level: 'info' | 'error' | 'verbose' = 'info') {
  if (args.quiet && level !== 'error') return
  if (level === 'verbose' && !args.verbose) return

  const prefix = level === 'error' ? '❌' : level === 'verbose' ? '🔍' : '📋'
  console[level === 'error' ? 'error' : 'log'](`${prefix} ${message}`)
}

async function main() {
  const { parentId, childId, outputFile, description, dryRun } = args

  if (!parentId || !childId) {
    console.error(
      'Usage: bun scripts/generate-conversation-test-fixture.ts <parent_request_id> <child_request_id> [output_file] [description] [options]'
    )
    console.error('\nOptions:')
    console.error('  --dry-run   Preview the fixture without writing to file')
    console.error('  --verbose   Show detailed output')
    console.error('  --quiet     Suppress non-error output')
    console.error('\nEnvironment variables:')
    console.error('  TEST_FIXTURE_DIR   Override default fixture directory')
    console.error('\nExamples:')
    console.error('  bun scripts/generate-conversation-test-fixture.ts abc-123 def-456')
    console.error(
      '  bun scripts/generate-conversation-test-fixture.ts abc-123 def-456 my-test.json "Test branch creation"'
    )
    console.error(
      '  bun scripts/generate-conversation-test-fixture.ts abc-123 def-456 --dry-run --verbose'
    )
    process.exit(1)
  }

  // Connect to database
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })

  try {
    log(`Fetching requests ${parentId} and ${childId}...`)

    // Generate the test fixture
    const fixture = await generateTestFixture(pool, parentId, childId, description)

    // Determine output path
    let outputPath: string
    if (outputFile) {
      if (outputFile.startsWith('/')) {
        outputPath = outputFile
      } else {
        outputPath = join(
          TEST_FIXTURE_DIR,
          outputFile.endsWith('.json') ? outputFile : `${outputFile}.json`
        )
      }
    } else {
      // Generate a filename based on the request IDs
      const timestamp = new Date().toISOString().split('T')[0]
      outputPath = join(
        TEST_FIXTURE_DIR,
        `generated-${timestamp}-${parentId.slice(0, 8)}-${childId.slice(0, 8)}.json`
      )
    }

    // Preview mode or write
    if (dryRun) {
      log('DRY RUN MODE - No files will be written', 'verbose')
      log(`Would write to: ${outputPath}`, 'verbose')
      if (args.verbose) {
        console.log('\nFixture preview:')
        console.log(JSON.stringify(fixture, null, 2))
      }
    } else {
      // Ensure directory exists
      const dir = dirname(outputPath)
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
        log(`Created directory: ${dir}`, 'verbose')
      }

      // Write the fixture
      await writeFile(outputPath, JSON.stringify(fixture, null, 2))
      log(`Test fixture generated successfully!`)
      log(`Output: ${outputPath}`)
    }

    // Display summary
    log(`Type: ${fixture.type}`)
    log(`Expected link: ${fixture.expectedLink}`)

    if (fixture.expectedSummaryContent) {
      log(`Summary content: "${fixture.expectedSummaryContent.substring(0, 50)}..."`, 'verbose')
    }

    // Display detailed information in verbose mode
    if (args.verbose) {
      console.log('\nFixture summary:')
      console.log(`- Parent conversation: ${fixture.parent.conversation_id || 'none'}`)
      console.log(`- Parent branch: ${fixture.parent.branch_id || 'none'}`)
      console.log(
        `- Parent message hash: ${fixture.parent.current_message_hash?.slice(0, 12) || 'none'}...`
      )
      console.log(`- Child messages: ${fixture.child.body.messages?.length || 0}`)
    }
  } catch (error) {
    if (error instanceof Error) {
      log(`Error generating test fixture: ${error.message}`, 'error')
      if (args.verbose && error.stack) {
        console.error('Stack trace:', error.stack)
      }
    } else {
      log('Unknown error generating test fixture', 'error')
    }
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
