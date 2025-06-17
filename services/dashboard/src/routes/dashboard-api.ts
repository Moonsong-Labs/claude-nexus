import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { getCookie, setCookie } from 'hono/cookie'
import { ProxyApiClient } from '../services/api-client.js'
import { getErrorMessage } from '@claude-nexus/shared'
import { parseConversation, calculateCost, formatDuration, formatMessageTime } from '../utils/conversation.js'

export const dashboardRoutes = new Hono<{
  Variables: {
    apiClient?: ProxyApiClient
    domain?: string
  }
}>()

/**
 * Dashboard HTML layout template
 */
const layout = (title: string, content: any) => html`
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - Claude Nexus Dashboard</title>
      <style>
        * { box-sizing: border-box; }
        body { 
          margin: 0; 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          line-height: 1.5; 
          color: #1f2937; 
          background-color: #f9fafb; 
        }
        .container { max-width: 1280px; margin: 0 auto; padding: 0 1rem; }
        nav { background: white; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); border-bottom: 1px solid #e5e7eb; }
        nav .container { display: flex; justify-content: space-between; align-items: center; padding: 1rem; }
        h1 { font-size: 1.25rem; font-weight: 600; margin: 0; }
        h3 { font-size: 1.125rem; font-weight: 500; margin: 0 0 1rem 0; }
        
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
        .stat-card { background: white; padding: 1.5rem; border-radius: 0.5rem; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
        .stat-label { font-size: 0.875rem; color: #6b7280; }
        .stat-value { font-size: 1.5rem; font-weight: 700; margin: 0.5rem 0; }
        .stat-meta { font-size: 0.75rem; color: #9ca3af; }
        
        .section { background: white; border-radius: 0.375rem; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); margin-bottom: 1rem; border: 1px solid #e5e7eb; }
        .section-header { padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; font-weight: 500; font-size: 0.9rem; }
        .section-content { padding: 1rem; }
        
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 0.75rem; border-bottom: 1px solid #e5e7eb; font-size: 0.875rem; color: #6b7280; }
        td { padding: 0.75rem; border-bottom: 1px solid #f3f4f6; }
        tr:hover { background-color: #f9fafb; }
        
        .btn { 
          display: inline-block; 
          padding: 0.5rem 1rem; 
          background: #3b82f6; 
          color: white; 
          text-decoration: none; 
          border-radius: 0.375rem; 
          font-size: 0.875rem;
          border: none;
          cursor: pointer;
        }
        .btn:hover { background: #2563eb; }
        .btn-secondary { background: #6b7280; }
        .btn-secondary:hover { background: #4b5563; }
        
        select { 
          padding: 0.5rem; 
          border: 1px solid #d1d5db; 
          border-radius: 0.375rem; 
          font-size: 1rem;
          background: white;
        }
        
        .text-sm { font-size: 0.875rem; }
        .text-gray-500 { color: #6b7280; }
        .text-gray-600 { color: #4b5563; }
        .text-blue-600 { color: #2563eb; }
        .mb-6 { margin-bottom: 1.5rem; }
        .space-x-4 > * + * { margin-left: 1rem; }
        
        .error-banner {
          background: #fee;
          border: 1px solid #fcc;
          color: #c33;
          padding: 1rem;
          margin-bottom: 1rem;
          border-radius: 0.375rem;
        }
        
        /* Conversation view styles */
        .conversation-container {
          max-width: 1200px;
          margin: 0 auto;
        }
        
        .message {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
          font-size: 0.875rem;
          line-height: 1.4;
        }
        
        .message-meta {
          flex-shrink: 0;
          width: 65px;
          padding-top: 0.5rem;
        }
        
        .message-time {
          color: #9ca3af;
          font-size: 0.65rem;
          line-height: 1;
          margin-bottom: 0.2rem;
        }
        
        .message-role {
          font-weight: 500;
          color: #6b7280;
          font-size: 0.75rem;
          line-height: 1.2;
        }
        
        .message-content {
          flex: 1;
          padding: 0.5rem 0.75rem;
          border-radius: 0.375rem;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          min-width: 0; /* Allow flex item to shrink below content size */
          overflow: hidden;
        }
        
        .message-user .message-content {
          background: #eff6ff;
          border-color: #dbeafe;
        }
        
        .message-assistant .message-content {
          background: #f9fafb;
        }
        
        .message-system .message-content {
          background: #fef3c7;
          text-align: center;
          margin: 0 auto;
          max-width: 70%;
          font-size: 0.8rem;
        }
        
        .message-content pre {
          background: #1f2937;
          color: #f9fafb;
          padding: 0.5rem;
          border-radius: 0.25rem;
          overflow-x: auto;
          margin: 0.25rem 0;
          font-size: 0.8rem;
          max-width: 100%;
        }
        
        .message-content code {
          background: #e5e7eb;
          padding: 0.1rem 0.2rem;
          border-radius: 0.125rem;
          font-size: 0.8rem;
        }
        
        .message-content pre code {
          background: transparent;
          padding: 0;
        }
        
        .message-content p {
          margin: 0.25rem 0;
        }
        
        .message-content p:first-child {
          margin-top: 0;
        }
        
        .message-content p:last-child {
          margin-bottom: 0;
        }
        
        .message-truncated {
          position: relative;
        }
        
        .show-more-btn {
          color: #3b82f6;
          cursor: pointer;
          font-size: 0.75rem;
          margin-top: 0.25rem;
          display: inline-block;
        }
        
        .show-more-btn:hover {
          text-decoration: underline;
        }
        
        .view-toggle {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        
        .view-toggle button {
          padding: 0.5rem 1rem;
          border: 1px solid #d1d5db;
          background: white;
          border-radius: 0.375rem;
          cursor: pointer;
          font-size: 0.875rem;
        }
        
        .view-toggle button.active {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }
        
        .cost-info {
          display: inline-flex;
          gap: 1rem;
          font-size: 0.875rem;
          color: #6b7280;
        }
        
        .hidden {
          display: none;
        }
        
        /* Tool message styles */
        .message-tool-use .message-content {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-left: 3px solid #6b7280;
        }
        
        .message-tool-result .message-content {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-left: 3px solid #10b981;
        }
        
        .tool-header {
          font-weight: 600;
          color: #4b5563;
          margin-bottom: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .tool-icon {
          font-size: 1.2rem;
        }
        
        .tool-result-header {
          font-weight: 600;
          color: #4b5563;
          margin-bottom: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .message-tool-use pre,
        .message-tool-result pre {
          background: #1f2937;
          border: 1px solid #374151;
          color: #f9fafb;
          margin: 0.25rem 0;
          padding: 0.5rem;
          font-size: 0.75rem;
          max-width: 100%;
          overflow-x: auto;
        }
        
        /* For code inside tool messages, preserve JSON formatting */
        .message-tool-use pre code,
        .message-tool-result pre code {
          white-space: pre;
          word-wrap: normal;
          overflow-wrap: normal;
        }
        
        .message-tool-use code,
        .message-tool-result code {
          background: #1f2937;
          color: #f9fafb;
        }
        
        /* Dense headers */
        h1, h2, h3, h4, h5, h6 {
          margin: 0.5rem 0 0.25rem 0;
        }
        
        /* Reduce spacing in lists */
        ul, ol {
          margin: 0.25rem 0;
          padding-left: 1.5rem;
        }
        
        li {
          margin: 0.1rem 0;
        }
      </style>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css">
      <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"></script>
    </head>
    <body>
      <nav>
        <div class="container">
          <h1>Claude Nexus Dashboard</h1>
          <div class="space-x-4">
            <span class="text-sm text-gray-600" id="current-domain">All Domains</span>
            <a href="/dashboard/logout" class="text-sm text-blue-600">Logout</a>
          </div>
        </div>
      </nav>
      <main class="container" style="padding: 2rem 1rem;">
        ${content}
      </main>
    </body>
  </html>
`

