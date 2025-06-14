import { Hono } from 'hono'
import { html } from 'hono/html'
import { getCookie, setCookie } from 'hono/cookie'
import { Pool } from 'pg'
import { handleSSE, getSSEStats } from './sse'

export const dashboardRoutes = new Hono<{
  Variables: {
    pool?: Pool
    domain?: string
  }
}>()

/**
 * Dashboard HTML layout template
 */
const layout = (title: string, content: string) => html`
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - Claude Nexus Dashboard</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://unpkg.com/htmx.org@1.9.10"></script>
      <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1"></script>
      <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
      <style>
        [x-cloak] { display: none !important; }
        .pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
      </style>
    </head>
    <body class="bg-gray-50">
      <nav class="bg-white shadow-sm border-b">
        <div class="container mx-auto px-4 py-3">
          <div class="flex items-center justify-between">
            <h1 class="text-xl font-semibold text-gray-800">Claude Nexus Dashboard</h1>
            <div class="flex items-center space-x-4">
              <span class="text-sm text-gray-600" id="current-domain">All Domains</span>
              <button 
                class="text-sm text-blue-600 hover:text-blue-800"
                onclick="location.href='/dashboard/logout'"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main class="container mx-auto px-4 py-8">
        ${content}
      </main>
    </body>
  </html>
`

/**
 * Main dashboard page
 */
