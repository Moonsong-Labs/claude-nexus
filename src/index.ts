import { Hono } from 'hono'
import { env } from 'hono/adapter'
import { getCredentialFileForDomain, getApiKey, getMaskedCredentialInfo, loadCredentials } from './credentials'
import { initializeSlack, parseSlackConfig, sendToSlack, sendErrorToSlack, initializeDomainSlack } from './slack'
import { tokenTracker } from './tokenTracker'
import { StorageService, initializeDatabase } from './storage'
import { Pool } from 'pg'
// File system imports
let readFileSync: any, existsSync: any, join: any, dirname: any, fileURLToPath: any
try {
  const fs = await import('fs')
  const path = await import('path')
  const url = await import('url')
  readFileSync = fs.readFileSync
  existsSync = fs.existsSync
  join = path.join
  dirname = path.dirname
  fileURLToPath = url.fileURLToPath
} catch {
  // File system not available
}

// Constants for configuration values
const DEFAULT_DB_PORT = '5432'
const DEFAULT_DB_NAME = 'claude_proxy'
const DEFAULT_DB_USER = 'postgres'
const DEFAULT_REQUEST_LIMIT = 100
const MAX_INPUT_PREVIEW_LENGTH = 100
const MAX_CONTENT_LENGTH = 500
const MAX_SLACK_LINES = 20
const MAX_LENGTH_SLACK = 3000
const MASKED_KEY_MIN_LENGTH = 8
const MASKED_KEY_SHORT_LENGTH = 10

// Track previous user messages by domain to detect changes with size limit
const MAX_MESSAGE_CACHE_SIZE = 1000 // Limit cache to prevent memory leak
const previousUserMessages = new Map<string, string>()

// Helper to manage cache size
function setCachedMessage(domain: string, message: string) {
  // Remove oldest entry if cache is full
  if (previousUserMessages.size >= MAX_MESSAGE_CACHE_SIZE) {
    const firstKey = previousUserMessages.keys().next().value
    previousUserMessages.delete(firstKey)
  }
  setCachedMessage(domain, message)
}

// Initialize storage service if configured
let storageService: StorageService | null = null
if (process.env.DATABASE_URL || process.env.DB_HOST) {
  try {
    // Extract database configuration to avoid duplication
    const dbConfig = {
      connectionString: process.env.DATABASE_URL,
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || DEFAULT_DB_PORT),
      database: process.env.DB_NAME || DEFAULT_DB_NAME,
      user: process.env.DB_USER || DEFAULT_DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.NODE_ENV === 'production'
    }
    
    const pool = new Pool(dbConfig)
    
    // Initialize database schema
    await initializeDatabase(pool)
    
    // Create storage service
    storageService = new StorageService(dbConfig)
    
    console.log('Storage service initialized successfully')
  } catch (error) {
    console.error('Failed to initialize storage service:', error)
  }
}

const app = new Hono<{
  Bindings: {
    CLAUDE_API_KEY?: string
    DEBUG?: string
    TELEMETRY_ENDPOINT?: string
    CREDENTIALS_DIR?: string // Directory containing domain credential files
    SLACK_WEBHOOK_URL?: string
    SLACK_CHANNEL?: string
    SLACK_USERNAME?: string
    SLACK_ICON_EMOJI?: string
    SLACK_ENABLED?: string
  }
}>()

// Telemetry data structure
interface TelemetryData {
  timestamp: string
  requestId: string
  method: string
  path: string
  apiKey?: string // Masked API key for identification
  model?: string
  inputTokens?: number
  outputTokens?: number
  duration?: number
  status: number
  error?: string
}

// Helper to mask API key for telemetry
function maskApiKey(key: string): string {
  if (!key || key.length < MASKED_KEY_MIN_LENGTH) return 'unknown'
  if (key.length <= MASKED_KEY_SHORT_LENGTH) return key
  return `...${key.slice(-10)}`
}

