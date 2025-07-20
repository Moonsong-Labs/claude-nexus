import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { ProxyApiClient } from '../services/api-client.js'
import { getErrorMessage } from '@claude-nexus/shared'
import { layout } from '../layout/index.js'
import { logger } from '../middleware/logger.js'
import { getDomainColor, formatNumber } from '../utils/chart-helpers.js'
import { generateChartScript } from '../utils/chart-scripts.js'

// Type definitions
interface DomainInfo {
  domain: string
  requestCount: number
}

interface HourlyDataPoint {
  hour: string
  count: number
}

interface HourlyUsageResponse {
  data: Record<string, HourlyDataPoint[]>
  query: {
    domain: string | null
    days: number
  }
}

interface DomainsResponse {
  domains: DomainInfo[]
}

export const requestUsageRoutes = new Hono<{
  Variables: {
    apiClient?: ProxyApiClient
  }
}>()

/**
 * Render the request chart visualization
 */
function renderRequestChart(
  chartData: HourlyDataPoint[] | Record<string, HourlyDataPoint[]>,
  displayDomain: string | null,
  domains: DomainInfo[]
) {
  const hasData = displayDomain
    ? Array.isArray(chartData) && chartData.length > 0
    : !Array.isArray(chartData) && Object.keys(chartData).length > 0

  if (!hasData) {
    return displayDomain
      ? html`<p class="text-gray-500">
          No request data available for the selected domain in the last 7 days.
        </p>`
      : html`<p class="text-gray-500">
          No request data available for any domain in the last 7 days.
        </p>`
  }

  const domainColors = domains.reduce((acc: Record<string, string>, d: DomainInfo) => {
    acc[d.domain] = getDomainColor(d.domain)
    return acc
  }, {})

  return html`
    <canvas id="hourlyChart" width="1000" height="400" style="width: 100%; height: 400px;"></canvas>
    ${raw(
      generateChartScript({
        chartId: 'hourlyChart',
        chartData,
        displayDomain,
        domainColors,
        chartType: 'requests',
      })
    )}

    <!-- Legend for multi-domain view -->
    ${!displayDomain
      ? html`
          <div style="margin-top: 20px; padding: 16px; background: #f9fafb; border-radius: 8px;">
            <div style="font-weight: 600; margin-bottom: 12px; color: #1f2937;">Domains:</div>
            <div style="display: flex; flex-wrap: wrap; gap: 16px;">
              ${raw(
                domains
                  .map(
                    (d: DomainInfo) => `
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <div
                          style="width: 16px; height: 16px; border-radius: 4px; background: ${getDomainColor(
                            d.domain
                          )};"
                        ></div>
                        <span style="font-size: 14px; color: #4b5563;">${d.domain}</span>
                      </div>
                    `
                  )
                  .join('')
              )}
            </div>
          </div>
        `
      : ''}
  `
}

/**
 * Render the token usage chart visualization
 */
function renderTokenChart(
  tokenChartData: HourlyDataPoint[] | Record<string, HourlyDataPoint[]>,
  displayDomain: string | null,
  domains: DomainInfo[]
) {
  const hasData = displayDomain
    ? Array.isArray(tokenChartData) && tokenChartData.length > 0
    : !Array.isArray(tokenChartData) && Object.keys(tokenChartData).length > 0

  if (!hasData) {
    return displayDomain
      ? html`<p class="text-gray-500">
          No token usage data available for the selected domain in the last 7 days.
        </p>`
      : html`<p class="text-gray-500">
          No token usage data available for any domain in the last 7 days.
        </p>`
  }

  const domainColors = domains.reduce((acc: Record<string, string>, d: DomainInfo) => {
    acc[d.domain] = getDomainColor(d.domain)
    return acc
  }, {})

  return html`
    <canvas id="tokenChart" width="1000" height="400" style="width: 100%; height: 400px;"></canvas>
    ${raw(
      generateChartScript({
        chartId: 'tokenChart',
        chartData: tokenChartData,
        displayDomain,
        domainColors,
        chartType: 'tokens',
      })
    )}
  `
}

/**
 * Render summary statistics for the usage data
 */
