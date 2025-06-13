import { Hono } from 'hono'
import { env } from 'hono/adapter'
import { parseDomainCredentialMapping, getApiKey, getMaskedCredentialInfo, validateCredentialMapping, getFirstAvailableCredential, getAuthorizationHeaderForDomain } from './credentials'
import { initializeSlack, parseSlackConfig, sendToSlack, sendErrorToSlack } from './slack'
import { tokenTracker } from './tokenTracker'

// Note: Token tracking periodic reporting only works in Node.js mode
// Cloudflare Workers doesn't support setInterval for background tasks
// Use the /token-stats endpoint to get current statistics in Workers mode

const app = new Hono<{
  Bindings: {
    ANTHROPIC_PROXY_BASE_URL?: string
    CLAUDE_CODE_PROXY_API_KEY?: string
    REASONING_MODEL?: string
    COMPLETION_MODEL?: string
    REASONING_MAX_TOKENS?: string
    COMPLETION_MAX_TOKENS?: string
    DEBUG?: string
    PROXY_MODE?: string // 'translation' | 'passthrough'
    CLAUDE_API_KEY?: string // For passthrough mode
    TELEMETRY_ENDPOINT?: string
    DOMAIN_CREDENTIAL_MAPPING?: string // JSON mapping of domains to credential files
    SLACK_WEBHOOK_URL?: string
    SLACK_CHANNEL?: string
    SLACK_USERNAME?: string
    SLACK_ICON_EMOJI?: string
    SLACK_ENABLED?: string
  }
}>()


