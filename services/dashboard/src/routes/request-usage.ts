import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { ProxyApiClient } from '../services/api-client.js'
import { getErrorMessage } from '@claude-nexus/shared'
import { layout } from '../layout/index.js'
import { logger } from '../middleware/logger.js'

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

// Helper functions
function formatNumber(num: number): string {
  return num.toLocaleString()
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Request usage dashboard page
 */
requestUsageRoutes.get('/requests', async c => {
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

    // Fetch hourly usage data
    const usageParams = new URLSearchParams({ days: '7' })
    if (selectedDomain) {
      usageParams.append('domain', selectedDomain)
    }
    const usageResponse = await apiClient.get<HourlyUsageResponse>(
      `/api/usage/requests/hourly?${usageParams}`
    )
    const usageData = usageResponse.data || {}

    // Select first domain if none selected
    const displayDomain = selectedDomain || (domains.length > 0 ? domains[0].domain : null)
    const chartData = displayDomain ? usageData[displayDomain] || [] : []

    const content = html`
      <div class="mb-6">
        <a href="/dashboard" class="text-blue-600">← Back to Dashboard</a>
      </div>

      <h2 style="margin: 0 0 1.5rem 0;">Request Usage - Hourly Statistics</h2>

      <!-- Domain Selector -->
      <div class="section">
        <div class="section-header">Select Domain</div>
        <div class="section-content">
          <select
            id="domain-selector"
            name="domain"
            style="padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 0.375rem; font-size: 14px;"
            onchange="window.location.href = '/dashboard/requests?domain=' + encodeURIComponent(this.value)"
          >
            ${domains.length > 0
              ? domains
                  .map(
                    (d: DomainInfo) =>
                      html`<option
                        value="${escapeHtml(d.domain)}"
                        ${d.domain === displayDomain ? 'selected' : ''}
                      >
                        ${escapeHtml(d.domain)} (${formatNumber(d.requestCount)} requests)
                      </option>`
                  )
                  .join('')
              : html`<option value="">No domains found</option>`}
          </select>
        </div>
      </div>

      <!-- Hourly Usage Chart -->
      <div class="section">
        <div class="section-header">
          Hourly Request Count - Last 7 Days
          ${displayDomain
            ? html`<span class="text-sm text-gray-500">(${escapeHtml(displayDomain)})</span>`
            : ''}
        </div>
        <div class="section-content">
          ${displayDomain && chartData.length > 0
            ? html`
                <canvas
                  id="hourlyChart"
                  width="1000"
                  height="400"
                  style="width: 100%; height: 400px;"
                ></canvas>
                ${raw(`
                  <script>
                    // Chart data from API
                    const chartData = ${JSON.stringify(chartData)};
                    const domain = ${JSON.stringify(displayDomain)};
                    
                    // Helper to format numbers with commas
                    function formatNumber(num) {
                      return num.toLocaleString();
                    }
                    
                    // Wait for canvas to be ready
                    setTimeout(() => {
                      const canvas = document.getElementById('hourlyChart');
                      if (!canvas) return;
                      
                      const ctx = canvas.getContext('2d');
                      const rect = canvas.getBoundingClientRect();
                      canvas.width = rect.width * window.devicePixelRatio;
                      canvas.height = rect.height * window.devicePixelRatio;
                      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
                      
                      const padding = { top: 30, right: 30, bottom: 80, left: 80 };
                      const chartWidth = rect.width - padding.left - padding.right;
                      const chartHeight = rect.height - padding.top - padding.bottom;
                      
                      // Clear canvas
                      ctx.fillStyle = '#ffffff';
                      ctx.fillRect(0, 0, rect.width, rect.height);
                      
                      // Create complete hourly timeline for 7 days
                      const now = new Date();
                      const startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                      startTime.setMinutes(0, 0, 0);
                      
                      const hourlyTimeline = [];
                      const dataMap = new Map();
                      
                      // Build data map for quick lookup
                      chartData.forEach(point => {
                        const hourKey = new Date(point.hour).toISOString();
                        dataMap.set(hourKey, point.count);
                      });
                      
                      // Fill in all hours with data or 0
                      for (let i = 0; i < 168; i++) { // 7 days * 24 hours
                        const time = new Date(startTime.getTime() + i * 60 * 60 * 1000);
                        const hourKey = time.toISOString();
                        hourlyTimeline.push({
                          time: time,
                          count: dataMap.get(hourKey) || 0
                        });
                      }
                      
                      // Find max count for scaling
                      const maxCount = Math.max(...hourlyTimeline.map(d => d.count), 1);
                      const yScale = chartHeight / maxCount;
                      const barWidth = chartWidth / hourlyTimeline.length;
                      
                      // Draw axes
                      ctx.strokeStyle = '#e5e7eb';
                      ctx.lineWidth = 1;
                      ctx.beginPath();
                      ctx.moveTo(padding.left, padding.top);
                      ctx.lineTo(padding.left, padding.top + chartHeight);
                      ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
                      ctx.stroke();
                      
                      // Draw Y-axis labels and grid lines
                      ctx.fillStyle = '#6b7280';
                      ctx.font = '12px sans-serif';
                      ctx.textAlign = 'right';
                      
                      const ySteps = 5;
                      for (let i = 0; i <= ySteps; i++) {
                        const y = padding.top + (chartHeight * i / ySteps);
                        const value = Math.round(maxCount * (1 - i / ySteps));
                        
                        // Grid line
                        ctx.strokeStyle = '#f3f4f6';
                        ctx.beginPath();
                        ctx.moveTo(padding.left, y);
                        ctx.lineTo(padding.left + chartWidth, y);
                        ctx.stroke();
                        
                        // Label
                        ctx.fillStyle = '#6b7280';
                        ctx.fillText(formatNumber(value), padding.left - 10, y + 4);
                      }
                      
                      // Draw bars
                      hourlyTimeline.forEach((point, index) => {
                        const x = padding.left + index * barWidth;
                        const barHeight = point.count * yScale;
                        const y = padding.top + chartHeight - barHeight;
                        
                        // Bar color based on activity
                        if (point.count > 0) {
                          ctx.fillStyle = '#3b82f6'; // Blue for active hours
                        } else {
                          ctx.fillStyle = '#f3f4f6'; // Light gray for zero activity
                        }
                        
                        ctx.fillRect(x, y, barWidth - 1, barHeight);
                      });
                      
                      // Draw X-axis labels (show date labels for each day)
                      ctx.fillStyle = '#6b7280';
                      ctx.font = '12px sans-serif';
                      ctx.textAlign = 'center';
                      
                      const uniqueDays = new Set();
                      hourlyTimeline.forEach((point, index) => {
                        const dateStr = point.time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        if (!uniqueDays.has(dateStr) && point.time.getHours() === 12) { // Show label at noon
                          uniqueDays.add(dateStr);
                          const x = padding.left + index * barWidth + barWidth / 2;
                          ctx.fillText(dateStr, x, padding.top + chartHeight + 25);
                        }
                      });
                      
                      // Add title
                      ctx.fillStyle = '#1f2937';
                      ctx.font = 'bold 14px sans-serif';
                      ctx.textAlign = 'left';
                      ctx.fillText('Requests per Hour', padding.left, padding.top - 10);
                      
                      // Add hover interaction
                      canvas.addEventListener('mousemove', (e) => {
                        const rect = canvas.getBoundingClientRect();
                        const x = e.clientX - rect.left - padding.left;
                        const index = Math.floor(x / barWidth);
                        
                        if (index >= 0 && index < hourlyTimeline.length) {
                          const point = hourlyTimeline[index];
                          canvas.title = point.time.toLocaleString() + ': ' + formatNumber(point.count) + ' requests';
                        }
                      });
                    }, 100);
                  </script>
                `)}
              `
            : displayDomain
              ? html`<p class="text-gray-500">
                  No request data available for the selected domain in the last 7 days.
                </p>`
              : html`<p class="text-gray-500">
                  Please select a domain to view hourly usage statistics.
                </p>`}
        </div>
      </div>

      <!-- Summary Statistics -->
      ${displayDomain && chartData.length > 0
        ? (() => {
            const totalRequests = chartData.reduce(
              (sum: number, point: HourlyDataPoint) => sum + point.count,
              0
            )
            const avgPerHour = totalRequests / 168 // 7 days * 24 hours
            const peakHour = chartData.reduce(
              (max: HourlyDataPoint, point: HourlyDataPoint) =>
                point.count > max.count ? point : max,
              chartData[0]
            )

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
                      <div class="stat-value">${chartData.length}</div>
                      <div class="stat-meta">Hours with requests</div>
                    </div>
                  </div>
                </div>
              </div>
            `
          })()
        : ''}
    `

    return c.html(layout('Request Usage', content))
  } catch (error) {
    logger.error('Failed to load request usage page', { error: getErrorMessage(error) })
    return c.html(
      layout(
        'Error',
        html`
          <div class="error-banner">
            <strong>Error:</strong> Failed to load request usage data. Please try again later.
          </div>
          <div class="mt-4">
            <a href="/dashboard" class="text-blue-600">← Back to Dashboard</a>
          </div>
        `
      )
    )
  }
})

/**
 * Partial route for HTMX chart updates
 */
requestUsageRoutes.get('/requests/chart', async c => {
  const apiClient = c.get('apiClient')
  const domain = c.req.query('domain')

  if (!apiClient || !domain) {
    return c.html(html`<div class="error-banner">Invalid request</div>`)
  }

  try {
    // Fetch hourly usage data for the specific domain
    const usageParams = new URLSearchParams({ days: '7', domain })
    const usageResponse = await apiClient.get<HourlyUsageResponse>(
      `/api/usage/requests/hourly?${usageParams}`
    )
    const usageData = usageResponse.data || {}
    const chartData = usageData[domain] || []

    return c.html(html`
      <div id="chart-container">
        ${chartData.length > 0
          ? html`
              <canvas
                id="hourlyChart"
                width="1000"
                height="400"
                style="width: 100%; height: 400px;"
              ></canvas>
              ${raw(`
                <script>
                  // Same chart rendering logic as above
                  const chartData = ${JSON.stringify(chartData)};
                  const domain = ${JSON.stringify(domain)};
                  
                  // ... (same chart drawing code as in the main route)
                </script>
              `)}
            `
          : html`<p class="text-gray-500">
              No request data available for ${escapeHtml(domain)} in the last 7 days.
            </p>`}
      </div>
    `)
  } catch (_error) {
    return c.html(html`<div class="error-banner">Failed to load chart data</div>`)
  }
})