function renderSummaryStatistics(
  chartData: HourlyDataPoint[] | Record<string, HourlyDataPoint[]>,
  displayDomain: string | null
) {
  const hasData = displayDomain
    ? Array.isArray(chartData) && chartData.length > 0
    : !Array.isArray(chartData) && Object.keys(chartData).length > 0

  if (!hasData) {
    return ''
  }

  let totalRequests = 0
  let avgPerHour = 0
  let peakHour = { hour: '', count: 0 }
  let activeHours = 0

  if (displayDomain && Array.isArray(chartData)) {
    // Single domain stats
    totalRequests = chartData.reduce((sum: number, point: HourlyDataPoint) => sum + point.count, 0)
    avgPerHour = totalRequests / 168
    peakHour = chartData.reduce(
      (max: HourlyDataPoint, point: HourlyDataPoint) => (point.count > max.count ? point : max),
      chartData[0] || { hour: '', count: 0 }
    )
    activeHours = chartData.length
  } else {
    // Multi-domain stats
    const hourlyTotals = new Map<string, number>()

    Object.values(chartData).forEach((domainData: HourlyDataPoint[]) => {
      domainData.forEach(point => {
        const current = hourlyTotals.get(point.hour) || 0
        hourlyTotals.set(point.hour, current + point.count)
        totalRequests += point.count
      })
    })

    avgPerHour = totalRequests / 168
    activeHours = hourlyTotals.size

    // Find peak hour
    hourlyTotals.forEach((count, hour) => {
      if (count > peakHour.count) {
        peakHour = { hour, count }
      }
    })
  }

  return html`
    <div class="section">
      <div class="section-header">Summary Statistics</div>
      <div class="section-content">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Total Requests</div>
            <div class="stat-value">${formatNumber(totalRequests)}</div>
            <div class="stat-meta">Last 7 days</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Average per Hour</div>
            <div class="stat-value">${avgPerHour.toFixed(1)}</div>
            <div class="stat-meta">Across all hours</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Peak Hour</div>
            <div class="stat-value">${formatNumber(peakHour.count)}</div>
            <div class="stat-meta">${new Date(peakHour.hour).toLocaleString()}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Active Hours</div>
            <div class="stat-value">${activeHours}</div>
            <div class="stat-meta">Hours with requests</div>
          </div>
        </div>
      </div>
    </div>
  `
}

/**
 * Domain stats dashboard page
 */
requestUsageRoutes.get('/usage', async c => {
  const apiClient = c.get('apiClient')
  const selectedDomain = c.req.query('domain')

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

  try {
    // Fetch all domains for the selector
    const domainsResponse = await apiClient.get<DomainsResponse>('/api/domains')
    const domains = domainsResponse.domains || []

    // Use selected domain or null for all domains
    const displayDomain = selectedDomain || null

    // Fetch hourly usage data
    const usageParams = new URLSearchParams({ days: '7' })
    if (displayDomain) {
      usageParams.append('domain', displayDomain)
    }
    const usageResponse = await apiClient.get<HourlyUsageResponse>(
      `/api/usage/requests/hourly?${usageParams}`
    )
    const usageData = usageResponse.data || {}
    const chartData = displayDomain ? usageData[displayDomain] || [] : usageData

    // Fetch hourly token usage data
    const tokenResponse = await apiClient.get<HourlyUsageResponse>(
      `/api/usage/tokens/hourly?${usageParams}`
    )
    const tokenData = tokenResponse.data || {}
    const tokenChartData = displayDomain ? tokenData[displayDomain] || [] : tokenData

    const content = html`
      <div class="mb-6">
        <a href="/dashboard" class="text-blue-600">← Back to Dashboard</a>
      </div>

      <h2 style="margin: 0 0 1.5rem 0;">Domain Stats - Hourly Statistics</h2>

      <!-- Domain Selector -->
      <div class="section">
        <div class="section-header">Select Domain</div>
        <div class="section-content">
          <select
            id="domain-selector"
            name="domain"
            style="padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 0.375rem; font-size: 14px;"
            onchange="window.location.href = '/dashboard/usage' + (this.value ? '?domain=' + encodeURIComponent(this.value) : '')"
          >
            <option value="" ${!selectedDomain ? 'selected' : ''}>
              All Domains (${formatNumber(domains.reduce((sum, d) => sum + d.requestCount, 0))}
              requests)
            </option>
            ${domains.length > 0
              ? raw(
                  domains
                    .map(
                      (d: DomainInfo) =>
                        `<option
                          value="${d.domain}"
                          ${d.domain === displayDomain ? 'selected' : ''}
                        >
                          ${d.domain} (${formatNumber(d.requestCount)} requests)
                        </option>`
                    )
                    .join('')
                )
              : ''}
          </select>
        </div>
      </div>

      <!-- Hourly Usage Chart -->
      <div class="section">
        <div class="section-header">
          Hourly Request Count - Last 7 Days
          ${displayDomain
            ? html`<span class="text-sm text-gray-500">(${displayDomain})</span>`
            : html`<span class="text-sm text-gray-500">(All Domains)</span>`}
        </div>
        <div class="section-content">${renderRequestChart(chartData, displayDomain, domains)}</div>
      </div>

      <!-- Summary Statistics -->
      ${renderSummaryStatistics(chartData, displayDomain)}

      <!-- Hourly Token Usage Chart -->
      <div class="section">
        <div class="section-header">
          Hourly Output Token Usage - Last 7 Days
          ${displayDomain
            ? html`<span class="text-sm text-gray-500">(${displayDomain})</span>`
            : html`<span class="text-sm text-gray-500">(All Domains)</span>`}
        </div>
        <div class="section-content">
          ${renderTokenChart(tokenChartData, displayDomain, domains)}
        </div>
      </div>
    `

    return c.html(layout('Domain Stats', content))
  } catch (error) {
    logger.error('Failed to load request usage page', { error: getErrorMessage(error) })
    return c.html(
      layout(
        'Error',
        html`
          <div class="error-banner">
            <strong>Error:</strong> Failed to load domain stats data. Please try again later.
          </div>
          <div class="mt-4">
            <a href="/dashboard" class="text-blue-600">← Back to Dashboard</a>
          </div>
        `
      )
    )
  }
})
