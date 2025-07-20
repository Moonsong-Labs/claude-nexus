import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { ProxyApiClient } from '../services/api-client.js'
import { getErrorMessage } from '@claude-nexus/shared'
import { layout } from '../layout/index.js'
import { formatNumber } from '../utils/chart-helpers.js'
import {
  generateMiniChartScript,
  generateProgressBar,
  generateTimeSeriesChartScript,
  getUsageColor,
  TOKEN_CHART_DIMENSIONS,
  type TimeSeriesData,
} from '../utils/token-usage-charts.js'
import {
  generateBackLink,
  generateDailyUsageTable,
  generateErrorBanner,
  generateRateLimitsTable,
  generateSection,
  generateTokenStatsGrid,
} from '../utils/token-usage-helpers.js'

export const tokenUsageRoutes = new Hono<{
  Variables: {
    apiClient?: ProxyApiClient
  }
}>()

/**
 * Escape HTML to prevent XSS
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
 * Token usage dashboard
 */
tokenUsageRoutes.get('/token-usage', async c => {
  const apiClient = c.get('apiClient')
  const accountId = c.req.query('accountId')
  const domain = c.req.query('domain')

  if (!apiClient) {
    return c.html(
      layout(
        'Error',
        generateErrorBanner('API client not configured. Please check your configuration.')
      )
    )
  }

  if (!accountId) {
    // Show all accounts overview
    try {
      const accountsData = await apiClient.getAccountsTokenUsage()

      const content = html`
        ${generateBackLink()}

        <h2 style="margin: 0 0 1.5rem 0;">Token Usage Overview - All Accounts</h2>

        ${generateSection(
          'Active Accounts (5-Hour Window)',
          accountsData.accounts.length > 0
            ? html`
                <div style="display: flex; flex-direction: column; gap: 10px;">
                  ${raw(
                    accountsData.accounts
                      .map(account => {
                        const chartId = `chart-${account.accountId.replace(/[^a-zA-Z0-9]/g, '-')}`

                        const miniChartScript = generateMiniChartScript(
                          chartId,
                          account.miniSeries,
                          accountsData.tokenLimit,
                          account.percentageUsed
                        )

                        return `
                    <div style="height: 100px; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 10px; background: white;">
                      <a href="/dashboard/token-usage?accountId=${encodeURIComponent(account.accountId)}" style="text-decoration: none; color: inherit; display: block;">
                        <div style="display: flex; align-items: flex-start; gap: 15px; height: 100%;">
                          <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 5px;">
                              <strong style="font-size: 14px; color: #1f2937;">${escapeHtml(account.accountId)}</strong>
                              <span style="font-size: 12px; color: ${getUsageColor(account.percentageUsed)};">
                                ${formatNumber(account.outputTokens)} / ${formatNumber(accountsData.tokenLimit)} tokens
                                (${account.percentageUsed.toFixed(1)}% used)
                              </span>
                            </div>
                            <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px;">
                              ${account.domains
                                .map(
                                  domain => `
                                <div style="font-size: 11px; color: #6b7280; background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">
                                  <span style="color: #374151;">${escapeHtml(domain.domain)}:</span>
                                  ${formatNumber(domain.outputTokens)} tokens
                                  (${((domain.outputTokens / account.outputTokens) * 100).toFixed(0)}%)
                                </div>
                              `
                                )
                                .join('')}
                            </div>
                          </div>
                          <div style="width: ${TOKEN_CHART_DIMENSIONS.miniChart.width}px; height: ${TOKEN_CHART_DIMENSIONS.miniChart.height}px; flex-shrink: 0;">
                            <canvas id="${chartId}" style="width: 100%; height: 100%;"></canvas>
                          </div>
                        </div>
                      </a>
                    </div>
                    ${raw(miniChartScript)}
                  `
                      })
                      .join('')
                  )}
                </div>
              `
            : html` <p class="text-gray-500">No active accounts found in the last 5 hours.</p> `
        )}
      `

      return c.html(layout('Token Usage Overview', content))
    } catch (error) {
      console.error('Failed to fetch accounts data:', getErrorMessage(error))
      return c.html(
        layout(
          'Token Usage',
          html`
            ${generateErrorBanner('Failed to load accounts data. Please try again later.')}
            ${generateBackLink()}
          `
        )
      )
    }
  }

  try {
    // Fetch all data in parallel
    const [tokenUsageWindow, dailyUsageResult, rateLimitsResult, timeSeriesResult] =
      await Promise.allSettled([
        apiClient.getTokenUsageWindow({ accountId, domain, window: 300 }), // 5 hour window
        apiClient.getDailyTokenUsage({ accountId, domain, days: 30, aggregate: true }),
        apiClient.getRateLimitConfigs({ accountId }),
        apiClient.getTokenUsageTimeSeries({ accountId, window: 5, interval: 5 }), // 5-hour window, 5-minute intervals
      ])

    // Handle results
    const tokenUsage = tokenUsageWindow.status === 'fulfilled' ? tokenUsageWindow.value : null
    const dailyUsage = dailyUsageResult.status === 'fulfilled' ? dailyUsageResult.value.usage : []
    const rateLimits = rateLimitsResult.status === 'fulfilled' ? rateLimitsResult.value.configs : []
    const timeSeries = timeSeriesResult.status === 'fulfilled' ? timeSeriesResult.value : null

    // Find the primary rate limit for this account
    const primaryLimit =
      rateLimits.find(limit => limit.accountId === accountId && !limit.model && !limit.domain) ||
      rateLimits[0]

    const content = html`
      ${generateBackLink()}

      <h2 style="margin: 0 0 1.5rem 0;">Token Usage for Account: ${escapeHtml(accountId)}</h2>

      ${generateSection(
        '5-Hour Sliding Window Usage (Output Tokens Only)',
        html`
          ${tokenUsage
            ? html`
                <div style="margin-bottom: 1.5rem;">
                  ${raw(
                    generateProgressBar(
                      tokenUsage.totalOutputTokens,
                      primaryLimit?.tokenLimit || 0,
                      'output tokens'
                    )
                  )}
                </div>

                ${generateTokenStatsGrid(tokenUsage)}
              `
            : html`
                <p class="text-gray-500">No token usage data available for this time window.</p>
              `}
        `,
        tokenUsage
          ? `Window: ${new Date(tokenUsage.windowStart).toLocaleTimeString()} - ${new Date(tokenUsage.windowEnd).toLocaleTimeString()}`
          : undefined
      )}
      ${generateSection(
        'Cumulative Token Usage Over Time (5-Hour Window)',
        html`
          ${timeSeries && timeSeries.timeSeries.length > 0
            ? (() => {
                const timeSeriesData: TimeSeriesData[] = timeSeries.timeSeries.map(point => ({
                  time: point.time,
                  remaining: point.remaining,
                  percentageUsed: point.percentageUsed,
                }))

                const chartScript = generateTimeSeriesChartScript(
                  'usageChart',
                  timeSeriesData,
                  timeSeries.tokenLimit
                )

                return html`
                  <div
                    style="width: ${TOKEN_CHART_DIMENSIONS.timeSeriesChart
                      .width}; height: ${TOKEN_CHART_DIMENSIONS.timeSeriesChart
                      .height}px; position: relative;"
                  >
                    <canvas id="usageChart" style="width: 100%; height: 100%;"></canvas>
                  </div>
                  ${raw(chartScript)}
                `
              })()
            : html` <p class="text-gray-500">No time series data available.</p> `}
        `
      )}
      ${generateSection(
        'Daily Token Usage (Last 30 Days)',
        dailyUsage.length > 0
          ? generateDailyUsageTable(dailyUsage)
          : html` <p class="text-gray-500">No daily usage data available.</p> `
      )}
      ${generateSection(
        'Rate Limit Configuration',
        rateLimits.length > 0
          ? generateRateLimitsTable(rateLimits)
          : html` <p class="text-gray-500">No rate limits configured for this account.</p> `
      )}
    `

    return c.html(layout('Token Usage', content))
  } catch (error) {
    return c.html(
      layout(
        'Error',
        html`
          ${generateErrorBanner(getErrorMessage(error) || 'Failed to load token usage data')}
          ${generateBackLink()}
        `
      )
    )
  }
})
