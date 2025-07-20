import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import {
  ProxyApiClient,
  type StatsResponse,
  type RequestSummary,
  type DomainsResponse,
} from '../services/api-client.js'
import { formatNumber, escapeHtml, formatRelativeTime } from '../utils/formatters.js'
import { layout } from '../layout/index.js'

// Constants
const COST_PER_1000_TOKENS = 0.002
const DEFAULT_REQUEST_LIMIT = 20

export const requestsRoutes = new Hono<{
  Variables: {
    apiClient?: ProxyApiClient
    domain?: string
  }
}>()

/**
 * Renders the stats cards section
 */
function renderStatsCards(stats: StatsResponse, estimatedCost: number): string {
  return html`
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
        <div class="stat-value">$${estimatedCost.toFixed(2)}</div>
        <div class="stat-meta">Based on token usage</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Domains</div>
        <div class="stat-value">${stats.activeDomains}</div>
        <div class="stat-meta">Unique domains</div>
      </div>
    </div>
  `.toString()
}

/**
 * Renders the requests table
 */
function renderRequestsTable(requests: RequestSummary[]): string {
  if (requests.length === 0) {
    return html`<p class="text-gray-500">No requests found</p>`.toString()
  }

  return html`
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
        ${raw(
          requests
            .map(
              req => `
        <tr>
          <td class="text-sm">${formatRelativeTime(req.timestamp)}</td>
          <td class="text-sm">${escapeHtml(req.domain)}</td>
          <td class="text-sm">${req.model || 'N/A'}</td>
          <td class="text-sm">${formatNumber(req.totalTokens || 0)}</td>
          <td class="text-sm">${req.responseStatus || 'N/A'}</td>
          <td class="text-sm">
            <a href="/dashboard/request/${req.requestId}" class="text-blue-600">View</a>
          </td>
        </tr>
      `
            )
            .join('')
        )}
      </tbody>
    </table>
  `.toString()
}

/**
 * Requests page - Shows recent API requests with statistics and filtering
 */
requestsRoutes.get('/requests', async c => {
  const apiClient = c.get('apiClient')
  const domain = c.req.query('domain')

  if (!apiClient) {
    return c.html(
      layout(
        'Error',
        html`
          <div class="error-banner">
            <strong>Error:</strong> API client not configured. Please check your configuration.
          </div>
        `
      )
    )
  }

  // Initialize typed default data
  let stats: StatsResponse = {
    totalRequests: 0,
    totalTokens: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    averageResponseTime: 0,
    errorCount: 0,
    activeDomains: 0,
    requestsByModel: {},
    requestsByType: {},
  }
  let recentRequests: RequestSummary[] = []
  let domains: DomainsResponse['domains'] = []
  let error: string | null = null

  // Fetch data from Proxy API with individual error handling
  const results = await Promise.allSettled([
    apiClient.getStats({ domain }),
    apiClient.getRequests({ domain, limit: DEFAULT_REQUEST_LIMIT }),
    apiClient.getDomains(),
  ])

  // Handle results with type safety
  if (results[0].status === 'fulfilled') {
    stats = results[0].value
  } else {
    console.error('Failed to fetch stats:', results[0].reason)
  }

  if (results[1].status === 'fulfilled') {
    recentRequests = results[1].value.requests
  } else {
    console.error('Failed to fetch requests:', results[1].reason)
  }

  if (results[2].status === 'fulfilled') {
    domains = results[2].value.domains
  } else {
    console.error('Failed to fetch domains:', results[2].reason)
  }

  // Only show error if critical data (stats or requests) failed
  if (results[0].status === 'rejected' || results[1].status === 'rejected') {
    error = 'Failed to load some dashboard data. Some features may be limited.'
  }

  // Calculate estimated cost
  const estimatedCost = (stats.totalTokens / 1000) * COST_PER_1000_TOKENS

  const content = html`
    ${error ? html`<div class="error-banner">${error}</div>` : ''}

    <div class="mb-6">
      <a href="/dashboard" class="text-blue-600">← Back to Dashboard</a>
    </div>

    <!-- Domain Filter -->
    <div class="mb-6">
      <label class="text-sm text-gray-600">Filter by Domain:</label>
      <select id="domain-filter" data-base-url="/dashboard/requests" class="ml-2">
        <option value="">All Domains</option>
        ${raw(
          domains
            .map(
              d =>
                `<option value="${d.domain}" ${domain === d.domain ? 'selected' : ''}>${d.domain} (${d.requestCount})</option>`
            )
            .join('')
        )}
      </select>
    </div>

    <!-- Stats Cards -->
    ${raw(renderStatsCards(stats, estimatedCost))}

    <!-- Recent Requests -->
    <div class="section">
      <div class="section-header">
        Recent Requests
        <a
          href="/dashboard/requests${domain ? '?domain=' + domain : ''}"
          class="btn btn-secondary refresh-btn"
          >Refresh</a
        >
      </div>
      <div class="section-content">${raw(renderRequestsTable(recentRequests))}</div>
    </div>

    <script>
      // Safe event delegation for domain filter
      document.addEventListener('DOMContentLoaded', function () {
        const domainFilter = document.getElementById('domain-filter')
        if (domainFilter) {
          domainFilter.addEventListener('change', function (e) {
            const baseUrl = e.target.getAttribute('data-base-url')
            const domain = e.target.value
            window.location.href = baseUrl + (domain ? '?domain=' + encodeURIComponent(domain) : '')
          })
        }
      })
    </script>
  `

  return c.html(layout('Requests', content))
})