// Send telemetry data
async function sendTelemetry(telemetryEndpoint: string | undefined, data: TelemetryData) {
  if (!telemetryEndpoint) return
  
  try {
    await fetch(telemetryEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
  } catch (err) {
    console.error('Failed to send telemetry:', err)
  }
}

// Health check endpoint
app.get('/', async (c) => {
  const { CREDENTIALS_DIR } = env(c)

  return c.json({
    status: 'ok',
    message: 'Claude Nexus Proxy is running',
    config: {
      CREDENTIALS_DIR: CREDENTIALS_DIR || 'credentials'
    }
  })
})

// Token statistics endpoint
app.get('/token-stats', async (c) => {
  const stats = tokenTracker.getStats()
  return c.json({
    status: 'ok',
    stats,
    timestamp: new Date().toISOString()
  })
})

// Storage API endpoints
app.get('/api/requests', async (c) => {
  if (!storageService) {
    return c.json({ error: 'Storage service not configured' }, 501)
  }
  
  const domain = c.req.query('domain')
  const limit = parseInt(c.req.query('limit') || DEFAULT_REQUEST_LIMIT.toString())
  
  try {
    const requests = await storageService.getRequestsByDomain(domain || '', limit)
    return c.json({
      status: 'ok',
      requests,
      count: requests.length
    })
  } catch (error) {
    console.error('Failed to get requests:', error)
    return c.json({ error: 'Failed to retrieve requests' }, 500)
  }
})

app.get('/api/requests/:requestId', async (c) => {
  if (!storageService) {
    return c.json({ error: 'Storage service not configured' }, 501)
  }
  
  const requestId = c.req.param('requestId')
  
  try {
    const details = await storageService.getRequestDetails(requestId)
    if (!details.request) {
      return c.json({ error: 'Request not found' }, 404)
    }
    return c.json({
      status: 'ok',
      ...details
    })
  } catch (error) {
    console.error('Failed to get request details:', error)
    return c.json({ error: 'Failed to retrieve request details' }, 500)
  }
})

app.get('/api/storage-stats', async (c) => {
  if (!storageService) {
    return c.json({ error: 'Storage service not configured' }, 501)
  }
  
  const domain = c.req.query('domain')
  
  try {
    const stats = await storageService.getTokenStats(domain)
    return c.json({
      status: 'ok',
      stats,
      domain: domain || 'all',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Failed to get storage stats:', error)
    return c.json({ error: 'Failed to retrieve storage statistics' }, 500)
  }
})

// Client setup files endpoint (only available in Node.js environment)
app.get('/client-setup/:filename', async (c) => {
  // Check if file system operations are available
  if (!readFileSync || !existsSync) {
    return c.text('Client setup files are not available in this environment', 501)
  }
  
  const filename = c.req.param('filename')
  
  // Security: prevent directory traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return c.text('Invalid filename', 400)
  }
  
  try {
    // Determine the base directory
    let basePath: string
    
    // Check if we're running in a compiled context or development
    if (typeof __dirname !== 'undefined') {
      // CommonJS context
      basePath = __dirname
    } else {
      // ES Module context
      try {
        const __filename = fileURLToPath(import.meta.url)
        basePath = dirname(__filename)
      } catch {
        // Fallback for environments without import.meta.url
        basePath = process.cwd()
      }
    }
    
    // Try multiple possible locations for the client-setup directory
    const possiblePaths = [
      join(basePath, '..', 'client-setup', filename),  // Development: src/../client-setup
      join(basePath, 'client-setup', filename),        // Compiled: dist/client-setup
      join(process.cwd(), 'client-setup', filename),   // Working directory
      join('/app', 'client-setup', filename),          // Docker container
    ]
    
    for (const filePath of possiblePaths) {
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8')
        
        // Set appropriate content type
        let contentType = 'application/octet-stream'
        if (filename.endsWith('.json')) {
          contentType = 'application/json'
        } else if (filename.endsWith('.txt')) {
          contentType = 'text/plain'
        } else if (filename.endsWith('.sh')) {
          contentType = 'text/x-shellscript'
        } else if (filename.endsWith('.ps1')) {
          contentType = 'text/x-powershell'
        }
        
        return c.text(content, 200, {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
          'Content-Disposition': `attachment; filename="${filename}"`
        })
      }
    }
    
    return c.text('File not found', 404)
  } catch (error) {
    console.error('Error serving client-setup file:', error)
    return c.text('Internal server error', 500)
  }
})

app.post('/v1/messages', async (c) => {
  // Get environment variables from context
  const { CLAUDE_API_KEY, DEBUG, TELEMETRY_ENDPOINT, CREDENTIALS_DIR, SLACK_WEBHOOK_URL, SLACK_CHANNEL, SLACK_USERNAME, SLACK_ICON_EMOJI, SLACK_ENABLED } = env(c)
  
  // Initialize Slack if configured
  const slackConfig = parseSlackConfig({ SLACK_WEBHOOK_URL, SLACK_CHANNEL, SLACK_USERNAME, SLACK_ICON_EMOJI, SLACK_ENABLED })
  initializeSlack(slackConfig)
  
  const startTime = Date.now()
  const requestId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)
  
  // Support API key override from request headers
  const authHeader = c.req.header('Authorization')
  const requestApiKey = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null
  const hasAuthorizationHeader = !!authHeader
  
  // Get the request hostname for domain-based mapping
  const requestHost = c.req.header('Host') || new URL(c.req.url).hostname
  
  try {
    // Forward to Claude API
    const baseUrl = 'https://api.anthropic.com'
    let key: string | null
    
    // API key selection priority:
    // 1. Domain-based credential file (if exists)
    // 2. Request API key from Authorization header
    // 3. Default Claude API key
    
    // Check for domain-specific credential file
    const credentialFile = getCredentialFileForDomain(requestHost, CREDENTIALS_DIR)
    let domainSlackWebhook = null
    
    if (credentialFile) {
      // Load credential from file and get API key (handles OAuth refresh)
      key = await getApiKey(credentialFile, DEBUG === 'true')
      if (DEBUG && DEBUG !== 'false') {
        debug(`Domain credential found: ${requestHost} -> ${getMaskedCredentialInfo(credentialFile)}`)
      }
      
      // Check for domain-specific Slack configuration
      const credentials = loadCredentials(credentialFile)
      if (credentials?.slack) {
        // Convert between interfaces (webhook_url vs webhookUrl, icon_emoji vs iconEmoji)
        const slackConfig = {
          webhookUrl: credentials.slack.webhook_url,
          channel: credentials.slack.channel,
          username: credentials.slack.username,
          iconEmoji: credentials.slack.icon_emoji,
          enabled: credentials.slack.enabled
        }
        domainSlackWebhook = initializeDomainSlack(slackConfig)
        if (DEBUG && DEBUG !== 'false') {
          debug(`Domain-specific Slack config loaded for ${requestHost}`)
        }
      }
    } else if (requestApiKey) {
      // Use API key from request header if no domain credential file found
      key = requestApiKey
      if (DEBUG && DEBUG !== 'false') {
        debug(`Using API key from Authorization header (no credential file for ${requestHost})`)
      }
    } else {
      // No domain file and no request API key, use default API key
      key = CLAUDE_API_KEY || null
    }

    function debug(...args: any[]) {
      if (!DEBUG || DEBUG === 'false') return
      console.log(...args)
    }

    function maskBearer(value: string): string {
      return value.replace(/Bearer\s+(\S+)/g, (_match, token) => {
        if (token.length <= 10) {
          // If the token is 10 characters or less, reveal all of it
          return `Bearer ${token}`;
        }
        // Otherwise, reveal "..." followed by the last 10 characters
        return `Bearer ...${token.slice(-10)}`;
      });
    }
    
    function maskApiKeyInString(value: string): string {
      // Mask API keys in various formats
      return value
        .replace(/sk-ant-[a-zA-Z0-9-]+/g, (match) => {
          if (match.length <= 10) {
            return match;
          }
          return `sk-ant-...${match.slice(-10)}`;
        })
        .replace(/Bearer\s+(\S+)/g, (_match, token) => {
          if (token.length <= 10) {
            return `Bearer ${token}`;
          }
          return `Bearer ...${token.slice(-10)}`;
        })
        .replace(/(x-api-key:\s*)([^\s,}]+)/gi, (match, prefix, key) => {
          if (key.length <= 10) {
            return `${prefix}${key}`;
          }
          return `${prefix}...${key.slice(-10)}`;
        })
    }
    
    // We'll check debug logging after determining request type

    const payload = await c.req.json()
    
    // Store request in database if storage is enabled (will be updated with actual type later)
    // Skip initial storage, will store after determining request type
    
    // Detect request type based on system message count
    let systemMessageCount = 0
    if (payload.system) {
      if (Array.isArray(payload.system)) {
        systemMessageCount = payload.system.length
      } else if (typeof payload.system === 'string') {
        systemMessageCount = 1
      }
    }
    
    // Count system messages in the messages array as well
    if (payload.messages && Array.isArray(payload.messages)) {
      systemMessageCount += payload.messages.filter((msg: any) => msg.role === 'system').length
    }
    
    const requestType: 'query_evaluation' | 'inference' | undefined = 
      systemMessageCount === 1 ? 'query_evaluation' : 
      systemMessageCount > 1 ? 'inference' : 
      undefined
    
    // Debug log incoming request headers (skip for query_evaluation)
    if (DEBUG && DEBUG !== 'false' && requestType !== 'query_evaluation') {
      const headers: Record<string, string> = {}
      c.req.raw.headers.forEach((value, key) => {
        // Mask sensitive headers
        if (key.toLowerCase() === 'authorization' || key.toLowerCase() === 'x-api-key') {
          headers[key] = maskBearer(value)
        } else {
          headers[key] = value
        }
      })
      debug('=== Incoming Request ===')
      debug('Request ID:', requestId)
      debug('Method:', c.req.method)
      debug('URL:', c.req.url)
      debug('Host:', requestHost)
      debug('Headers:', headers)
      debug('System message count:', systemMessageCount)
      debug('Request type:', requestType || 'unknown')
    }
    
    // Store request only if it's not a query_evaluation
    // Include unknown request types as they might be legitimate requests without system messages
    if (storageService && requestType !== 'query_evaluation') {
      try {
        // Force immediate storage for streaming requests
        await storageService.storeRequest(c, requestId, payload, requestType || 'unknown', payload.stream)
      } catch (error) {
        console.error('Failed to store request:', error)
      }
    }
    
    // Debug log request body (skip for query_evaluation)
    if (DEBUG && DEBUG !== 'false' && requestType !== 'query_evaluation') {
      // Create a deep copy and mask sensitive data
      const maskedPayload = JSON.parse(JSON.stringify(payload))
      
      // Mask API keys that might be in the payload
      const maskPayloadRecursive = (obj: any): any => {
        if (typeof obj === 'string') {
          return maskApiKeyInString(obj)
        }
        if (Array.isArray(obj)) {
          return obj.map(maskPayloadRecursive)
        }
        if (obj && typeof obj === 'object') {
          const masked: any = {}
          for (const key in obj) {
            // Mask sensitive fields
            if (key.toLowerCase().includes('key') || key.toLowerCase().includes('token')) {
              masked[key] = '****'
            } else {
              masked[key] = maskPayloadRecursive(obj[key])
            }
          }
          return masked
        }
        return obj
      }
      
      debug('Request Body:', JSON.stringify(maskPayloadRecursive(maskedPayload), null, 2))
      debug('======================')
    }
    
    // Store user message for Slack (only for non-query evaluation requests)
    let slackUserContent = ''
    if (requestType !== 'query_evaluation') {
      try {
        // Get the latest actual user message (last one in the array, excluding system messages)
        const userMessages = payload.messages?.filter((msg: any) => msg.role === 'user') || []
        
        // Find the last message that contains actual user content (not system reminders)
        for (let i = userMessages.length - 1; i >= 0; i--) {
          const msg = userMessages[i]
          let messageContent = ''
          
          if (typeof msg.content === 'string') {
            messageContent = msg.content
          } else if (Array.isArray(msg.content)) {
            // Extract only text content
            msg.content.forEach((item: any) => {
              if (item.type === 'text') {
                messageContent += (messageContent ? '\n' : '') + (item.text || '')
              }
            })
          }
          
          // Skip if this looks like a system reminder
          if (!messageContent.includes('<system-reminder>') && messageContent.trim() !== '') {
            // Truncate to MAX_SLACK_LINES lines
            const lines = messageContent.split('\n')
            if (lines.length > MAX_SLACK_LINES) {
              messageContent = lines.slice(0, MAX_SLACK_LINES).join('\n') + '\n... (truncated)'
            }
            slackUserContent = messageContent
            break
          }
        }
      } catch (slackError) {
        console.error('Failed to process user message for Slack:', slackError)
      }
    }
    
    // Check if user message changed
    const previousUserMessage = previousUserMessages.get(requestHost) || ''
    const userMessageChanged = slackUserContent !== previousUserMessage
    if (slackUserContent) {
      setCachedMessage(requestHost, slackUserContent)
    }
    
    // Start with all original request headers
    const headers: Record<string, string> = {}
    
    // Copy all headers from the original request
    c.req.raw.headers.forEach((value, key) => {
      // Skip host header as it will be set by fetch
      if (key.toLowerCase() !== 'host') {
        headers[key] = value
      }
    })
    
    // Override/set required headers for Claude API
    headers['Content-Type'] = 'application/json'
    headers['anthropic-version'] = '2023-06-01'
    
    // Remove authorization header if present (we'll set it properly based on credential type)
    delete headers['authorization']
    delete headers['Authorization']
    
    // Handle credential-based authentication
    if (key) {
      if (credentialFile) {
        // Domain-based credential found, check its type
        const credentials = loadCredentials(credentialFile)
        
        if (credentials?.type === 'oauth') {
          // OAuth credential
          headers['Authorization'] = `Bearer ${key}`
          headers['anthropic-beta'] = 'oauth-2025-04-20'
        } else {
          // API key credential
          headers['x-api-key'] = key
        }
      } else if (hasAuthorizationHeader && authHeader && key === requestApiKey) {
        // Key came from request Authorization header, preserve its format
        headers['Authorization'] = authHeader
        // Add beta header if it looks like an OAuth token
        if (authHeader.startsWith('Bearer ')) {
          headers['anthropic-beta'] = 'oauth-2025-04-20'
        }
      } else {
        // Direct API key from env vars
        headers['x-api-key'] = key
      }
    }
    
    if (requestType !== 'query_evaluation') {
      debug('Forwarding to Claude API')
      debug('URL:', `${baseUrl}/v1/messages`)
    }
    
    // Debug log headers being sent (skip for query_evaluation)
    if (DEBUG && DEBUG !== 'false' && requestType !== 'query_evaluation') {
      const authType = headers['Authorization'] ? 'OAuth' : headers['x-api-key'] ? 'API Key' : 'None'
      debug('Authentication type:', authType)
      
      const maskedHeaders = Object.fromEntries(
        Object.entries(headers).map(([k, v]) => [
          k,
          k.toLowerCase() === 'x-api-key' ? maskApiKey(v) : 
          k.toLowerCase() === 'authorization' ? maskBearer(v) : v
        ])
      )
      debug('Forwarding headers:', maskedHeaders)
    }
    
    const claudeResponse = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    
    // Debug log response (skip for query_evaluation)
    if (DEBUG && DEBUG !== 'false' && requestType !== 'query_evaluation') {
      debug('=== Claude API Response ===')
      debug('Status:', claudeResponse.status)
      debug('Status Text:', claudeResponse.statusText)
      const responseHeaders: Record<string, string> = {}
      claudeResponse.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })
      debug('Response Headers:', responseHeaders)
    }
    
    const responseData = payload.stream 
      ? claudeResponse.body 
      : await claudeResponse.json()
    
    // Debug log response body (non-streaming only, skip for query_evaluation)
    if (DEBUG && DEBUG !== 'false' && !payload.stream && requestType !== 'query_evaluation') {
      // Mask sensitive data in response
      const maskedResponse = JSON.parse(JSON.stringify(responseData))
      if (maskedResponse.content) {
        // Truncate very long content
        maskedResponse.content = Array.isArray(maskedResponse.content) 
          ? maskedResponse.content.map((item: any) => {
              if (item.text && item.text.length > 500) {
                return { ...item, text: item.text.substring(0, 500) + '... (truncated)' }
              }
              return item
            })
          : maskedResponse.content
      }
      debug('Response Body:', JSON.stringify(maskedResponse, null, 2))
      debug('Response has usage?', 'usage' in maskedResponse)
      if ('usage' in maskedResponse) {
        debug('Usage object keys:', Object.keys(maskedResponse.usage || {}))
      }
      debug('=========================')
    }
    
    // Collect telemetry
    const telemetryData: TelemetryData = {
      timestamp: new Date().toISOString(),
      requestId,
      method: 'POST',
      path: '/v1/messages',
      apiKey: key ? maskApiKey(key) : undefined,
      model: payload.model,
      status: claudeResponse.status,
      duration: Date.now() - startTime
    }
    
    // Extract token usage if available
    // Claude API returns usage at the message level, not top level
    if (!payload.stream && responseData && typeof responseData === 'object') {
      const data = responseData as any
      
      // Debug the entire response structure to find usage (skip for query_evaluation)
      if (DEBUG && DEBUG !== 'false' && requestType !== 'query_evaluation') {
        debug('Looking for usage in response...')
        debug('Response type:', data.type)
        debug('Has top-level usage?', 'usage' in data)
        if (data.usage) {
          debug('Top-level usage:', JSON.stringify(data.usage, null, 2))
        }
      }
      
      // Claude API returns usage at message level for messages endpoint
      let usage = data.usage
      
      // Claude API might use different field names than expected
      // Check for both snake_case and camelCase variants
      if (usage) {
        telemetryData.inputTokens = usage.input_tokens || usage.inputTokens || usage.prompt_tokens || 0
        telemetryData.outputTokens = usage.output_tokens || usage.outputTokens || usage.completion_tokens || 0
        
        if (DEBUG && DEBUG !== 'false' && requestType !== 'query_evaluation') {
          debug('Token usage extracted:', {
            input_tokens: telemetryData.inputTokens,
            output_tokens: telemetryData.outputTokens,
            raw_usage: usage
          })
        }
      } else {
        if (DEBUG && DEBUG !== 'false' && requestType !== 'query_evaluation') {
          debug('No usage data found in response')
        }
      }
    }
    
    // Send telemetry asynchronously
    sendTelemetry(TELEMETRY_ENDPOINT, telemetryData)
    
    // Count tool calls in the response
    let toolCallCount = 0
    if (!payload.stream && responseData && typeof responseData === 'object') {
      const data = responseData as any
      // Claude API: tool_use content blocks
      if (data.content && Array.isArray(data.content)) {
        toolCallCount = data.content.filter((item: any) => item.type === 'tool_use').length
      }
    }
    
    // Track token usage
    tokenTracker.track(requestHost, telemetryData.inputTokens || 0, telemetryData.outputTokens || 0, requestType, toolCallCount)
    
    if (DEBUG && DEBUG !== 'false' && requestType !== 'query_evaluation') {
      debug('Token tracking called with:', {
        domain: requestHost,
        inputTokens: telemetryData.inputTokens || 0,
        outputTokens: telemetryData.outputTokens || 0,
        requestType: requestType || 'unknown',
        toolCallCount
      })
    }
    
    // Store response in database if storage is enabled and not query_evaluation
    if (storageService && !payload.stream && requestType !== 'query_evaluation') {
      try {
        const responseHeaders: Record<string, string> = {}
        claudeResponse.headers.forEach((value, key) => {
          responseHeaders[key] = value
        })
        
        await storageService.storeResponse(
          requestId,
          claudeResponse.status,
          responseHeaders,
          responseData,
          false, // not streaming
          Date.now() - startTime,
          telemetryData.inputTokens,
          telemetryData.outputTokens,
          toolCallCount,
          claudeResponse.status >= 400 ? `${claudeResponse.status} ${claudeResponse.statusText}` : undefined
        )
      } catch (error) {
        console.error('Failed to store response:', error)
      }
    }
    
    // Send combined user/assistant message to Slack (non-streaming only, non-query evaluation)
    if (!payload.stream && responseData && typeof responseData === 'object' && 'content' in responseData && requestType !== 'query_evaluation' && slackUserContent) {
      try {
        const data = responseData as any
        let assistantContent = ''
        
        // Extract text content and tool calls from assistant response
        const toolCalls: string[] = []
        if (data.content && Array.isArray(data.content)) {
          // Extract text content
          assistantContent = data.content
            .filter((item: any) => item.type === 'text')
            .map((item: any) => item.text || '')
            .join('\n')
          
          // Extract tool calls
          const tools = data.content.filter((item: any) => item.type === 'tool_use')
          if (tools.length > 0) {
            tools.forEach((tool: any) => {
              let inputStr = ''
              
              // Special handling for Edit/Read/Write and TodoWrite tools
              if (['Edit', 'Read', 'Write', 'MultiEdit', 'NotebookEdit', 'NotebookRead', 'TodoWrite'].includes(tool.name)) {
                if (tool.name === 'TodoWrite') {
                  // Special handling for TodoWrite
                  const todos = tool.input?.todos || []
                  const pending = todos.filter((t: any) => t.status === 'pending').length
                  const inProgress = todos.filter((t: any) => t.status === 'in_progress').length
                  const completed = todos.filter((t: any) => t.status === 'completed').length
                  
                  const parts = []
                  if (pending > 0) parts.push(`${pending} pending`)
                  if (inProgress > 0) parts.push(`${inProgress} in progress`)
                  if (completed > 0) parts.push(`${completed} completed`)
                  
                  inputStr = ` - ${todos.length} todo${todos.length !== 1 ? 's' : ''} (${parts.join(', ')})`
                } else {
                  const filePath = tool.input?.file_path || tool.input?.notebook_path || ''
                  if (filePath) {
                  // Get last 2 segments of the path
                  const segments = filePath.split('/')
                  const lastTwo = segments.slice(-2).join('/')
                  
                  // Add line count info based on tool type
                  let lineInfo = ''
                  if (tool.name === 'Read' || tool.name === 'NotebookRead') {
                    if (tool.input?.offset && tool.input?.limit) {
                      lineInfo = ` (lines ${tool.input.offset}-${tool.input.offset + tool.input.limit - 1})`
                    } else if (tool.input?.limit) {
                      lineInfo = ` (${tool.input.limit} lines)`
                    }
                  } else if (tool.name === 'Write') {
                    // Count lines in content
                    const lines = (tool.input?.content || '').split('\n').length
                    lineInfo = ` (${lines} lines)`
                  } else if (tool.name === 'MultiEdit' || tool.name === 'NotebookEdit') {
                    const editCount = tool.input?.edits?.length || 1
                    lineInfo = ` (${editCount} edit${editCount !== 1 ? 's' : ''})`
                  } else if (tool.name === 'Edit') {
                    lineInfo = tool.input?.replace_all ? ' (all occurrences)' : ''
                  }
                  
                  inputStr = ` - ${lastTwo}${lineInfo}`
                  }
                }
              } else if (tool.input) {
                // Default formatting for other tools
                const fullInput = JSON.stringify(tool.input)
                const firstLine = fullInput.split('\n')[0]
                inputStr = ` - ${firstLine.length > MAX_INPUT_PREVIEW_LENGTH ? firstLine.substring(0, MAX_INPUT_PREVIEW_LENGTH) + '...' : firstLine}`
              }
              
              toolCalls.push(`\n🔧 ${tool.name}${inputStr}`)
            })
          }
        }
        
        // Truncate to MAX_SLACK_LINES lines
        const lines = assistantContent.split('\n')
        if (lines.length > MAX_SLACK_LINES) {
          assistantContent = lines.slice(0, MAX_SLACK_LINES).join('\n') + '\n... (truncated)'
        }
        
        if (assistantContent || toolCalls.length > 0) {
          // Combine user and assistant messages
          let combinedContent = ''
          
          // Check if this is a tool-only response (no text content)
          const isToolOnlyResponse = !assistantContent.trim() && toolCalls.length > 0
          
          if (isToolOnlyResponse) {
            // For tool-only responses, just show the tool calls without "Claude:" prefix
            combinedContent = toolCalls.join('\n').trim()
          } else if (userMessageChanged) {
            // Show full user message when it changed
            combinedContent = `👤 User: ${slackUserContent}\n\n🤖 Claude: ${assistantContent}${toolCalls.join('\n')}`
          } else {
            // Just show Claude's response when no user change
            combinedContent = `🤖 Claude: ${assistantContent}${toolCalls.join('\n')}`
          }
          
          await sendToSlack({
            requestId,
            domain: requestHost,
            model: data.model || payload.model,
            role: 'assistant', // Keep as assistant to maintain the message type
            content: combinedContent,
            timestamp: new Date().toISOString(),
            apiKey: maskApiKey(key || 'unknown'),
            inputTokens: data.usage?.input_tokens || data.usage?.inputTokens || data.usage?.prompt_tokens,
            outputTokens: data.usage?.output_tokens || data.usage?.outputTokens || data.usage?.completion_tokens
          }, domainSlackWebhook)
        }
      } catch (slackError) {
        console.error('Failed to send combined message to Slack:', slackError)
      }
    }
    
    // Return the response
    if (payload.stream) {
      // For streaming, we need to parse the stream to extract usage and content
      const reader = (responseData as ReadableStream).getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let usage: any = null
      let streamedAssistantContent = ''
      let streamedModel = payload.model
      const streamedToolCalls: any[] = []
      let currentToolCall: any = null
      
      const stream = new ReadableStream({
        async start(controller) {
          let chunkIndex = 0
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              
              // Pass through the chunk
              controller.enqueue(value)
              
              // Also parse it to extract usage and content
              const chunk = decoder.decode(value, { stream: true })
              buffer += chunk
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6)
                  if (data && data !== '[DONE]') {
                    try {
                      const parsed = JSON.parse(data)
                      
                      // Store streaming chunk in database if storage is enabled and not query_evaluation
                      if (storageService && requestType !== 'query_evaluation') {
                        try {
                          await storageService.storeStreamingChunk(requestId, chunkIndex++, parsed)
                        } catch (error) {
                          // Don't fail the stream if storage fails
                          console.error('Failed to store streaming chunk:', error)
                        }
                      }
                      
                      // Extract usage
                      if (parsed.usage) {
                        usage = parsed.usage
                        if (DEBUG && DEBUG !== 'false' && requestType !== 'query_evaluation') {
                          debug('Streaming usage found:', JSON.stringify(usage, null, 2))
                        }
                      }
                      
                      // Extract content for Slack
                      if (parsed.type === 'content_block_delta' && parsed.delta) {
                        if (parsed.delta.type === 'text_delta' && parsed.delta.text) {
                          streamedAssistantContent += parsed.delta.text
                        }
                      }
                      
                      // Track tool calls
                      if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
                        currentToolCall = {
                          name: parsed.content_block.name,
                          input: '',
                          id: parsed.content_block.id
                        }
                      }
                      
                      // Capture tool input from deltas
                      if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta' && currentToolCall) {
                        currentToolCall.input += parsed.delta.partial_json || ''
                      }
                      
                      if (parsed.type === 'content_block_stop' && currentToolCall) {
                        streamedToolCalls.push(currentToolCall)
                        currentToolCall = null
                      }
                      
                      // Extract model if available
                      if (parsed.model) {
                        streamedModel = parsed.model
                      }
                    } catch (e) {
                      // Ignore parse errors
                    }
                  }
                }
              }
            }
            
            // Track token usage if we found it
            if (usage) {
              // Claude API might use different field names
              const inputTokens = usage.input_tokens || usage.inputTokens || usage.prompt_tokens || 0
              const outputTokens = usage.output_tokens || usage.outputTokens || usage.completion_tokens || 0
              
              // Track token usage with tool calls count
              tokenTracker.track(requestHost, inputTokens, outputTokens, requestType, streamedToolCalls.length)
              
              if (DEBUG && DEBUG !== 'false' && requestType !== 'query_evaluation') {
                debug('Streaming token usage:', {
                  inputTokens,
                  outputTokens,
                  raw_usage: usage,
                  requestType: requestType || 'unknown'
                })
              }
            }
            
            // Send combined message to Slack for streaming responses
            if (requestType !== 'query_evaluation' && slackUserContent && (streamedAssistantContent || streamedToolCalls.length > 0)) {
              try {
                // Truncate assistant content to MAX_SLACK_LINES lines
                const lines = streamedAssistantContent.split('\n')
                if (lines.length > MAX_SLACK_LINES) {
                  streamedAssistantContent = lines.slice(0, MAX_SLACK_LINES).join('\n') + '\n... (truncated)'
                }
                
                // Format tool calls
                const toolCallsText: string[] = []
                if (streamedToolCalls.length > 0) {
                  streamedToolCalls.forEach((tool: any) => {
                    let inputStr = ''
                    
                    // Special handling for Edit/Read/Write and TodoWrite tools
                    if (['Edit', 'Read', 'Write', 'MultiEdit', 'NotebookEdit', 'NotebookRead', 'TodoWrite'].includes(tool.name)) {
                      try {
                        const parsedInput = tool.input ? JSON.parse(tool.input) : {}
                        
                        if (tool.name === 'TodoWrite') {
                          // Special handling for TodoWrite
                          const todos = parsedInput.todos || []
                          const pending = todos.filter((t: any) => t.status === 'pending').length
                          const inProgress = todos.filter((t: any) => t.status === 'in_progress').length
                          const completed = todos.filter((t: any) => t.status === 'completed').length
                          
                          const parts = []
                          if (pending > 0) parts.push(`${pending} pending`)
                          if (inProgress > 0) parts.push(`${inProgress} in progress`)
                          if (completed > 0) parts.push(`${completed} completed`)
                          
                          inputStr = ` - ${todos.length} todo${todos.length !== 1 ? 's' : ''} (${parts.join(', ')})`
                        } else {
                          const filePath = parsedInput.file_path || parsedInput.notebook_path || ''
                          if (filePath) {
                          // Get last 2 segments of the path
                          const segments = filePath.split('/')
                          const lastTwo = segments.slice(-2).join('/')
                          
                          // Add line count info based on tool type
                          let lineInfo = ''
                          if (tool.name === 'Read' || tool.name === 'NotebookRead') {
                            if (parsedInput.offset && parsedInput.limit) {
                              lineInfo = ` (lines ${parsedInput.offset}-${parsedInput.offset + parsedInput.limit - 1})`
                            } else if (parsedInput.limit) {
                              lineInfo = ` (${parsedInput.limit} lines)`
                            }
                          } else if (tool.name === 'Write') {
                            // Count lines in content
                            const lines = (parsedInput.content || '').split('\n').length
                            lineInfo = ` (${lines} lines)`
                          } else if (tool.name === 'MultiEdit' || tool.name === 'NotebookEdit') {
                            const editCount = parsedInput.edits?.length || 1
                            lineInfo = ` (${editCount} edit${editCount !== 1 ? 's' : ''})`
                          } else if (tool.name === 'Edit') {
                            lineInfo = parsedInput.replace_all ? ' (all occurrences)' : ''
                          }
                          
                          inputStr = ` - ${lastTwo}${lineInfo}`
                          }
                        }
                      } catch {
                        // If parsing fails, try to extract file path from raw input
                        const match = tool.input?.match(/"file_path"\s*:\s*"([^"]+)"/) || 
                                     tool.input?.match(/"notebook_path"\s*:\s*"([^"]+)"/)
                        if (match) {
                          const segments = match[1].split('/')
                          const lastTwo = segments.slice(-2).join('/')
                          inputStr = ` - ${lastTwo}`
                        }
                      }
                    } else if (tool.input) {
                      // Default formatting for other tools
                      try {
                        const parsedInput = JSON.parse(tool.input)
                        const fullInput = JSON.stringify(parsedInput)
                        const firstLine = fullInput.split('\n')[0]
                        inputStr = ` - ${firstLine.length > MAX_INPUT_PREVIEW_LENGTH ? firstLine.substring(0, MAX_INPUT_PREVIEW_LENGTH) + '...' : firstLine}`
                      } catch {
                        // If parsing fails, use raw input
                        const firstLine = tool.input.split('\n')[0]
                        inputStr = ` - ${firstLine.length > MAX_INPUT_PREVIEW_LENGTH ? firstLine.substring(0, MAX_INPUT_PREVIEW_LENGTH) + '...' : firstLine}`
                      }
                    }
                    
                    toolCallsText.push(`\n🔧 ${tool.name}${inputStr}`)
                  })
                }
                
                // Combine user and assistant messages
                let combinedContent = ''
                
                // Check if this is a tool-only response (no text content)
                const isToolOnlyResponse = !streamedAssistantContent.trim() && streamedToolCalls.length > 0
                
                if (isToolOnlyResponse) {
                  // For tool-only responses, just show the tool calls without "Claude:" prefix
                  combinedContent = toolCallsText.join('\n').trim()
                } else if (userMessageChanged) {
                  // Show full user message when it changed
                  combinedContent = `👤 User: ${slackUserContent}\n\n🤖 Claude: ${streamedAssistantContent}${toolCallsText.join('\n')}`
                } else {
                  // Just show Claude's response when no user change
                  combinedContent = `🤖 Claude: ${streamedAssistantContent}${toolCallsText.join('\n')}`
                }
                
                await sendToSlack({
                  requestId,
                  domain: requestHost,
                  model: streamedModel,
                  role: 'assistant',
                  content: combinedContent,
                  timestamp: new Date().toISOString(),
                  apiKey: maskApiKey(key || 'unknown'),
                  inputTokens: usage?.input_tokens || usage?.inputTokens || usage?.prompt_tokens,
                  outputTokens: usage?.output_tokens || usage?.outputTokens || usage?.completion_tokens
                }, domainSlackWebhook)
              } catch (slackError) {
                console.error('Failed to send streaming message to Slack:', slackError)
              }
            }
            
            // Store final streaming response in database if storage is enabled and not query_evaluation
            if (storageService && requestType !== 'query_evaluation') {
              try {
                const responseHeaders: Record<string, string> = {}
                claudeResponse.headers.forEach((value, key) => {
                  responseHeaders[key] = value
                })
                
                // Construct a summary response object
                const summaryResponse = {
                  type: 'message',
                  role: 'assistant',
                  content: streamedAssistantContent,
                  model: streamedModel,
                  tool_calls: streamedToolCalls,
                  usage: usage
                }
                
                await storageService.storeResponse(
                  requestId,
                  claudeResponse.status,
                  responseHeaders,
                  summaryResponse,
                  true, // streaming
                  Date.now() - startTime,
                  usage?.input_tokens || usage?.inputTokens || usage?.prompt_tokens,
                  usage?.output_tokens || usage?.outputTokens || usage?.completion_tokens,
                  streamedToolCalls.length,
                  claudeResponse.status >= 400 ? `${claudeResponse.status} ${claudeResponse.statusText}` : undefined
                )
              } catch (error) {
                console.error('Failed to store streaming response:', error)
              }
            }
            
            controller.close()
          } catch (err) {
            controller.error(err)
          }
        }
      })
      
      return new Response(stream, {
        status: claudeResponse.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      })
    } else {
      return c.json(responseData as any, claudeResponse.status as any)
    }
  } catch (err: any) {
    console.error(err)
    
    // Collect error telemetry
    const telemetryData: TelemetryData = {
      timestamp: new Date().toISOString(),
      requestId,
      method: 'POST',
      path: '/v1/messages',
      apiKey: requestApiKey || CLAUDE_API_KEY ? maskApiKey(requestApiKey || CLAUDE_API_KEY!) : undefined,
      status: 500,
      error: err.message,
      duration: Date.now() - startTime
    }
    
    sendTelemetry(TELEMETRY_ENDPOINT, telemetryData)
    
    // Track token usage (even for errors, count as 0 tokens)
    tokenTracker.track(requestHost, 0, 0, requestType, 0)
    
    // Send error to Slack
    try {
      await sendErrorToSlack(requestId, err.message, requestHost, domainSlackWebhook)
    } catch (slackError) {
      console.error('Failed to send error to Slack:', slackError)
    }
    
    // Store error response in database if storage is enabled and not query_evaluation
    // First ensure the request exists in the database
    if (storageService && requestType !== 'query_evaluation') {
      try {
        // If request wasn't stored yet (e.g., error before determining type), store it now
        if (!requestType) {
          await storageService.storeRequest(c, requestId, payload, 'unknown', true)
        }
        
        await storageService.storeResponse(
          requestId,
          500,
          {},
          { error: err.message },
          false,
          Date.now() - startTime,
          0,
          0,
          0,
          err.message
        )
      } catch (error) {
        console.error('Failed to store error response:', error)
      }
    }
    
    return c.json({ error: err.message }, 500)
  }
})

export default app
export { storageService }