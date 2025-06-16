import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { getCookie, setCookie } from 'hono/cookie'
import { ProxyApiClient } from '../services/api-client.js'
import { getErrorMessage } from '@claude-nexus/shared'

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
        
        .section { background: white; border-radius: 0.5rem; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); margin-bottom: 1.5rem; }
        .section-header { padding: 1rem 1.5rem; border-bottom: 1px solid #e5e7eb; font-weight: 500; }
        .section-content { padding: 1.5rem; }
        
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
      </style>
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
  
  try {
    // Fetch data from Proxy API
    const [statsResponse, requestsResponse, domainsResponse] = await Promise.all([
      apiClient.getStats({ domain }),
      apiClient.getRequests({ domain, limit: 20 }),
      apiClient.getDomains()
    ])
    
    // Update stats
    stats = {
      totalRequests: statsResponse.totalRequests,
      totalTokens: statsResponse.totalTokens,
      estimatedCost: (statsResponse.totalTokens / 1000) * 0.002,
      activeDomains: statsResponse.activeDomains,
    }
    
    // Update requests
    recentRequests = requestsResponse.requests
    
    // Update domains - convert string[] to expected format
    domains = domainsResponse.domains.map(d => ({ domain: d, requestCount: 0 }))
    
  } catch (err) {
    console.error('Failed to fetch dashboard data:', err)
    error = 'Failed to load dashboard data. Please try again later.'
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
 * Request details page
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
    
    const content = html`
      <div class="mb-6">
        <a href="/dashboard" class="text-blue-600">← Back to Dashboard</a>
      </div>
      
      <div class="section">
        <div class="section-header">Request Details</div>
        <div class="section-content">
          <dl style="display: grid; grid-template-columns: max-content 1fr; gap: 0.5rem 1rem;">
            <dt class="text-sm text-gray-600">Request ID:</dt>
            <dd class="text-sm">${details.requestId}</dd>
            
            <dt class="text-sm text-gray-600">Domain:</dt>
            <dd class="text-sm">${details.domain}</dd>
            
            <dt class="text-sm text-gray-600">Model:</dt>
            <dd class="text-sm">${details.model}</dd>
            
            <dt class="text-sm text-gray-600">Timestamp:</dt>
            <dd class="text-sm">${new Date(details.timestamp).toLocaleString()}</dd>
            
            <dt class="text-sm text-gray-600">Tokens:</dt>
            <dd class="text-sm">
              Input: ${details.inputTokens}, 
              Output: ${details.outputTokens}, 
              Total: ${details.totalTokens}
            </dd>
            
            <dt class="text-sm text-gray-600">Duration:</dt>
            <dd class="text-sm">${details.durationMs}ms</dd>
            
            <dt class="text-sm text-gray-600">Status:</dt>
            <dd class="text-sm">${details.responseStatus}</dd>
            
            ${details.error ? html`
              <dt class="text-sm text-gray-600">Error:</dt>
              <dd class="text-sm" style="color: #dc2626;">${details.error}</dd>
            ` : ''}
          </dl>
        </div>
      </div>
      
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