const defaultModel = 'openai/gpt-4.1'

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
  if (!key || key.length < 8) return 'unknown'
  if (key.length <= 10) return key
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
  const { ANTHROPIC_PROXY_BASE_URL, REASONING_MODEL, COMPLETION_MODEL, REASONING_MAX_TOKENS, COMPLETION_MAX_TOKENS, PROXY_MODE, DOMAIN_CREDENTIAL_MAPPING} = env(c)

  const domainMapping = parseDomainCredentialMapping(DOMAIN_CREDENTIAL_MAPPING)
  
  // Validate credential files
  const validationErrors = validateCredentialMapping(domainMapping)
  
  const maskedDomainMapping = Object.fromEntries(
    Object.entries(domainMapping).map(([domain, credPath]) => [
      domain,
      getMaskedCredentialInfo(credPath)
    ])
  )

  return c.json({
    status: validationErrors.length === 0 ? 'ok' : 'warning',
    message: 'Claude Code Proxy is running',
    config: {
      ANTHROPIC_PROXY_BASE_URL,
      REASONING_MODEL,
      COMPLETION_MODEL,
      REASONING_MAX_TOKENS,
      COMPLETION_MAX_TOKENS,
      PROXY_MODE: PROXY_MODE || 'translation',
      DOMAIN_MAPPINGS: Object.keys(domainMapping).length > 0 ? maskedDomainMapping : undefined
    },
    validation: validationErrors.length > 0 ? { errors: validationErrors } : undefined
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

app.post('/v1/messages', async (c) => {
  // Get environment variables from context
  const { CLAUDE_CODE_PROXY_API_KEY, ANTHROPIC_PROXY_BASE_URL, REASONING_MODEL, COMPLETION_MODEL, REASONING_MAX_TOKENS, COMPLETION_MAX_TOKENS, DEBUG, PROXY_MODE, CLAUDE_API_KEY, TELEMETRY_ENDPOINT, DOMAIN_CREDENTIAL_MAPPING, SLACK_WEBHOOK_URL, SLACK_CHANNEL, SLACK_USERNAME, SLACK_ICON_EMOJI, SLACK_ENABLED } = env(c)
  
  // Initialize Slack if configured
  const slackConfig = parseSlackConfig({ SLACK_WEBHOOK_URL, SLACK_CHANNEL, SLACK_USERNAME, SLACK_ICON_EMOJI, SLACK_ENABLED })
  initializeSlack(slackConfig)
  
  const startTime = Date.now()
  const requestId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)
  const mode = PROXY_MODE || 'translation'
  
  // Support API key override from request headers
  const authHeader = c.req.header('Authorization')
  const requestApiKey = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null
  const hasAuthorizationHeader = !!authHeader
  
  // Get the request hostname for domain-based mapping
  const requestHost = c.req.header('Host') || new URL(c.req.url).hostname
  
  // Parse domain credential mapping
  const domainMapping = parseDomainCredentialMapping(DOMAIN_CREDENTIAL_MAPPING)
  
  try {
    // Determine base URL and API key based on mode
    let baseUrl: string
    let key: string | null
    
    if (mode === 'passthrough') {
      // In passthrough mode, forward to Claude API
      baseUrl = 'https://api.anthropic.com'
      
      // API key selection priority:
      // 1. Request API key from Authorization header
      // 2. Domain-based credential mapping (if hostname matches)
      // 3. Default Claude API key
      // 4. Proxy API key (fallback)
      
      if (requestApiKey) {
        key = requestApiKey
      } else if (domainMapping[requestHost]) {
        // Load credential from file and get API key (handles OAuth refresh)
        key = await getApiKey(domainMapping[requestHost], DEBUG === 'true')
        if (DEBUG && DEBUG !== 'false') {
          debug(`Domain credential matched: ${requestHost} -> ${getMaskedCredentialInfo(domainMapping[requestHost])}`)
        }
      } else if (Object.keys(domainMapping).length > 0) {
        // No mapping for this host, use first available credential
        console.warn(`Warning: No credential mapping found for host '${requestHost}', using first available credential`)
        const firstCred = await getFirstAvailableCredential(domainMapping, DEBUG === 'true')
        if (firstCred) {
          key = firstCred.apiKey
          console.warn(`Using credential from domain '${firstCred.domain}'`)
        } else {
          console.error('Error: No valid credentials found in domain mapping')
          key = CLAUDE_API_KEY || CLAUDE_CODE_PROXY_API_KEY || null
        }
      } else {
        key = CLAUDE_API_KEY || CLAUDE_CODE_PROXY_API_KEY || null
      }
    } else {
      // Translation mode (existing behavior)
      baseUrl = ANTHROPIC_PROXY_BASE_URL || 'https://models.github.ai/inference'
      key = CLAUDE_CODE_PROXY_API_KEY || null
    }
    const models = {
      reasoning: REASONING_MODEL || defaultModel,
      completion: COMPLETION_MODEL || defaultModel,
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
    
    function maskApiKey(value: string): string {
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
    
    // Debug log incoming request headers
    if (DEBUG && DEBUG !== 'false') {
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
    }

    const payload = await c.req.json()
    
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
    
    if (DEBUG && DEBUG !== 'false') {
      debug('System message count:', systemMessageCount)
      debug('Request type:', requestType || 'unknown')
    }
    
    // Debug log request body
    if (DEBUG && DEBUG !== 'false') {
      // Create a deep copy and mask sensitive data
      const maskedPayload = JSON.parse(JSON.stringify(payload))
      
      // Mask API keys that might be in the payload
      const maskPayloadRecursive = (obj: any): any => {
        if (typeof obj === 'string') {
          return maskApiKey(obj)
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
    
    // Send user message to Slack
    try {
      const userMessage = payload.messages?.find((msg: any) => msg.role === 'user')
      if (userMessage) {
        await sendToSlack({
          requestId,
          domain: requestHost,
          model: payload.model,
          role: 'user',
          content: userMessage.content,
          timestamp: new Date().toISOString(),
          apiKey: maskApiKey(requestApiKey || (mode === 'passthrough' ? CLAUDE_API_KEY! : CLAUDE_CODE_PROXY_API_KEY!) || 'unknown')
        })
      }
    } catch (slackError) {
      console.error('Failed to send user message to Slack:', slackError)
    }
    
    // If in passthrough mode, forward request directly to Claude
    if (mode === 'passthrough') {
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
      if (key || hasAuthorizationHeader) {
        // If request came with Authorization header, preserve that format
        if (hasAuthorizationHeader && authHeader) {
          headers['Authorization'] = authHeader
          // Add beta header if it looks like an OAuth token
          if (authHeader.startsWith('Bearer ')) {
            headers['anthropic-beta'] = 'oauth-2025-04-20'
          }
        } else if (key) {
          // No authorization header in request, determine format from credential source
          let credentialPath = null
          
          if (domainMapping[requestHost]) {
            credentialPath = domainMapping[requestHost]
          } else if (Object.keys(domainMapping).length > 0 && !domainMapping[requestHost]) {
            // Using first available credential - need to find which one was actually used
            for (const [domain, path] of Object.entries(domainMapping)) {
              const testKey = await getApiKey(path, false)
              if (testKey === key) {
                credentialPath = path
                break
              }
            }
          }
          
          if (credentialPath) {
            const authHeaders = await getAuthorizationHeaderForDomain({ [requestHost]: credentialPath }, requestHost, DEBUG === 'true')
            if (authHeaders) {
              // Apply all headers from getAuthorizationHeaderForDomain
              Object.assign(headers, authHeaders)
              // Remove x-api-key if we're using OAuth (Authorization header)
              if (authHeaders['Authorization']) {
                delete headers['x-api-key']
              }
            } else {
              // Fallback to x-api-key
              headers['x-api-key'] = key
            }
          } else {
            // Direct API key (from request header or env vars)
            headers['x-api-key'] = key
          }
        }
      }
      
      debug('Passthrough mode - forwarding to Claude API')
      debug('URL:', `${baseUrl}/v1/messages`)
      
      // Debug log headers being sent
      if (DEBUG && DEBUG !== 'false') {
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
      
      // Debug log response
      if (DEBUG && DEBUG !== 'false') {
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
      
      // Debug log response body (non-streaming only)
      if (DEBUG && DEBUG !== 'false' && !payload.stream) {
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
        
        // Debug the entire response structure to find usage
        if (DEBUG && DEBUG !== 'false') {
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
          
          if (DEBUG && DEBUG !== 'false') {
            debug('Token usage extracted:', {
              input_tokens: telemetryData.inputTokens,
              output_tokens: telemetryData.outputTokens,
              raw_usage: usage
            })
          }
        } else {
          if (DEBUG && DEBUG !== 'false') {
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
      
      if (DEBUG && DEBUG !== 'false') {
        debug('Token tracking called with:', {
          domain: requestHost,
          inputTokens: telemetryData.inputTokens || 0,
          outputTokens: telemetryData.outputTokens || 0,
          requestType: requestType || 'unknown',
          toolCallCount
        })
      }
      
      // Send assistant message to Slack (non-streaming only)
      if (!payload.stream && responseData && typeof responseData === 'object' && 'content' in responseData) {
        try {
          const data = responseData as any
          const assistantContent = data.content?.map((item: any) => {
            if (item.type === 'text') return item.text
            if (item.type === 'tool_use') return `🔧 Tool: ${item.name}`
            return ''
          }).join('\n') || ''
          
          if (assistantContent) {
            await sendToSlack({
              requestId,
              domain: requestHost,
              model: data.model || payload.model,
              role: 'assistant',
              content: assistantContent,
              timestamp: new Date().toISOString(),
              apiKey: maskApiKey(key || 'unknown'),
              inputTokens: data.usage?.input_tokens || data.usage?.inputTokens || data.usage?.prompt_tokens,
              outputTokens: data.usage?.output_tokens || data.usage?.outputTokens || data.usage?.completion_tokens
            })
          }
        } catch (slackError) {
          console.error('Failed to send assistant message to Slack:', slackError)
        }
      }
      
      // Return the response
      if (payload.stream) {
        // For streaming in passthrough mode, we need to parse the stream to extract usage
        const reader = (responseData as ReadableStream).getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let usage: any = null
        
        const stream = new ReadableStream({
          async start(controller) {
            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                
                // Pass through the chunk
                controller.enqueue(value)
                
                // Also parse it to extract usage
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
                        if (parsed.usage) {
                          usage = parsed.usage
                          if (DEBUG && DEBUG !== 'false') {
                            debug('Streaming usage found:', JSON.stringify(usage, null, 2))
                          }
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
                
                // For streaming, we can't easily count tool calls without parsing all chunks
                // So we pass 0 for tool calls in streaming mode
                tokenTracker.track(requestHost, inputTokens, outputTokens, requestType, 0)
                
                if (DEBUG && DEBUG !== 'false') {
                  debug('Passthrough streaming token usage:', {
                    inputTokens,
                    outputTokens,
                    raw_usage: usage,
                    requestType: requestType || 'unknown'
                  })
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
    }

    // Helper to normalize a message's content
    const normalizeContent = (content: any): string | null => {
      if (typeof content === 'string') return content
      if (Array.isArray(content)) {
        return content.map(item => item.text).join(' ')
      }
      return null
    }

    // Build messages array for the OpenAI payload
    const messages: any[] = []
    if (payload.system && Array.isArray(payload.system)) {
      payload.system.forEach((sysMsg: any) => {
        const normalized = normalizeContent(sysMsg.text || sysMsg.content)
        if (normalized) {
          messages.push({
            role: 'system',
            content: normalized
          })
        }
      })
    }

    // Then add user (or other) messages
    if (payload.messages && Array.isArray(payload.messages)) {
      payload.messages.forEach((msg: any) => {
        // Skip messages with unsupported roles for some APIs
        if (!['user', 'assistant', 'system', 'tool', 'function'].includes(msg.role)) {
          console.warn(`Skipping message with unsupported role: ${msg.role}`)
          return
        }
        const toolCalls = (Array.isArray(msg.content) ? msg.content : [])
          .filter((item: any) => item.type === 'tool_use')
          .map((toolCall: any) => ({
            id: toolCall.id,
            type: 'function',
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.input),
            }
          }))

        const newMsg: any = { role: msg.role }
        const normalized = normalizeContent(msg.content)
        if (normalized) newMsg.content = normalized
        if (toolCalls.length > 0) newMsg.tool_calls = toolCalls
        if (newMsg.content || newMsg.tool_calls) messages.push(newMsg)

        if (Array.isArray(msg.content)) {
          const toolResults = msg.content.filter((item: any) => item.type === 'tool_result')
          toolResults.forEach((toolResult: any) => {
            messages.push({
              role: 'tool',
              content: toolResult.text || toolResult.content,
              tool_call_id: toolResult.tool_use_id,
            })
          })
        }
      })
    }

    // Helper function to recursively traverse JSON schema and remove format: 'uri'
    const removeUriFormat = (schema: any): any => {
      if (!schema || typeof schema !== 'object') return schema

      // If this is a string type with uri format, remove the format
      if (schema.type === 'string' && schema.format === 'uri') {
        const { format, ...rest } = schema
        return rest
      }

      // Handle array of schemas
      if (Array.isArray(schema)) {
        return schema.map(item => removeUriFormat(item))
      }

      // Recursively process all properties
      const result: any = {}
      for (const key in schema) {
        if (key === 'properties' && typeof schema[key] === 'object') {
          result[key] = {}
          for (const propKey in schema[key]) {
            result[key][propKey] = removeUriFormat(schema[key][propKey])
          }
        } else if (key === 'items' && typeof schema[key] === 'object') {
          result[key] = removeUriFormat(schema[key])
        } else if (key === 'additionalProperties' && typeof schema[key] === 'object') {
          result[key] = removeUriFormat(schema[key])
        } else if (['anyOf', 'allOf', 'oneOf'].includes(key) && Array.isArray(schema[key])) {
          result[key] = schema[key].map((item: any) => removeUriFormat(item))
        } else {
          result[key] = removeUriFormat(schema[key])
        }
      }
      return result
    }

    const tools = (payload.tools || [])
      .filter((tool: any) => !['BatchTool'].includes(tool.name))
      .map((tool: any) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: removeUriFormat(tool.input_schema),
        },
      }))

    const openaiPayload: any = {
      model: payload.thinking ? models.reasoning : models.completion,
      messages,
      temperature: payload.temperature !== undefined ? payload.temperature : 1,
      stream: payload.stream === true,
    }
    
    // Only add max_tokens if it's provided and not null/undefined
    if (payload.max_tokens !== null && payload.max_tokens !== undefined) {
      openaiPayload.max_tokens = payload.max_tokens
    }

    // Apply max_tokens override if configured
    const selectedModel = payload.thinking ? models.reasoning : models.completion
    const reasoningMaxTokens = REASONING_MAX_TOKENS ? parseInt(REASONING_MAX_TOKENS) : undefined
    const completionMaxTokens = COMPLETION_MAX_TOKENS ? parseInt(COMPLETION_MAX_TOKENS) : undefined
    
    if (selectedModel === models.reasoning && reasoningMaxTokens) {
      openaiPayload.max_tokens = reasoningMaxTokens
    } else if (selectedModel === models.completion && completionMaxTokens) {
      openaiPayload.max_tokens = completionMaxTokens
    }
    if (tools.length > 0) openaiPayload.tools = tools
    
    // Debug log translation mode details
    if (DEBUG && DEBUG !== 'false') {
      debug('=== Translation Mode ===')
      debug('OpenAI Payload:', JSON.stringify(openaiPayload, null, 2))
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (key) {
      headers['Authorization'] = `Bearer ${key}`
    }

    debug('Using base URL:', baseUrl)
    const maskedHeaders = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [
        key,
        key.toLowerCase() === 'authorization' ? maskBearer(value) : value
      ])
    )
    debug('Headers:', maskedHeaders)
    debug(`URL: ${baseUrl}/chat/completions`)

    const openaiResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(openaiPayload)
    })

    // Debug log OpenAI response
    if (DEBUG && DEBUG !== 'false') {
      debug('=== OpenAI API Response ===')
      debug('Status:', openaiResponse.status)
      debug('Status Text:', openaiResponse.statusText)
      const responseHeaders: Record<string, string> = {}
      openaiResponse.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })
      debug('Response Headers:', responseHeaders)
    }

    if (!openaiResponse.ok) {
      const errorDetails = await openaiResponse.text()
      console.error(`OpenAI API error (${openaiResponse.status}):`, errorDetails)
      console.error('Failed request payload:', JSON.stringify(openaiPayload, null, 2))
      return c.json({ error: errorDetails }, openaiResponse.status as any)
    }

    // If stream is not enabled, process the complete response
    if (!openaiPayload.stream) {
      const data: any = await openaiResponse.json()
      
      // Debug log response body
      if (DEBUG && DEBUG !== 'false') {
        debug('OpenAI Response Body:', JSON.stringify(data, null, 2))
      }
      if (data.error) {
        throw new Error(data.error.message)
      }

      const choice = data.choices[0]
      const openaiMessage = choice.message

      // Map finish_reason to anthropic stop_reason
      const stopReason = mapStopReason(choice.finish_reason)
      const toolCalls = openaiMessage.tool_calls || []

      // Create a message id
      const messageId = data.id
        ? data.id.replace('chatcmpl', 'msg')
        : 'msg_' + Math.random().toString(36).substring(2, 26)

      const anthropicResponse = {
        content: [
          {
            text: openaiMessage.content,
            type: 'text'
          },
          ...toolCalls.map((toolCall: any) => ({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.function.name,
            input: JSON.parse(toolCall.function.arguments),
          })),
        ],
        id: messageId,
        model: openaiPayload.model,
        role: openaiMessage.role,
        stop_reason: stopReason,
        stop_sequence: null,
        type: 'message',
        usage: {
          input_tokens: data.usage
            ? data.usage.prompt_tokens
            : messages.reduce((acc, msg) => acc + (msg.content?.split(' ').length || 0), 0),
          output_tokens: data.usage
            ? data.usage.completion_tokens
            : openaiMessage.content.split(' ').length,
        }
      }

      // Collect telemetry for translation mode
      const telemetryData: TelemetryData = {
        timestamp: new Date().toISOString(),
        requestId,
        method: 'POST',
        path: '/v1/messages',
        apiKey: key ? maskApiKey(key) : undefined,
        model: openaiPayload.model,
        inputTokens: anthropicResponse.usage.input_tokens,
        outputTokens: anthropicResponse.usage.output_tokens,
        status: 200,
        duration: Date.now() - startTime
      }
      
      sendTelemetry(TELEMETRY_ENDPOINT, telemetryData)
      
      // Count tool calls in the response (translation mode)
      let toolCallCount = 0
      if (anthropicResponse.content && Array.isArray(anthropicResponse.content)) {
        toolCallCount = anthropicResponse.content.filter((item: any) => item.type === 'tool_use').length
      }
      
      // Track token usage
      tokenTracker.track(requestHost, telemetryData.inputTokens || 0, telemetryData.outputTokens || 0, requestType, toolCallCount)
      
      if (DEBUG && DEBUG !== 'false') {
        debug('Token tracking called with:', {
          domain: requestHost,
          inputTokens: telemetryData.inputTokens || 0,
          outputTokens: telemetryData.outputTokens || 0,
          requestType: requestType || 'unknown',
          toolCallCount
        })
      }
      
      // Send assistant message to Slack
      try {
        const assistantContent = anthropicResponse.content.map((item: any) => {
          if (item.type === 'text') return item.text
          if (item.type === 'tool_use') return `🔧 Tool: ${item.name}`
          return ''
        }).join('\n')
        
        if (assistantContent) {
          await sendToSlack({
            requestId,
            domain: requestHost,
            model: anthropicResponse.model,
            role: 'assistant',
            content: assistantContent,
            timestamp: new Date().toISOString(),
            apiKey: maskApiKey(key || 'unknown'),
            inputTokens: anthropicResponse.usage.input_tokens,
            outputTokens: anthropicResponse.usage.output_tokens
          })
        }
      } catch (slackError) {
        console.error('Failed to send assistant message to Slack:', slackError)
      }
      
      // Debug log final response
      if (DEBUG && DEBUG !== 'false') {
        debug('=== Final Anthropic Response ===')
        debug('Response:', JSON.stringify(anthropicResponse, null, 2))
        debug('================================')
      }
      
      return c.json(anthropicResponse)
    }

    // Streaming response using Server-Sent Events
    return c.body(new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        const sendSSE = (event: string, data: any) => {
          const sseMessage = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
          controller.enqueue(encoder.encode(sseMessage))
        }

        let isSucceeded = false
        const messageId = 'msg_' + Math.random().toString(36).substring(2, 26)

        const sendSuccessMessage = () => {
          if (isSucceeded) return
          isSucceeded = true

          // Send initial SSE event for message start
          sendSSE('message_start', {
            type: 'message_start',
            message: {
              id: messageId,
              type: 'message',
              role: 'assistant',
              model: openaiPayload.model,
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 0, output_tokens: 0 },
            }
          })

          // Send initial ping
          sendSSE('ping', { type: 'ping' })
        }

        // Prepare for reading streamed data
        let accumulatedContent = ''
        let accumulatedReasoning = ''
        let usage: any = null
        let textBlockStarted = false
        let encounteredToolCall = false
        const toolCallAccumulators: Record<number, string> = {}
        const decoder = new TextDecoder('utf-8')
        const reader = openaiResponse.body!.getReader()
        let done = false
        let buffer = ''

        try {
          while (!done) {
            const { value, done: doneReading } = await reader.read()
            done = doneReading
            if (value) {
              const chunk = decoder.decode(value)
              
              // Debug streaming chunks
              if (DEBUG && DEBUG !== 'false') {
                debug('=== Streaming Chunk ===')
                debug('Chunk:', chunk)
                debug('======================')
              }
              
              // Append chunk to buffer to handle partial lines
              buffer += chunk
              const lines = buffer.split('\n')
              
              // Keep the last line in buffer if it doesn't end with newline
              // (it might be incomplete)
              if (!buffer.endsWith('\n')) {
                buffer = lines.pop() || ''
              } else {
                buffer = ''
              }

              for (const line of lines) {
                const trimmed = line.trim()
                if (trimmed === '' || !trimmed.startsWith('data:')) continue
                const dataStr = trimmed.replace(/^data:\s*/, '')
                if (dataStr === '[DONE]') {
                  // Finalize the stream with stop events
                  if (encounteredToolCall) {
                    for (const idx in toolCallAccumulators) {
                      sendSSE('content_block_stop', {
                        type: 'content_block_stop',
                        index: parseInt(idx, 10)
                      })
                    }
                  } else if (textBlockStarted) {
                    sendSSE('content_block_stop', {
                      type: 'content_block_stop',
                      index: 0
                    })
                  }
                  sendSSE('message_delta', {
                    type: 'message_delta',
                    delta: {
                      stop_reason: encounteredToolCall ? 'tool_use' : 'end_turn',
                      stop_sequence: null
                    },
                    usage: usage
                      ? { output_tokens: usage.completion_tokens }
                      : { output_tokens: accumulatedContent.split(' ').length + accumulatedReasoning.split(' ').length }
                  })
                  sendSSE('message_stop', {
                    type: 'message_stop'
                  })
                  
                  // Collect telemetry for streaming
                  const telemetryData: TelemetryData = {
                    timestamp: new Date().toISOString(),
                    requestId,
                    method: 'POST',
                    path: '/v1/messages',
                    apiKey: key ? maskApiKey(key) : undefined,
                    model: openaiPayload.model,
                    inputTokens: usage?.prompt_tokens,
                    outputTokens: usage?.completion_tokens || accumulatedContent.split(' ').length,
                    status: 200,
                    duration: Date.now() - startTime
                  }
                  
                  sendTelemetry(TELEMETRY_ENDPOINT, telemetryData)
                  
                  // Count tool calls in streaming response
                  let streamToolCallCount = 0
                  if (encounteredToolCall) {
                    streamToolCallCount = Object.keys(toolCallAccumulators).length
                  }
                  
                  // Track token usage
                  tokenTracker.track(requestHost, telemetryData.inputTokens || 0, telemetryData.outputTokens || 0, requestType, streamToolCallCount)
                  
                  // Send assistant message to Slack for streaming response
                  try {
                    let assistantContent = accumulatedContent
                    if (accumulatedReasoning) {
                      assistantContent = `🤔 Thinking: ${accumulatedReasoning}\n\n${assistantContent}`
                    }
                    
                    // Add tool call information
                    if (encounteredToolCall) {
                      const toolInfo = Object.entries(toolCallAccumulators).map(([idx, args]) => {
                        try {
                          const parsed = JSON.parse(args)
                          return `🔧 Tool call ${idx}`
                        } catch {
                          return `🔧 Tool call ${idx}`
                        }
                      }).join(', ')
                      if (toolInfo) {
                        assistantContent += `\n${toolInfo}`
                      }
                    }
                    
                    if (assistantContent) {
                      await sendToSlack({
                        requestId,
                        domain: requestHost,
                        model: openaiPayload.model,
                        role: 'assistant',
                        content: assistantContent,
                        timestamp: new Date().toISOString(),
                        apiKey: maskApiKey(key || 'unknown'),
                        inputTokens: usage?.prompt_tokens || usage?.input_tokens || usage?.inputTokens,
                        outputTokens: usage?.completion_tokens || usage?.output_tokens || usage?.outputTokens || accumulatedContent.split(' ').length
                      })
                    }
                  } catch (slackError) {
                    console.error('Failed to send streaming assistant message to Slack:', slackError)
                  }
                  
                  controller.close()
                  return
                }

                try {
                  const parsed = JSON.parse(dataStr)
                  if (parsed.error) {
                    throw new Error(parsed.error.message)
                  }
                  sendSuccessMessage()

                  // Capture usage if available
                  if (parsed.usage) {
                    usage = parsed.usage
                    if (DEBUG && DEBUG !== 'false') {
                      debug('Streaming usage data received:', JSON.stringify(usage, null, 2))
                      debug('Usage object keys:', Object.keys(usage || {}))
                    }
                  }
                  
                  // Also check for usage in other parts of the response
                  if (!usage && parsed.delta && parsed.delta.usage) {
                    usage = parsed.delta.usage
                    if (DEBUG && DEBUG !== 'false') {
                      debug('Found usage in delta:', JSON.stringify(usage, null, 2))
                    }
                  }

                  const delta = parsed.choices[0].delta
                  if (delta && delta.tool_calls) {
                    for (const toolCall of delta.tool_calls) {
                      encounteredToolCall = true
                      const idx = toolCall.index
                      if (toolCallAccumulators[idx] === undefined) {
                        toolCallAccumulators[idx] = ""
                        sendSSE('content_block_start', {
                          type: 'content_block_start',
                          index: idx,
                          content_block: {
                            type: 'tool_use',
                            id: toolCall.id,
                            name: toolCall.function.name,
                            input: {}
                          }
                        })
                      }
                      const newArgs = toolCall.function.arguments || ""
                      const oldArgs = toolCallAccumulators[idx]
                      if (newArgs.length > oldArgs.length) {
                        const deltaText = newArgs.substring(oldArgs.length)
                        sendSSE('content_block_delta', {
                          type: 'content_block_delta',
                          index: idx,
                          delta: {
                            type: 'input_json_delta',
                            partial_json: deltaText
                          }
                        })
                        toolCallAccumulators[idx] = newArgs
                      }
                    }
                  } else if (delta && delta.content) {
                    if (!textBlockStarted) {
                      textBlockStarted = true
                      sendSSE('content_block_start', {
                        type: 'content_block_start',
                        index: 0,
                        content_block: {
                          type: 'text',
                          text: ''
                        }
                      })
                    }
                    accumulatedContent += delta.content
                    sendSSE('content_block_delta', {
                      type: 'content_block_delta',
                      index: 0,
                      delta: {
                        type: 'text_delta',
                        text: delta.content
                      }
                    })
                  } else if (delta && delta.reasoning) {
                    if (!textBlockStarted) {
                      textBlockStarted = true
                      sendSSE('content_block_start', {
                        type: 'content_block_start',
                        index: 0,
                        content_block: {
                          type: 'text',
                          text: ''
                        }
                      })
                    }
                    accumulatedReasoning += delta.reasoning
                    sendSSE('content_block_delta', {
                      type: 'content_block_delta',
                      index: 0,
                      delta: {
                        type: 'thinking_delta',
                        thinking: delta.reasoning
                      }
                    })
                  }
                } catch (e) {
                  // Skip invalid JSON lines
                  continue
                }
              }
            }
          }
          
          // Process any remaining buffer content
          if (buffer.trim()) {
            debug('Processing remaining buffer:', buffer)
            const lines = buffer.split('\n')
            for (const line of lines) {
              const trimmed = line.trim()
              if (trimmed && trimmed.startsWith('data:')) {
                try {
                  const dataStr = trimmed.replace(/^data:\s*/, '')
                  if (dataStr !== '[DONE]') {
                    const parsed = JSON.parse(dataStr)
                    // Process the final chunk (same logic as above)
                    debug('Final chunk data:', parsed)
                  }
                } catch (e) {
                  debug('Failed to parse final buffer:', e)
                }
              }
            }
          }
        } catch (error) {
          console.error('Streaming error:', error)
          controller.error(error)
        } finally {
          try {
            controller.close()
          } catch {
            // Controller already closed, ignore
          }
        }
      }
    }), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  } catch (err: any) {
    console.error(err)
    
    // Collect error telemetry
    const telemetryData: TelemetryData = {
      timestamp: new Date().toISOString(),
      requestId,
      method: 'POST',
      path: '/v1/messages',
      apiKey: requestApiKey || (mode === 'passthrough' ? CLAUDE_API_KEY : CLAUDE_CODE_PROXY_API_KEY) ? maskApiKey(requestApiKey || (mode === 'passthrough' ? CLAUDE_API_KEY! : CLAUDE_CODE_PROXY_API_KEY!)) : undefined,
      status: 500,
      error: err.message,
      duration: Date.now() - startTime
    }
    
    sendTelemetry(TELEMETRY_ENDPOINT, telemetryData)
    
    // Track token usage (even for errors, count as 0 tokens)
    tokenTracker.track(requestHost, 0, 0, requestType, 0)
    
    // Send error to Slack
    try {
      await sendErrorToSlack(requestId, err.message, requestHost)
    } catch (slackError) {
      console.error('Failed to send error to Slack:', slackError)
    }
    
    return c.json({ error: err.message }, 500)
  }
})


function mapStopReason(finishReason: string): string {
  switch (finishReason) {
    case 'tool_calls': return 'tool_use'
    case 'stop': return 'end_turn'
    case 'length': return 'max_tokens'
    default: return 'end_turn'
  }
}

export default app