dashboardRoutes.get('/', async (c) => {
  const pool = c.get('pool')
  const domain = c.req.query('domain')
  
  // Get basic stats
  const stats = await getGlobalStats(pool, domain)
  
  const content = html`
    <div x-data="{ selectedDomain: '${domain || ''}' }">
      <!-- Domain Filter -->
      <div class="mb-6">
        <label class="block text-sm font-medium text-gray-700 mb-2">Filter by Domain</label>
        <select 
          x-model="selectedDomain"
          @change="window.location.href = '/dashboard' + (selectedDomain ? '?domain=' + selectedDomain : '')"
          class="block w-64 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">All Domains</option>
          ${stats.domains.map(d => html`<option value="${d}">${d}</option>`).join('')}
        </select>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div class="bg-white p-6 rounded-lg shadow-sm">
          <h3 class="text-sm font-medium text-gray-500">Total Requests</h3>
          <p class="text-2xl font-bold text-gray-900 mt-2" id="total-requests">${stats.totalRequests.toLocaleString()}</p>
          <p class="text-xs text-gray-500 mt-1">Last 24 hours</p>
        </div>
        <div class="bg-white p-6 rounded-lg shadow-sm">
          <h3 class="text-sm font-medium text-gray-500">Total Tokens</h3>
          <p class="text-2xl font-bold text-gray-900 mt-2" id="total-tokens">${formatNumber(stats.totalTokens)}</p>
          <p class="text-xs text-gray-500 mt-1">Input + Output</p>
        </div>
        <div class="bg-white p-6 rounded-lg shadow-sm">
          <h3 class="text-sm font-medium text-gray-500">Estimated Cost</h3>
          <p class="text-2xl font-bold text-gray-900 mt-2">$${stats.estimatedCost.toFixed(2)}</p>
          <p class="text-xs text-gray-500 mt-1">Based on token usage</p>
        </div>
        <div class="bg-white p-6 rounded-lg shadow-sm">
          <h3 class="text-sm font-medium text-gray-500">Active Domains</h3>
          <p class="text-2xl font-bold text-gray-900 mt-2">${stats.activeDomains}</p>
          <p class="text-xs text-gray-500 mt-1">Unique domains</p>
        </div>
      </div>

      <!-- Charts Section -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <!-- Timeline Chart -->
        <div class="bg-white p-6 rounded-lg shadow-sm">
          <h3 class="text-lg font-medium text-gray-900 mb-4">Request Timeline</h3>
          <canvas id="timelineChart" width="400" height="200"></canvas>
        </div>

        <!-- Model Distribution -->
        <div class="bg-white p-6 rounded-lg shadow-sm">
          <h3 class="text-lg font-medium text-gray-900 mb-4">Model Usage</h3>
          <canvas id="modelChart" width="400" height="200"></canvas>
        </div>
      </div>

      <!-- Recent Conversations -->
      <div class="bg-white rounded-lg shadow-sm">
        <div class="px-6 py-4 border-b">
          <h3 class="text-lg font-medium text-gray-900">Recent Conversations</h3>
        </div>
        <div 
          id="conversations-list"
          hx-get="/dashboard/api/conversations${domain ? '?domain=' + domain : ''}"
          hx-trigger="load, every 10s"
          hx-swap="innerHTML"
        >
          <div class="p-6 text-center text-gray-500">
            Loading conversations...
          </div>
        </div>
      </div>
    </div>

    <script>
      // Timeline Chart
      const timelineCtx = document.getElementById('timelineChart').getContext('2d');
      new Chart(timelineCtx, {
        type: 'line',
        data: {
          labels: ${JSON.stringify(stats.timeline.map(t => t.hour))},
          datasets: [{
            label: 'Requests',
            data: ${JSON.stringify(stats.timeline.map(t => t.count))},
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true }
          }
        }
      });

      // Model Distribution Chart
      const modelCtx = document.getElementById('modelChart').getContext('2d');
      new Chart(modelCtx, {
        type: 'doughnut',
        data: {
          labels: ${JSON.stringify(stats.modelUsage.map(m => m.model))},
          datasets: [{
            data: ${JSON.stringify(stats.modelUsage.map(m => m.count))},
            backgroundColor: [
              'rgb(59, 130, 246)',
              'rgb(34, 197, 94)',
              'rgb(251, 146, 60)',
              'rgb(163, 163, 163)'
            ]
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false
        }
      });

      // Set up SSE for real-time updates
      const eventSource = new EventSource('/dashboard/sse${domain ? '?domain=' + domain : ''}');
      
      eventSource.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        if (data.type === 'conversation') {
          // Show notification badge
          const badge = document.getElementById('new-conversation-badge');
          if (badge) {
            badge.classList.remove('hidden');
            badge.textContent = parseInt(badge.textContent || '0') + 1;
          }
          
          // Refresh conversations list
          htmx.trigger('#conversations-list', 'refresh');
        }
        
        if (data.type === 'metrics') {
          // Update stats cards with animation
          updateStat('total-requests', data.data.requests);
          updateStat('total-tokens', data.data.tokens);
        }
      };
      
      eventSource.onerror = function(err) {
        console.error('SSE connection error:', err);
      };
      
      function updateStat(id, value) {
        const el = document.getElementById(id);
        if (el) {
          el.classList.add('pulse');
          el.textContent = formatNumber(value);
          setTimeout(() => el.classList.remove('pulse'), 2000);
        }
      }
      
      function formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
      }
    </script>
  `
  
  return c.html(layout('Dashboard', content))
})

/**
 * Conversations API endpoint for HTMX
 */