/**
 * Helper functions
 */
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  
  return date.toLocaleString()
}

/**
 * Main dashboard page - Using Proxy API instead of direct database
 */
dashboardRoutes.get('/', async (c) => {
  const apiClient = c.get('apiClient')
  const domain = c.req.query('domain')
  
  if (!apiClient) {
    return c.html(layout('Error', html`
      <div class="error-banner">
        <strong>Error:</strong> API client not configured. Please check your configuration.
      </div>
    `))
  }
  
  // Initialize default data
  let stats = {
    totalRequests: 0,
    totalTokens: 0,
    estimatedCost: 0,
    activeDomains: 0,
  }
  let recentRequests: any[] = []
  let domains: Array<{ domain: string; requestCount: number }> = []
  let error: string | null = null
  
  // Fetch data from Proxy API with individual error handling
  const results = await Promise.allSettled([
    apiClient.getStats({ domain }),
    apiClient.getRequests({ domain, limit: 20 }),
    apiClient.getDomains()
  ])
  
  // Handle stats result
  if (results[0].status === 'fulfilled') {
    const statsResponse = results[0].value
    stats = {
      totalRequests: statsResponse.totalRequests,
      totalTokens: statsResponse.totalTokens,
      estimatedCost: (statsResponse.totalTokens / 1000) * 0.002,
      activeDomains: statsResponse.activeDomains,
    }
  } else {
    console.error('Failed to fetch stats:', results[0].reason)
  }
  
  // Handle requests result
  if (results[1].status === 'fulfilled') {
    recentRequests = results[1].value.requests
  } else {
    console.error('Failed to fetch requests:', results[1].reason)
  }
  
  // Handle domains result
  if (results[2].status === 'fulfilled') {
    domains = results[2].value.domains.map(d => ({ domain: d, requestCount: 0 }))
  } else {
    console.error('Failed to fetch domains:', results[2].reason)
    // Don't show error banner for domains failure since it's not critical
  }
  
  // Only show error if critical data (stats or requests) failed
  if (results[0].status === 'rejected' || results[1].status === 'rejected') {
    error = 'Failed to load some dashboard data. Some features may be limited.'
  }
  
  const content = html`
    ${error ? html`<div class="error-banner">${error}</div>` : ''}
    
    <!-- Domain Filter -->
    <div class="mb-6">
      <label class="text-sm text-gray-600">Filter by Domain:</label>
      <select onchange="window.location.href = '/dashboard' + (this.value ? '?domain=' + this.value : '')" style="margin-left: 0.5rem;">
        <option value="">All Domains</option>
        ${raw(domains.map(d => `<option value="${d.domain}" ${domain === d.domain ? 'selected' : ''}>${d.domain} (${d.requestCount})</option>`).join(''))}
      </select>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Requests</div>
        <div class="stat-value">${stats.totalRequests.toLocaleString()}</div>
        <div class="stat-meta">Last 24 hours</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Tokens</div>
        <div class="stat-value">${formatNumber(stats.totalTokens)}</div>
        <div class="stat-meta">Input + Output</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Estimated Cost</div>
        <div class="stat-value">$${stats.estimatedCost.toFixed(2)}</div>
        <div class="stat-meta">Based on token usage</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Domains</div>
        <div class="stat-value">${stats.activeDomains}</div>
        <div class="stat-meta">Unique domains</div>
      </div>
    </div>

    <!-- Recent Requests -->
    <div class="section">
      <div class="section-header">
        Recent Requests
        <a href="/dashboard${domain ? '?domain=' + domain : ''}" class="btn btn-secondary" style="float: right; font-size: 0.75rem; padding: 0.25rem 0.75rem;">Refresh</a>
      </div>
      <div class="section-content">
        ${recentRequests.length === 0 ? html`
          <p class="text-gray-500">No requests found</p>
        ` : html`
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Domain</th>
                <th>Model</th>
                <th>Tokens</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              ${raw(recentRequests.map(req => `
                <tr>
                  <td class="text-sm">${formatTimestamp(req.timestamp)}</td>
                  <td class="text-sm">${req.domain}</td>
                  <td class="text-sm">${req.model || 'N/A'}</td>
                  <td class="text-sm">${formatNumber(req.totalTokens || 0)}</td>
                  <td class="text-sm">${req.responseStatus || 'N/A'}</td>
                  <td class="text-sm">
                    <a href="/dashboard/request/${req.requestId}" class="text-blue-600">View</a>
                  </td>
                </tr>
              `).join(''))}
            </tbody>
          </table>
        `}
      </div>
    </div>
  `
  
  return c.html(layout('Dashboard', content))
})

