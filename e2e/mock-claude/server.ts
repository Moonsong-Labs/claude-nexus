import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { nanoid } from 'nanoid'
import * as path from 'path'
import isMatch from 'lodash.ismatch'

const app = new Hono()

// Define the mock structure
interface MockDefinition {
  name: string
  request: Record<string, any>
  response: {
    status?: number
    stream?: boolean
    headers?: Record<string, string>
    body?: Record<string, any>
    chunks?: Array<{
      type: string
      [key: string]: any
    }>
  }
}

let mockDefinitions: MockDefinition[] = []

// Process dynamic placeholders in response body
function processResponsePlaceholders(body: any): any {
  // Deep clone to avoid mutating the cached mock definition
  const processedBody = JSON.parse(JSON.stringify(body))

  // Walk through the object and replace placeholders
  function walk(obj: any): void {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Replace {{nanoid}} with generated ID
        if (obj[key].includes('{{nanoid}}')) {
          obj[key] = obj[key].replace(/\{\{nanoid\}\}/g, nanoid())
        }
        // Replace {{timestamp}} with current timestamp
        if (obj[key].includes('{{timestamp}}')) {
          obj[key] = obj[key].replace(/\{\{timestamp\}\}/g, Date.now().toString())
        }
        // Replace {{timestamp_iso}} with ISO timestamp
        if (obj[key].includes('{{timestamp_iso}}')) {
          obj[key] = obj[key].replace(/\{\{timestamp_iso\}\}/g, new Date().toISOString())
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        walk(obj[key])
      }
    }
  }

  walk(processedBody)
  return processedBody
}

// Load mock definitions from JSON files
async function loadMockDefinitions() {
  const testDataPath = path.join(import.meta.dir, 'test-data')
  const glob = new Bun.Glob('**/*.json')

  const files: MockDefinition[] = []

  // Use Bun.Glob to scan for files
  for await (const file of glob.scan(testDataPath)) {
    try {
      const filePath = path.join(testDataPath, file)
      const content: MockDefinition = await Bun.file(filePath).json()
      files.push(content)
      console.log(`[Mock Claude] Loaded mock: "${content.name}" from ${file}`)
    } catch (error) {
      console.error(`[Mock Claude] Failed to load ${file}:`, error)
    }
  }

  // Sort definitions by specificity (most specific first)
  // Longer JSON strings indicate more specific patterns
  files.sort((a, b) => {
    const specificityA = JSON.stringify(a.request).length
    const specificityB = JSON.stringify(b.request).length
    return specificityB - specificityA
  })

  mockDefinitions = files
  console.log(`[Mock Claude] Loaded ${mockDefinitions.length} mock definition files.`)
  
  // Log the sorted order for debugging
  console.log('[Mock Claude] Mock loading order (by specificity):')
  mockDefinitions.forEach((mock, index) => {
    const specificity = JSON.stringify(mock.request).length
    console.log(`  ${index + 1}. "${mock.name}" (specificity: ${specificity})`)
  })
}

// Load mocks when server starts
await loadMockDefinitions()

// Health check
app.get('/health', c => c.json({ status: 'ok', service: 'mock-claude' }))

// Main chat completions endpoint
app.post('/v1/messages', async c => {
  const body = await c.req.json()
  const requestId = `req_${nanoid()}`

  console.log(`[Mock Claude] Received request:`, JSON.stringify(body, null, 2))

  // Find matching mock definition
  const matchedMock = mockDefinitions.find(mock => {
    const matches = isMatch(body, mock.request)
    console.log(`[Mock Claude] Testing "${mock.name}": ${matches}`)
    if (matches) {
      console.log('[Mock Claude] Request:', JSON.stringify(body, null, 2))
      console.log('[Mock Claude] Pattern:', JSON.stringify(mock.request, null, 2))
    }
    return matches
  })

  if (!matchedMock) {
    console.warn('[Mock Claude] No mock definition found for request:', JSON.stringify(body, null, 2))
    return c.json(
      {
        type: 'error',
        error: { type: 'not_found_error', message: 'No mock definition found for this request.' },
      },
      404
    )
  }

  console.log(`[Mock Claude] Matched request to mock: "${matchedMock.name}"`)

  const { response } = matchedMock
  const { status = 200, headers = {}, stream: isStreaming, body: responseBody, chunks } = response

  // Set standard headers
  c.header('x-request-id', requestId)
  c.header('anthropic-ratelimit-requests-limit', '1000')
  c.header('anthropic-ratelimit-requests-remaining', '999')
  c.header('anthropic-ratelimit-requests-reset', new Date(Date.now() + 3600000).toISOString())
  c.header('anthropic-ratelimit-tokens-limit', '100000')
  c.header('anthropic-ratelimit-tokens-remaining', '99985')
  c.header('anthropic-ratelimit-tokens-reset', new Date(Date.now() + 3600000).toISOString())

  // Set custom headers if provided
  for (const [key, value] of Object.entries(headers)) {
    c.header(key, value)
  }

  // Set response status
  c.status(status)

  // Handle streaming response
  if (isStreaming && chunks) {
    return stream(c, async s => {
      c.header('content-type', 'text/event-stream')
      c.header('cache-control', 'no-cache')
      c.header('connection', 'keep-alive')

      for (const chunk of chunks) {
        // Process placeholders in each chunk
        const processedChunk = processResponsePlaceholders(chunk)
        const line = `event: ${processedChunk.type}\ndata: ${JSON.stringify(processedChunk)}\n\n`
        await s.write(line)
        await s.sleep(10) // Small delay between chunks
      }
    })
  }

  // Handle non-streaming response
  if (responseBody) {
    const finalBody = processResponsePlaceholders(responseBody)
    return c.json(finalBody)
  }

  // If no body or chunks provided, return error
  console.error(`[Mock Claude] Mock "${matchedMock.name}" has neither body nor chunks`)
  return c.json(
    {
      type: 'error',
      error: { type: 'internal_server_error', message: 'Mock definition is invalid.' },
    },
    500
  )
})

// Start server
const PORT = process.env.MOCK_CLAUDE_PORT || 8081
console.log(`[Mock Claude] Server starting on port ${PORT}...`)
export default {
  port: PORT,
  hostname: '0.0.0.0', // Listen on all interfaces
  fetch: app.fetch,
}