dashboardRoutes.get('/api/conversations', async (c) => {
  const pool = c.get('pool')
  const domain = c.req.query('domain')
  const limit = parseInt(c.req.query('limit') || '20')
  
  const conversations = await getRecentConversations(pool, domain, limit)
  
  if (conversations.length === 0) {
    return c.html(html`
      <div class="p-6 text-center text-gray-500">
        No conversations found
      </div>
    `)
  }
  
  return c.html(html`
    <div class="divide-y divide-gray-200">
      ${conversations.map(conv => html`
        <div class="px-6 py-4 hover:bg-gray-50 cursor-pointer" onclick="window.location.href='/dashboard/conversation/${conv.id}'">
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="flex items-center space-x-3">
                <span class="font-medium text-gray-900">${conv.domain}</span>
                <span class="text-sm text-gray-500">${conv.model}</span>
              </div>
              <div class="mt-1 text-sm text-gray-600">
                ${conv.preview}
              </div>
            </div>
            <div class="text-right ml-4">
              <div class="text-sm text-gray-900">${formatNumber(conv.total_tokens)} tokens</div>
              <div class="text-xs text-gray-500">${formatTimestamp(conv.timestamp)}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `)
})

/**
 * Single conversation detail view
 */
dashboardRoutes.get('/conversation/:id', async (c) => {
  const pool = c.get('pool')
  const conversationId = c.req.param('id')
  
  const conversation = await getConversationDetail(pool, conversationId)
  
  if (!conversation) {
    return c.html(layout('Conversation Not Found', html`
      <div class="bg-white p-6 rounded-lg shadow-sm text-center">
        <p class="text-gray-500">Conversation not found</p>
        <a href="/dashboard" class="text-blue-600 hover:text-blue-800 mt-2 inline-block">
          Back to Dashboard
        </a>
      </div>
    `))
  }
  
  const content = html`
    <div class="mb-4">
      <a href="/dashboard" class="text-blue-600 hover:text-blue-800 text-sm">
        ← Back to Dashboard
      </a>
    </div>

    <div class="bg-white rounded-lg shadow-sm">
      <div class="px-6 py-4 border-b">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-medium text-gray-900">Conversation Details</h2>
            <p class="text-sm text-gray-500 mt-1">
              ${conversation.domain} • ${conversation.model} • ${formatTimestamp(conversation.timestamp)}
            </p>
          </div>
          <div class="text-right">
            <div class="text-sm text-gray-900">${formatNumber(conversation.total_tokens)} tokens</div>
            <div class="text-xs text-gray-500">≈ $${conversation.estimated_cost.toFixed(4)}</div>
          </div>
        </div>
      </div>

      <div class="p-6 space-y-4">
        <!-- Request -->
        <div class="bg-gray-50 rounded-lg p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="font-medium text-gray-700">Request</span>
            <span class="text-sm text-gray-500">${conversation.input_tokens} tokens</span>
          </div>
          <pre class="whitespace-pre-wrap text-sm text-gray-800">${escapeHtml(conversation.request)}</pre>
        </div>

        <!-- Response -->
        <div class="bg-blue-50 rounded-lg p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="font-medium text-gray-700">Response</span>
            <span class="text-sm text-gray-500">${conversation.output_tokens} tokens</span>
          </div>
          <pre class="whitespace-pre-wrap text-sm text-gray-800">${escapeHtml(conversation.response)}</pre>
        </div>

        <!-- Metadata -->
        <div class="bg-gray-100 rounded-lg p-4 mt-4">
          <h4 class="font-medium text-gray-700 mb-2">Request Details</h4>
          <dl class="grid grid-cols-2 gap-2 text-sm">
            <dt class="text-gray-500">Request ID:</dt>
            <dd class="font-mono text-gray-700">${conversation.request_id}</dd>
            <dt class="text-gray-500">Response Time:</dt>
            <dd class="text-gray-700">${conversation.response_time_ms}ms</dd>
            <dt class="text-gray-500">Stream:</dt>
            <dd class="text-gray-700">${conversation.stream ? 'Yes' : 'No'}</dd>
            <dt class="text-gray-500">Request Type:</dt>
            <dd class="text-gray-700">${conversation.request_type || 'N/A'}</dd>
          </dl>
        </div>
      </div>
    </div>
  `
  
  return c.html(layout('Conversation Detail', content))
})

/**
 * Login page
 */
dashboardRoutes.get('/login', (c) => {
  const content = html`
    <div class="max-w-md mx-auto mt-16">
      <div class="bg-white p-8 rounded-lg shadow-sm">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Dashboard Login</h2>
        <form method="POST" action="/dashboard/login">
          <div class="mb-4">
            <label for="key" class="block text-sm font-medium text-gray-700 mb-2">
              Dashboard API Key
            </label>
            <input
              type="password"
              name="key"
              id="key"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter your dashboard API key"
            />
          </div>
          <button
            type="submit"
            class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Login
          </button>
        </form>
        <p class="mt-4 text-sm text-gray-600 text-center">
          Set DASHBOARD_API_KEY environment variable to enable access
        </p>
      </div>
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

/**
 * SSE endpoint for real-time updates
 */
dashboardRoutes.get('/sse', handleSSE)

/**
 * SSE stats endpoint
 */
dashboardRoutes.get('/api/sse-stats', (c) => {
  return c.json({
    connections: getSSEStats(),
    timestamp: new Date().toISOString()
  })
})

// Helper functions
function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago'
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago'
  
  return date.toLocaleDateString()
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Database query functions
async function getGlobalStats(pool?: Pool, domain?: string) {
  if (!pool) {
    return {
      totalRequests: 0,
      totalTokens: 0,
      estimatedCost: 0,
      activeDomains: 0,
      domains: [],
      timeline: [],
      modelUsage: []
    }
  }

  const domainFilter = domain ? 'AND domain = $1' : ''
  const params = domain ? [domain] : []

  // Get basic stats
  const statsQuery = `
    SELECT 
      COUNT(*) as total_requests,
      COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
      COUNT(DISTINCT domain) as active_domains
    FROM requests
    WHERE timestamp > NOW() - INTERVAL '24 hours'
    ${domainFilter}
  `
  
  const stats = await pool.query(statsQuery, params)
  
  // Get all domains for filter
  const domainsQuery = `
    SELECT DISTINCT domain 
    FROM requests 
    WHERE timestamp > NOW() - INTERVAL '7 days'
    ORDER BY domain
  `
  const domains = await pool.query(domainsQuery)
  
  // Get timeline data (last 24 hours)
  const timelineQuery = `
    SELECT 
      DATE_TRUNC('hour', timestamp) as hour,
      COUNT(*) as count
    FROM requests
    WHERE timestamp > NOW() - INTERVAL '24 hours'
    ${domainFilter}
    GROUP BY hour
    ORDER BY hour
  `
  const timeline = await pool.query(timelineQuery, params)
  
  // Get model usage
  const modelQuery = `
    SELECT 
      model,
      COUNT(*) as count
    FROM requests
    WHERE timestamp > NOW() - INTERVAL '24 hours'
    ${domainFilter}
    GROUP BY model
    ORDER BY count DESC
  `
  const modelUsage = await pool.query(modelQuery, params)
  
  // Estimate cost (rough approximation)
  const totalTokens = parseInt(stats.rows[0].total_tokens)
  const estimatedCost = (totalTokens / 1000) * 0.015 // Rough average
  
  return {
    totalRequests: parseInt(stats.rows[0].total_requests),
    totalTokens: totalTokens,
    estimatedCost: estimatedCost,
    activeDomains: parseInt(stats.rows[0].active_domains),
    domains: domains.rows.map(r => r.domain),
    timeline: timeline.rows.map(r => ({
      hour: new Date(r.hour).toLocaleTimeString(),
      count: parseInt(r.count)
    })),
    modelUsage: modelUsage.rows.map(r => ({
      model: r.model,
      count: parseInt(r.count)
    }))
  }
}

async function getRecentConversations(pool?: Pool, domain?: string, limit: number = 20) {
  if (!pool) return []
  
  const domainFilter = domain ? 'WHERE domain = $1' : ''
  const params = domain ? [domain, limit] : [limit]
  const paramOffset = domain ? 2 : 1
  
  const query = `
    SELECT 
      request_id as id,
      domain,
      model,
      timestamp,
      input_tokens,
      output_tokens,
      input_tokens + output_tokens as total_tokens,
      SUBSTRING(request_body::text, 1, 100) as preview
    FROM requests
    ${domainFilter}
    ORDER BY timestamp DESC
    LIMIT $${paramOffset}
  `
  
  const result = await pool.query(query, params)
  return result.rows
}

async function getConversationDetail(pool?: Pool, conversationId: string) {
  if (!pool) return null
  
  const query = `
    SELECT 
      request_id,
      domain,
      model,
      timestamp,
      input_tokens,
      output_tokens,
      input_tokens + output_tokens as total_tokens,
      request_body::text as request,
      response_body::text as response,
      response_time_ms,
      stream,
      request_type
    FROM requests
    WHERE request_id = $1
  `
  
  const result = await pool.query(query, [conversationId])
  if (result.rows.length === 0) return null
  
  const conv = result.rows[0]
  const estimatedCost = (conv.total_tokens / 1000) * 0.015
  
  return {
    ...conv,
    estimated_cost: estimatedCost
  }
}