/**
 * Request details page with conversation view
 */
dashboardRoutes.get('/request/:id', async (c) => {
  const apiClient = c.get('apiClient')
  const requestId = c.req.param('id')
  
  if (!apiClient) {
    return c.html(layout('Error', html`
      <div class="error-banner">
        <strong>Error:</strong> API client not configured.
      </div>
    `))
  }
  
  try {
    const details = await apiClient.getRequestDetails(requestId)
    
    // Parse conversation data
    const conversation = await parseConversation({
      request_body: details.requestBody,
      response_body: details.responseBody,
      request_tokens: details.inputTokens,
      response_tokens: details.outputTokens,
      model: details.model,
      duration: details.durationMs,
      status_code: details.responseStatus,
      timestamp: details.timestamp
    })
    
    // Calculate cost
    const cost = calculateCost(conversation.totalInputTokens, conversation.totalOutputTokens)
    
    // Format messages for display
    const messagesHtml = conversation.messages.map((msg, idx) => {
      const messageId = `message-${idx}`
      const contentId = `content-${idx}`
      const truncatedId = `truncated-${idx}`
      
      // Add special classes for tool messages
      let messageClass = `message message-${msg.role}`;
      if (msg.isToolUse) {
        messageClass += ' message-tool-use';
      } else if (msg.isToolResult) {
        messageClass += ' message-tool-result';
      }
      
      // Format role display
      let roleDisplay = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
      if (msg.isToolUse) {
        roleDisplay = 'Tool 🔧';
      } else if (msg.isToolResult) {
        roleDisplay = 'Result ✅';
      }
      
      return `
        <div class="${messageClass}">
          <div class="message-meta">
            <div class="message-time">${formatMessageTime(msg.timestamp)}</div>
            <div class="message-role">${roleDisplay}</div>
          </div>
          <div class="message-content">
            ${msg.isLong ? `
              <div id="${truncatedId}" class="message-truncated">
                ${msg.truncatedHtml}
                <span class="show-more-btn" onclick="toggleMessage('${messageId}')">Show more</span>
              </div>
              <div id="${contentId}" class="hidden">
                ${msg.htmlContent}
                <span class="show-more-btn" onclick="toggleMessage('${messageId}')">Show less</span>
              </div>
            ` : msg.htmlContent}
          </div>
        </div>
      `
    }).join('')
    
    const content = html`
      <div class="mb-6">
        <a href="/dashboard" class="text-blue-600">← Back to Dashboard</a>
      </div>
      
      <!-- Error Banner if present -->
      ${conversation.error ? html`
        <div class="error-banner">
          <strong>Error (${conversation.error.statusCode || 'Unknown'}):</strong> ${conversation.error.message}
        </div>
      ` : ''}
      
      <!-- Request Summary -->
      <div class="section">
        <div class="section-header">Request Summary</div>
        <div class="section-content">
          <dl style="display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; font-size: 0.875rem;">
            <dt class="text-gray-600">Request ID:</dt>
            <dd>${details.requestId}</dd>
            
            <dt class="text-gray-600">Domain:</dt>
            <dd>${details.domain}</dd>
            
            <dt class="text-gray-600">Model:</dt>
            <dd>${conversation.model}</dd>
            
            <dt class="text-gray-600">Timestamp:</dt>
            <dd>${new Date(details.timestamp).toLocaleString()}</dd>
            
            <dt class="text-gray-600">Tokens:</dt>
            <dd>
              <span class="cost-info" style="font-size: 0.8rem;">
                <span>Input: ${conversation.totalInputTokens.toLocaleString()}</span>
                <span>Output: ${conversation.totalOutputTokens.toLocaleString()}</span>
                <span>Total: ${(conversation.totalInputTokens + conversation.totalOutputTokens).toLocaleString()}</span>
              </span>
            </dd>
            
            <dt class="text-gray-600">Cost:</dt>
            <dd>${cost.formattedTotal}</dd>
            
            <dt class="text-gray-600">Duration:</dt>
            <dd>${formatDuration(conversation.duration)}</dd>
            
            <dt class="text-gray-600">Status:</dt>
            <dd>${details.responseStatus}</dd>
          </dl>
        </div>
      </div>
      
      <!-- View Toggle -->
      <div class="view-toggle">
        <button class="active" onclick="showView('conversation')">Conversation</button>
        <button onclick="showView('raw')">Raw JSON</button>
      </div>
      
      <!-- Conversation View -->
      <div id="conversation-view" class="conversation-container">
        ${raw(messagesHtml)}
      </div>
      
      <!-- Raw JSON View (hidden by default) -->
      <div id="raw-view" class="hidden">
        ${details.requestBody ? html`
          <div class="section">
            <div class="section-header">Request Body</div>
            <div class="section-content">
              <pre style="background: #f3f4f6; padding: 1rem; border-radius: 0.375rem; overflow-x: auto; font-size: 0.875rem;">${JSON.stringify(details.requestBody, null, 2)}</pre>
            </div>
          </div>
        ` : ''}
        
        ${details.responseBody ? html`
          <div class="section">
            <div class="section-header">Response Body</div>
            <div class="section-content">
              <pre style="background: #f3f4f6; padding: 1rem; border-radius: 0.375rem; overflow-x: auto; font-size: 0.875rem;">${JSON.stringify(details.responseBody, null, 2)}</pre>
            </div>
          </div>
        ` : ''}
        
        ${details.streamingChunks?.length > 0 ? html`
          <div class="section">
            <div class="section-header">Streaming Chunks (${details.streamingChunks.length})</div>
            <div class="section-content">
              <div style="max-height: 400px; overflow-y: auto;">
                ${raw(details.streamingChunks.map((chunk, i) => `
                  <div style="margin-bottom: 0.5rem; padding: 0.5rem; background: #f9fafb; border-radius: 0.25rem;">
                    <div class="text-sm text-gray-600">Chunk ${chunk.chunkIndex} - ${chunk.tokenCount || 0} tokens</div>
                    <pre style="margin: 0.25rem 0 0 0; font-size: 0.75rem; white-space: pre-wrap;">${chunk.data}</pre>
                  </div>
                `).join(''))}
              </div>
            </div>
          </div>
        ` : ''}
      </div>
      
      <!-- JavaScript for view toggling and message expansion -->
      <script>
        function showView(view) {
          const conversationView = document.getElementById('conversation-view');
          const rawView = document.getElementById('raw-view');
          const buttons = document.querySelectorAll('.view-toggle button');
          
          buttons.forEach(btn => btn.classList.remove('active'));
          
          if (view === 'conversation') {
            conversationView.classList.remove('hidden');
            rawView.classList.add('hidden');
            buttons[0].classList.add('active');
          } else {
            conversationView.classList.add('hidden');
            rawView.classList.remove('hidden');
            buttons[1].classList.add('active');
          }
        }
        
        function toggleMessage(messageId) {
          const idx = messageId.split('-')[1];
          const content = document.getElementById('content-' + idx);
          const truncated = document.getElementById('truncated-' + idx);
          
          if (content.classList.contains('hidden')) {
            content.classList.remove('hidden');
            truncated.classList.add('hidden');
          } else {
            content.classList.add('hidden');
            truncated.classList.remove('hidden');
          }
        }
        
        // Initialize syntax highlighting
        document.addEventListener('DOMContentLoaded', function() {
          hljs.highlightAll();
        });
      </script>
    `
    
    return c.html(layout('Request Details', content))
  } catch (error) {
    return c.html(layout('Error', html`
      <div class="error-banner">
        <strong>Error:</strong> ${getErrorMessage(error) || 'Failed to load request details'}
      </div>
      <div class="mb-6">
        <a href="/dashboard" class="text-blue-600">← Back to Dashboard</a>
      </div>
    `))
  }
})

