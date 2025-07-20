import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { ProxyApiClient } from '../../services/api-client.js'
import { getErrorMessage } from '@claude-nexus/shared'

export const analyticsPartialRoutes = new Hono<{
  Variables: {
    apiClient?: ProxyApiClient
  }
}>()

// Constants
const MAX_ACCOUNTS_TO_DISPLAY = 5
const MAX_DOMAINS_PER_ACCOUNT = 3
const CHART_WIDTH = 150
const CHART_HEIGHT = 60
const TOKEN_USAGE_THRESHOLDS = {
  CRITICAL: 90,
  WARNING: 70,
} as const

// Types
type AccountData = {
  accountId: string
  outputTokens: number
  inputTokens: number
  requestCount: number
  lastRequestTime: string
  remainingTokens: number
  percentageUsed: number
  domains: Array<{
    domain: string
    outputTokens: number
    requests: number
  }>
  miniSeries: Array<{
    time: string
    remaining: number
  }>
}

// Helper functions
/**
 * Formats a number for display with K/M suffixes
 */
function formatNumber(num: number): string {
  if (!num) {
    return '0'
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

/**
 * Escapes HTML special characters to prevent XSS
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Returns the appropriate color based on token usage percentage
 */
function getUsageColor(percentageUsed: number): string {
  if (percentageUsed > TOKEN_USAGE_THRESHOLDS.CRITICAL) {
    return '#ef4444'
  } // Red
  if (percentageUsed > TOKEN_USAGE_THRESHOLDS.WARNING) {
    return '#f59e0b'
  } // Yellow
  return '#10b981' // Green
}

/**
 * Renders an error panel for the analytics section
 */
function renderErrorPanel(message: string, expanded: boolean): ReturnType<typeof html> {
  return html`
    <div id="analytics-panel" class="section" style="margin-bottom: 1.5rem;">
      <div class="section-header" style="cursor: pointer;" onclick="toggleAnalytics()">
        <span style="display: flex; align-items: center; gap: 0.5rem;">
          <svg
            class="chevron-icon ${expanded ? 'chevron-down' : ''}"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          Analytics & Token Usage
        </span>
      </div>
      <div class="section-content" style="display: ${expanded ? 'block' : 'none'};">
        <div class="error-banner"><strong>Error:</strong> ${escapeHtml(message)}</div>
      </div>
    </div>
  `
}

/**
 * Generates the chart rendering script for a specific account
 */
function generateChartScript(chartId: string, account: AccountData, tokenLimit: number): string {
  return `
    (function() {
      const canvas = document.getElementById('${chartId}');
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      
      const data = ${JSON.stringify(account.miniSeries)};
      const tokenLimit = ${tokenLimit};
      
      // Draw background
      ctx.fillStyle = '#f9fafb';
      ctx.fillRect(0, 0, rect.width, rect.height);
      
      // Draw the line
      ctx.beginPath();
      ctx.lineWidth = 1.5;
      
      data.forEach((point, index) => {
        const x = (index / (data.length - 1)) * rect.width;
        const y = rect.height - (point.remaining / tokenLimit) * rect.height;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      // Color based on usage
      const percentageUsed = ${account.percentageUsed};
      let strokeColor = '${getUsageColor(account.percentageUsed)}';
      
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
      
      // Fill area
      ctx.lineTo(rect.width, rect.height);
      ctx.lineTo(0, rect.height);
      ctx.closePath();
      ctx.fillStyle = strokeColor + '20'; // Add transparency
      ctx.fill();
    })();
  `
}

/**
 * Renders a single domain badge
 */
function renderDomainBadge(
  domain: { domain: string; outputTokens: number },
  account: AccountData
): string {
  const percentage =
    account.outputTokens > 0 ? ((domain.outputTokens / account.outputTokens) * 100).toFixed(0) : '0'
  return `
    <div style="font-size: 11px; color: #6b7280; background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">
      <span style="color: #374151;">${escapeHtml(domain.domain)}:</span>
      ${formatNumber(domain.outputTokens)} tokens
      (${percentage}%)
    </div>
  `
}

/**
 * Renders a single account card with chart
 */
function renderAccountCard(
  account: AccountData,
  tokenLimit: number,
  domain: string | undefined
): string {
  const chartId = `chart-${account.accountId.replace(/[^a-zA-Z0-9]/g, '-')}`
  const usageColor = getUsageColor(account.percentageUsed)
  const filteredDomains = domain
    ? account.domains.filter(d => d.domain === domain)
    : account.domains
  const displayedDomains = filteredDomains.slice(0, MAX_DOMAINS_PER_ACCOUNT)
  const remainingDomains = account.domains.length - MAX_DOMAINS_PER_ACCOUNT

  return `
    <div style="height: 100px; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 10px; background: white;">
      <a href="/dashboard/token-usage?accountId=${encodeURIComponent(account.accountId)}" style="text-decoration: none; color: inherit; display: block;">
        <div style="display: flex; align-items: flex-start; gap: 15px; height: 100%;">
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 5px;">
              <strong style="font-size: 14px; color: #1f2937;">${escapeHtml(account.accountId)}</strong>
              <span style="font-size: 12px; color: ${usageColor};">
                ${formatNumber(account.outputTokens)} / ${formatNumber(tokenLimit)} tokens
                (${account.percentageUsed.toFixed(1)}% used)
              </span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px;">
              ${displayedDomains.map(d => renderDomainBadge(d, account)).join('')}
              ${
                remainingDomains > 0
                  ? `
                <div style="font-size: 11px; color: #6b7280; background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">
                  +${remainingDomains} more
                </div>
              `
                  : ''
              }
            </div>
          </div>
          <div style="width: ${CHART_WIDTH}px; height: ${CHART_HEIGHT}px; flex-shrink: 0;">
            <canvas id="${chartId}" style="width: 100%; height: 100%;"></canvas>
          </div>
        </div>
      </a>
    </div>
    ${raw(`<script>${generateChartScript(chartId, account, tokenLimit)}</script>`)}
  `
}

/**
 * Analytics panel partial - loaded via HTMX
 */
analyticsPartialRoutes.get('/partials/analytics', async c => {
  const apiClient = c.get('apiClient')
  const domain = c.req.query('domain')
  const expanded = c.req.query('expanded') === 'true'

  if (!apiClient) {
    return c.html(renderErrorPanel('API client not configured', expanded))
  }

  try {
    // Fetch account usage data
    const accountsData = await apiClient.getAccountsTokenUsage()
    const filteredAccounts = domain
      ? accountsData.accounts.filter(account => account.domains.some(d => d.domain === domain))
      : accountsData.accounts
    const displayedAccounts = filteredAccounts.slice(0, MAX_ACCOUNTS_TO_DISPLAY)

    const content = html`
      <div id="analytics-panel" class="section" style="margin-bottom: 1.5rem;">
        <div class="section-header" style="cursor: pointer;" onclick="toggleAnalytics()">
          <span style="display: flex; align-items: center; gap: 0.5rem;">
            <svg
              class="chevron-icon ${expanded ? 'chevron-down' : ''}"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            Analytics & Token Usage
            <span style="font-size: 0.75rem; color: #6b7280; margin-left: 0.5rem;">
              (${accountsData.accounts.length} active accounts)
            </span>
          </span>
          <a
            href="/dashboard/token-usage"
            class="btn btn-secondary"
            style="float: right; font-size: 0.75rem; padding: 0.25rem 0.75rem;"
            onclick="event.stopPropagation();"
          >
            Full Details
          </a>
        </div>
        <div class="section-content" style="display: ${expanded ? 'block' : 'none'};">
          ${displayedAccounts.length > 0
            ? html`
                <div style="display: flex; flex-direction: column; gap: 10px;">
                  ${raw(
                    displayedAccounts
                      .map(account => renderAccountCard(account, accountsData.tokenLimit, domain))
                      .join('')
                  )}
                </div>
                ${accountsData.accounts.length > MAX_ACCOUNTS_TO_DISPLAY
                  ? html`
                      <div style="margin-top: 1rem; text-align: center;">
                        <a href="/dashboard/token-usage" class="text-blue-600 text-sm">
                          View all ${accountsData.accounts.length} accounts →
                        </a>
                      </div>
                    `
                  : ''}
              `
            : html` <p class="text-gray-500">No active accounts found in the last 5 hours.</p> `}
        </div>
      </div>

      <style>
        .chevron-icon {
          transition: transform 0.2s ease;
        }
        .chevron-icon.chevron-down {
          transform: rotate(90deg);
        }
      </style>

      <script>
        function toggleAnalytics() {
          const panel = document.getElementById('analytics-panel')
          const content = panel.querySelector('.section-content')
          const chevron = panel.querySelector('.chevron-icon')
          const isExpanded = content.style.display === 'block'

          content.style.display = isExpanded ? 'none' : 'block'
          chevron.classList.toggle('chevron-down', !isExpanded)

          // Update URL parameter
          const url = new URL(window.location)
          if (!isExpanded) {
            url.searchParams.set('analytics', 'true')
          } else {
            url.searchParams.delete('analytics')
          }
          window.history.replaceState({}, '', url)

          // If expanding, reload the panel with expanded state
          if (!isExpanded) {
            htmx.ajax(
              'GET',
              '/partials/analytics?expanded=true${domain ? `&domain=${domain}` : ''}',
              {
                target: '#analytics-panel',
                swap: 'outerHTML',
              }
            )
          }
        }
      </script>
    `

    return c.html(content)
  } catch (error) {
    console.error('Failed to fetch analytics data:', getErrorMessage(error))
    return c.html(renderErrorPanel('Failed to load analytics data', expanded))
  }
})
