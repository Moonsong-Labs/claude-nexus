# Claude Nexus Proxy Dashboard

## Quick Start Architecture

### Minimal Implementation Path

Since this is a Hono-based proxy, we can start with a server-rendered dashboard using Hono's built-in capabilities before moving to a full SPA.

## Option 1: Server-Side Rendered (Fastest to implement)

```typescript
// src/dashboard/routes.ts
import { Hono } from 'hono'
import { html } from 'hono/html'

export const dashboardRoutes = new Hono()

// Simple HTML template with Tailwind CDN
dashboardRoutes.get('/', async (c) => {
  const stats = await getGlobalStats()
  
  return c.html(html`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Claude Nexus Dashboard</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://unpkg.com/htmx.org@1.9.10"></script>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      </head>
      <body class="bg-gray-100">
        <div class="container mx-auto p-4">
          <h1 class="text-3xl font-bold mb-4">Claude Nexus Dashboard</h1>
          
          <!-- Stats Cards -->
          <div class="grid grid-cols-3 gap-4 mb-8">
            <div class="bg-white p-6 rounded-lg shadow">
              <h2 class="text-gray-500 text-sm">Total Requests</h2>
              <p class="text-2xl font-bold">${stats.totalRequests}</p>
            </div>
            <div class="bg-white p-6 rounded-lg shadow">
              <h2 class="text-gray-500 text-sm">Total Tokens</h2>
              <p class="text-2xl font-bold">${stats.totalTokens}</p>
            </div>
            <div class="bg-white p-6 rounded-lg shadow">
              <h2 class="text-gray-500 text-sm">Active Domains</h2>
              <p class="text-2xl font-bold">${stats.activeDomains}</p>
            </div>
          </div>
          
          <!-- Live conversations with HTMX -->
          <div hx-get="/dashboard/api/conversations" 
               hx-trigger="load, every 5s"
               hx-swap="innerHTML">
            Loading conversations...
          </div>
        </div>
      </body>
    </html>
  `)
})

// API endpoint for HTMX updates
dashboardRoutes.get('/api/conversations', async (c) => {
  const conversations = await getRecentConversations()
  
  return c.html(html`
    <div class="bg-white rounded-lg shadow">
      <h2 class="text-xl font-bold p-4 border-b">Recent Conversations</h2>
      <div class="divide-y">
        ${conversations.map(conv => html`
          <div class="p-4 hover:bg-gray-50">
            <div class="flex justify-between">
              <span class="font-medium">${conv.domain}</span>
              <span class="text-gray-500">${conv.timestamp}</span>
            </div>
            <div class="text-sm text-gray-600 mt-1">
              ${conv.model} - ${conv.tokens} tokens
            </div>
          </div>
        `)}
      </div>
    </div>
  `)
})
```

## Option 2: Modern SPA with Vite (Better UX)

```bash
# Create dashboard as separate Vite project
cd src/dashboard
npm create vite@latest web -- --template react-ts
```

### Minimal React Dashboard

```tsx
// src/dashboard/web/src/App.tsx
import { useEffect, useState } from 'react'
import { Line } from 'react-chartjs-2'

interface Stats {
  totalRequests: number
  totalTokens: number
  activeDomains: number
  timeline: Array<{ time: string; requests: number }>
}

export default function App() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [conversations, setConversations] = useState([])

  useEffect(() => {
    // Fetch initial data
    fetch('/api/stats/overview')
      .then(res => res.json())
      .then(setStats)

    // Set up SSE for real-time updates
    const sse = new EventSource('/api/sse/dashboard')
    sse.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'conversation') {
        setConversations(prev => [data.payload, ...prev].slice(0, 50))
      }
    }

    return () => sse.close()
  }, [])

  if (!stats) return <div>Loading...</div>

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-3xl font-bold mb-8">Claude Nexus Dashboard</h1>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard title="Total Requests" value={stats.totalRequests} />
        <StatCard title="Total Tokens" value={stats.totalTokens} />
        <StatCard title="Active Domains" value={stats.activeDomains} />
      </div>

      {/* Charts */}
      <div className="bg-white p-6 rounded-lg shadow mb-8">
        <h2 className="text-xl font-bold mb-4">Request Timeline</h2>
        <Line data={chartData(stats.timeline)} />
      </div>

      {/* Live Conversations */}
      <ConversationList conversations={conversations} />
    </div>
  )
}
```

## Quick Implementation Steps

### 1. Start with Basic HTML Dashboard (1-2 days)
```typescript
// Add to src/app.ts
import { dashboardRoutes } from './dashboard/routes'

// Mount dashboard routes
app.route('/dashboard', dashboardRoutes)
```

### 2. Add Basic Authentication (1 day)
```typescript
// Simple API key based auth for dashboard
const dashboardAuth = (c: Context, next: Next) => {
  const key = c.req.header('X-Dashboard-Key')
  if (key !== process.env.DASHBOARD_API_KEY) {
    return c.text('Unauthorized', 401)
  }
  return next()
}

app.use('/dashboard/*', dashboardAuth)
```

### 3. Create Database Views (1 day)
```sql
-- Optimized views for dashboard queries
CREATE VIEW conversation_summary AS
SELECT 
  request_id as conversation_id,
  domain,
  model,
  timestamp,
  input_tokens + output_tokens as total_tokens,
  response_time_ms
FROM requests
ORDER BY timestamp DESC;

CREATE VIEW domain_stats AS
SELECT 
  domain,
  COUNT(*) as request_count,
  SUM(input_tokens + output_tokens) as total_tokens,
  MAX(timestamp) as last_active
FROM requests
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY domain;
```

### 4. Add Real-time Updates (1 day)
```typescript
// Server-Sent Events for live updates
app.get('/api/sse/dashboard', (c) => {
  return streamSSE(c, async (stream) => {
    // Subscribe to events
    eventEmitter.on('request', (data) => {
      stream.writeSSE({
        data: JSON.stringify({
          type: 'conversation',
          payload: data
        })
      })
    })
  })
})
```

## Fastest Path to Value

1. **Day 1**: Basic HTML dashboard with Tailwind + HTMX
2. **Day 2**: Add charts with Chart.js
3. **Day 3**: Database queries and caching
4. **Day 4**: Real-time updates with SSE
5. **Day 5**: Polish and deploy

This gives you a working dashboard in less than a week, which you can then enhance incrementally.