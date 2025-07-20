/**
 * Helper functions for token usage route
 */

import { html } from 'hono/html'
import { formatNumber } from './chart-helpers.js'

interface TokenStats {
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  totalRequests: number
  model?: string
  domain?: string
}

interface DailyUsage {
  date: string
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalRequests: number
}

interface RateLimit {
  model?: string
  domain?: string
  windowMinutes: number
  tokenLimit: number
  requestLimit?: number
  fallbackModel?: string
  enabled: boolean
}

/**
 * Generate token stats grid HTML
 */
export function generateTokenStatsGrid(stats: TokenStats) {
  return html`
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Input Tokens</div>
        <div class="stat-value">${formatNumber(stats.totalInputTokens)}</div>
        <div class="stat-meta">Messages sent</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Output Tokens</div>
        <div class="stat-value">${formatNumber(stats.totalOutputTokens)}</div>
        <div class="stat-meta">Responses generated</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Cache Read Tokens</div>
        <div class="stat-value">${formatNumber(stats.cacheReadInputTokens)}</div>
        <div class="stat-meta">From cache</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Cache Creation Tokens</div>
        <div class="stat-value">${formatNumber(stats.cacheCreationInputTokens)}</div>
        <div class="stat-meta">Cached for reuse</div>
      </div>
    </div>

    <div style="margin-top: 1rem; padding: 1rem; background: #f9fafb; border-radius: 0.375rem;">
      <div class="text-sm text-gray-600">
        <strong>Total Requests:</strong> ${stats.totalRequests}<br />
        <strong>Total All Tokens:</strong> ${formatNumber(stats.totalTokens)}<br />
        <strong>Model:</strong> ${stats.model || 'All models'}<br />
        <strong>Domain:</strong> ${stats.domain || 'All domains'}
      </div>
    </div>
  `
}

/**
 * Generate daily usage table HTML
 */
export function generateDailyUsageTable(dailyUsage: DailyUsage[]) {
  const sortedUsage = dailyUsage
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 30)

  return html`
    <div style="overflow-x: auto;">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Input Tokens</th>
            <th>Output Tokens</th>
            <th>Total Tokens</th>
            <th>Requests</th>
          </tr>
        </thead>
        <tbody>
          ${sortedUsage.map(
            day => html`
              <tr>
                <td class="text-sm">${new Date(day.date).toLocaleDateString()}</td>
                <td class="text-sm">${formatNumber(day.totalInputTokens)}</td>
                <td class="text-sm">${formatNumber(day.totalOutputTokens)}</td>
                <td class="text-sm">${formatNumber(day.totalTokens)}</td>
                <td class="text-sm">${day.totalRequests}</td>
              </tr>
            `
          )}
        </tbody>
      </table>
    </div>
  `
}

/**
 * Generate rate limits table HTML
 */
export function generateRateLimitsTable(rateLimits: RateLimit[]) {
  return html`
    <table>
      <thead>
        <tr>
          <th>Scope</th>
          <th>Window</th>
          <th>Token Limit</th>
          <th>Request Limit</th>
          <th>Fallback Model</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rateLimits.map(
          limit => html`
            <tr>
              <td class="text-sm">
                ${limit.model
                  ? `Model: ${limit.model}`
                  : limit.domain
                    ? `Domain: ${limit.domain}`
                    : 'Account Default'}
              </td>
              <td class="text-sm">${limit.windowMinutes} minutes</td>
              <td class="text-sm">${formatNumber(limit.tokenLimit)}</td>
              <td class="text-sm">
                ${limit.requestLimit ? formatNumber(limit.requestLimit) : 'N/A'}
              </td>
              <td class="text-sm">${limit.fallbackModel || 'None'}</td>
              <td class="text-sm">
                <span style="color: ${limit.enabled ? '#10b981' : '#ef4444'};">
                  ${limit.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </td>
            </tr>
          `
        )}
      </tbody>
    </table>
  `
}

/**
 * Generate section wrapper HTML
 */
export function generateSection(title: string, content: any, headerExtra?: string) {
  return html`
    <div class="section">
      <div class="section-header">
        ${title}
        ${headerExtra
          ? html`<span class="text-sm text-gray-500" style="float: right;">${headerExtra}</span>`
          : ''}
      </div>
      <div class="section-content">${content}</div>
    </div>
  `
}

/**
 * Generate error banner HTML
 */
export function generateErrorBanner(message: string) {
  return html` <div class="error-banner"><strong>Error:</strong> ${message}</div> `
}

/**
 * Generate back link HTML
 */
export function generateBackLink() {
  return html`
    <div class="mb-6">
      <a href="/dashboard" class="text-blue-600">← Back to Dashboard</a>
    </div>
  `
}