/**
 * Login page
 */
dashboardRoutes.get('/login', (c) => {
  const content = html`
    <div style="max-width: 400px; margin: 4rem auto; background: white; padding: 2rem; border-radius: 0.5rem; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
      <h2 style="margin: 0 0 1.5rem 0;">Dashboard Login</h2>
      <form method="POST" action="/dashboard/login">
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; color: #374151;">API Key</label>
          <input
            type="password"
            name="key"
            required
            style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"
            placeholder="Enter your dashboard API key"
          />
        </div>
        <button type="submit" class="btn" style="width: 100%;">Login</button>
      </form>
      <p style="margin-top: 1rem; font-size: 0.875rem; color: #6b7280; text-align: center;">
        Set DASHBOARD_API_KEY environment variable
      </p>
    </div>
  `
  
  return c.html(layout('Login', content))
})

/**
 * Handle login POST
 */
dashboardRoutes.post('/login', async (c) => {
  const { key } = await c.req.parseBody()
  
  if (key === process.env.DASHBOARD_API_KEY) {
    setCookie(c, 'dashboard_auth', key as string, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    })
    return c.redirect('/dashboard')
  }
  
  return c.redirect('/dashboard/login?error=invalid')
})

/**
 * Logout
 */
dashboardRoutes.get('/logout', (c) => {
  setCookie(c, 'dashboard_auth', '', { maxAge: 0 })
  return c.redirect('/dashboard/login')
})