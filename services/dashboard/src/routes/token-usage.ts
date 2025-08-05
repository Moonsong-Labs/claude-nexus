import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { ProxyApiClient } from '../services/api-client.js'
import { getErrorMessage } from '@claude-nexus/shared'
import { layout } from '../layout/index.js'

export const tokenUsageRoutes = new Hono<{
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
        html`
          <div class="error-banner">
            <strong>Error:</strong> API client not configured. Please check your configuration.
          </div>
        `
      )
    )
  }

  if (!accountId) {
    // Show all accounts overview
    try {
      const accountsData = await apiClient.getAccountsTokenUsage()

      const content = html`
        <div class="mb-6">
          <a href="/dashboard" class="text-blue-600">← Back to Dashboard</a>
        </div>

        <h2 style="margin: 0 0 1.5rem 0;">Token Usage Overview - All Accounts</h2>

        <div class="section">
          <div class="section-header">Active Accounts (7-Day Usage)</div>
          <div class="section-content">
            ${accountsData.accounts.length > 0
              ? html`
                  <div style="display: flex; flex-direction: column; gap: 10px;">
                    ${raw(
                      accountsData.accounts
                        .map(account => {
                          const chartId = `chart-${account.accountId.replace(/[^a-zA-Z0-9]/g, '-')}`
                          const chartScript = `
                    (function() {
                      // Mini chart for ${account.accountId}
                      const canvas = document.getElementById('${chartId}');
                      if (!canvas) return;
                      
                      const ctx = canvas.getContext('2d');
                      const rect = canvas.getBoundingClientRect();
                      canvas.width = rect.width * window.devicePixelRatio;
                      canvas.height = rect.height * window.devicePixelRatio;
                      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
                      
                      const data = ${JSON.stringify(account.miniSeries)};
                      const tokenLimit = ${accountsData.tokenLimit};
                      const rateLimitInfo = ${account.rateLimitInfo ? JSON.stringify(account.rateLimitInfo) : 'null'};
                      
                      // Draw background
                      ctx.fillStyle = '#f9fafb';
                      ctx.fillRect(0, 0, rect.width, rect.height);
                      
                      // Draw rate limit line at 140k
                      const maxHeight = 500000; // 500k tokens max
                      const limitY = rect.height - (tokenLimit / maxHeight) * rect.height;
                      ctx.strokeStyle = '#ef4444';
                      ctx.lineWidth = 1;
                      ctx.setLineDash([5, 5]);
                      ctx.beginPath();
                      ctx.moveTo(0, limitY);
                      ctx.lineTo(rect.width, limitY);
                      ctx.stroke();
                      ctx.setLineDash([]);
                      
                      // Draw limit label
                      ctx.fillStyle = '#ef4444';
                      ctx.font = '9px sans-serif';
                      ctx.textAlign = 'right';
                      ctx.fillText('140k limit', rect.width - 5, limitY - 2);
                      
                      // Draw usage line with color changes at threshold
                      ctx.lineWidth = 1.5;
                      
                      // Draw line segments
                      // Since we don't have per-bucket rate limit info in mini series,
                      // we'll use a single color based on whether the account has been rate limited
                      const lineColor = rateLimitInfo && rateLimitInfo.total_hits > 0 ? '#ef4444' : '#10b981';
                      
                      ctx.beginPath();
                      ctx.strokeStyle = lineColor;
                      ctx.lineWidth = 1.5;
                      
                      for (let i = 0; i < data.length; i++) {
                        const x = (i / (data.length - 1)) * rect.width;
                        const y = rect.height - (data[i].usage / maxHeight) * rect.height;
                        
                        if (i === 0) {
                          ctx.moveTo(x, y);
                        } else {
                          ctx.lineTo(x, y);
                        }
                      }
                      ctx.stroke();
                      
                      // Fill area under curve with gradient
                      ctx.beginPath();
                      data.forEach((point, index) => {
                        const x = (index / (data.length - 1)) * rect.width;
                        const y = rect.height - (point.usage / maxHeight) * rect.height;
                        
                        if (index === 0) {
                          ctx.moveTo(x, y);
                        } else {
                          ctx.lineTo(x, y);
                        }
                      });
                      
                      ctx.lineTo(rect.width, rect.height);
                      ctx.lineTo(0, rect.height);
                      ctx.closePath();
                      
                      // Create a gradient fill based on rate limit status
                      const hasRateLimit = rateLimitInfo && rateLimitInfo.total_hits > 0;
                      const fillColor = hasRateLimit ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)';
                      ctx.fillStyle = fillColor;
                      ctx.fill();
                      
                      // Draw vertical lines
                      // 1. Draw 5-hour marker (from the right edge) - for 7-day span
                      if (data.length > 0) {
                        const now = new Date(data[data.length - 1].time);
                        const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);
                        const oldestTime = new Date(data[0].time);
                        const timeSpan = now - oldestTime;
                        
                        // Calculate position of 5 hours ago
                        const fiveHourOffset = (now - fiveHoursAgo) / timeSpan;
                        const fiveHourX = rect.width * (1 - fiveHourOffset);
                        
                        if (fiveHourX > 0) {
                          ctx.strokeStyle = '#6366f1'; // Indigo color for 5h marker
                          ctx.lineWidth = 1;
                          ctx.setLineDash([3, 3]);
                          ctx.beginPath();
                          ctx.moveTo(fiveHourX, 0);
                          ctx.lineTo(fiveHourX, rect.height);
                          ctx.stroke();
                          ctx.setLineDash([]);
                        }
                        
                        // 2. Draw rate limit timestamp marker if available
                        if (rateLimitInfo && rateLimitInfo.last_triggered_at) {
                          const rateLimitTime = new Date(rateLimitInfo.last_triggered_at);
                          
                          if (rateLimitTime >= oldestTime && rateLimitTime <= now) {
                            const rateLimitOffset = (now - rateLimitTime) / timeSpan;
                            const rateLimitX = rect.width * (1 - rateLimitOffset);
                            
                            ctx.strokeStyle = '#dc2626'; // Red color for rate limit
                            ctx.lineWidth = 1;
                            ctx.setLineDash([2, 2]);
                            ctx.beginPath();
                            ctx.moveTo(rateLimitX, 0);
                            ctx.lineTo(rateLimitX, rect.height);
                            ctx.stroke();
                            ctx.setLineDash([]);
                          }
                        }
                      }
                      
                      // Add time labels
                      ctx.fillStyle = '#9ca3af';
                      ctx.font = '8px sans-serif';
                      ctx.textAlign = 'center';
                      ctx.fillText('7d ago', 10, rect.height - 2);
                      ctx.fillText('now', rect.width - 10, rect.height - 2);
                    })();
                  `

                          return `
                    <div style="height: 120px; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 10px; background: white;">
                      <a href="/dashboard/token-usage?accountId=${encodeURIComponent(account.accountId)}" style="text-decoration: none; color: inherit; display: block;">
                        <div style="display: flex; align-items: flex-start; gap: 20px; height: 100%;">
                          <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 5px;">
                              <strong style="font-size: 14px; color: #1f2937;">${escapeHtml(account.accountId)}</strong>
                              ${
                                account.rateLimitInfo && account.rateLimitInfo.is_rate_limited
                                  ? `<span style="font-size: 11px; background: #ef4444; color: white; padding: 2px 6px; border-radius: 3px; font-weight: 500;">RATE LIMITED</span>`
                                  : account.rateLimitInfo && account.rateLimitInfo.total_hits > 0
                                    ? `<span style="font-size: 11px; background: #fbbf24; color: #78350f; padding: 2px 6px; border-radius: 3px; font-weight: 500;">Previously Limited</span>`
                                    : ''
                              }
                              <span style="font-size: 12px; color: ${
                                account.remainingTokens < 0 ? '#ef4444' : '#10b981'
                              };">
                                7d: ${formatNumber(account.outputTokens)} tokens | 5h: ${formatNumber(accountsData.tokenLimit - account.remainingTokens)} / ${formatNumber(accountsData.tokenLimit)}
                                (${account.percentageUsed.toFixed(1)}% of 5h limit)
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
                            ${
                              account.rateLimitInfo
                                ? `
                              <div style="font-size: 11px; color: #6b7280; margin-top: 8px;">
                                ${
                                  account.rateLimitInfo.is_rate_limited &&
                                  account.rateLimitInfo.retry_until
                                    ? `<span style="color: #ef4444;">Rate limit active until ${new Date(account.rateLimitInfo.retry_until).toLocaleString()}</span>`
                                    : `<span>Last limited: ${new Date(account.rateLimitInfo.last_triggered_at).toLocaleString()}</span>`
                                }
                                • ${account.rateLimitInfo.last_limit_type?.replace(/_/g, ' ')} • ${account.rateLimitInfo.total_hits} total hits
                              </div>
                              `
                                : ''
                            }
                          </div>
                          <div style="width: 400px; height: 80px; flex-shrink: 0;">
                            <canvas id="${chartId}" style="width: 100%; height: 100%;"></canvas>
                          </div>
                        </div>
                      </a>
                    </div>
                    ${raw(`<script>${chartScript}</script>`)}
                  `
                        })
                        .join('')
                    )}
                  </div>
                `
              : html` <p class="text-gray-500">No active accounts found in the last 5 hours.</p> `}
          </div>
        </div>
      `

      return c.html(layout('Token Usage Overview', content))
    } catch (error) {
      console.error('Failed to fetch accounts data:', getErrorMessage(error))
      return c.html(
        layout(
          'Token Usage',
          html`
            <div class="error-banner">
              <strong>Error:</strong> Failed to load accounts data. Please try again later.
            </div>
            <div class="mb-6">
              <a href="/dashboard" class="text-blue-600">← Back to Dashboard</a>
            </div>
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
      <div class="mb-6">
        <a href="/dashboard" class="text-blue-600">← Back to Dashboard</a>
      </div>

      <h2 style="margin: 0 0 1.5rem 0;">Token Usage for Account: ${escapeHtml(accountId)}</h2>

      ${tokenUsage && tokenUsage.rateLimitInfo
        ? html`
            <div
              class="section"
              style="${tokenUsage.rateLimitInfo.is_rate_limited ? 'border-color: #ef4444;' : ''}"
            >
              <div
                class="section-header"
                style="${tokenUsage.rateLimitInfo.is_rate_limited
                  ? 'background: #fef2f2; color: #991b1b;'
                  : ''}"
              >
                Rate Limit Status
              </div>
              <div class="section-content">
                <div
                  style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;"
                >
                  <div>
                    <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">Status</div>
                    <div
                      style="font-size: 16px; font-weight: 600; color: ${tokenUsage.rateLimitInfo
                        .is_rate_limited
                        ? '#ef4444'
                        : '#10b981'};"
                    >
                      ${tokenUsage.rateLimitInfo.is_rate_limited ? 'RATE LIMITED' : 'Not Limited'}
                    </div>
                  </div>
                  ${tokenUsage.rateLimitInfo.retry_until
                    ? html`
                        <div>
                          <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">
                            Can Retry At
                          </div>
                          <div style="font-size: 16px; font-weight: 600; color: #1f2937;">
                            ${new Date(tokenUsage.rateLimitInfo.retry_until).toLocaleString()}
                          </div>
                        </div>
                      `
                    : ''}
                  <div>
                    <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">
                      Limit Type
                    </div>
                    <div style="font-size: 16px; font-weight: 600; color: #1f2937;">
                      ${tokenUsage.rateLimitInfo.last_limit_type?.replace(/_/g, ' ') || 'Unknown'}
                    </div>
                  </div>
                  <div>
                    <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">
                      Total Hits
                    </div>
                    <div style="font-size: 16px; font-weight: 600; color: #1f2937;">
                      ${tokenUsage.rateLimitInfo.total_hits}
                    </div>
                  </div>
                </div>
                <div
                  style="margin-top: 1rem; padding: 1rem; background: #f9fafb; border-radius: 0.375rem;"
                >
                  <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">
                    First Triggered
                  </div>
                  <div style="font-size: 14px; color: #1f2937; margin-bottom: 0.5rem;">
                    ${new Date(tokenUsage.rateLimitInfo.first_triggered_at).toLocaleString()}
                  </div>
                  <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">
                    Last Triggered
                  </div>
                  <div style="font-size: 14px; color: #1f2937; margin-bottom: 0.5rem;">
                    ${new Date(tokenUsage.rateLimitInfo.last_triggered_at).toLocaleString()}
                  </div>
                  <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">
                    Tokens Used in 5-Hour Window Before Last Limit
                  </div>
                  <div style="font-size: 16px; font-weight: 600; color: #1f2937;">
                    ${formatNumber(tokenUsage.rateLimitInfo.tokens_in_window_before_limit)} tokens
                  </div>
                </div>
              </div>
            </div>
          `
        : ''}

      <!-- Current 5-Hour Window Usage -->
      <div class="section">
        <div class="section-header">
          5-Hour Sliding Window Usage (Output Tokens Only)
          <span class="text-sm text-gray-500" style="float: right;">
            ${tokenUsage
              ? `Window: ${new Date(tokenUsage.windowStart).toLocaleTimeString()} - ${new Date(tokenUsage.windowEnd).toLocaleTimeString()}`
              : ''}
          </span>
        </div>
        <div class="section-content">
          ${tokenUsage
            ? html`
                <div style="margin-bottom: 1.5rem;">
                  <!-- Progress bar showing output tokens only -->
                  <div
                    style="position: relative; background: #f3f4f6; height: 40px; border-radius: 0.5rem; overflow: hidden;"
                  >
                    <div
                      style="position: absolute; left: 0; top: 0; height: 100%; background: ${primaryLimit &&
                      tokenUsage.totalOutputTokens / primaryLimit.tokenLimit > 0.9
                        ? '#ef4444'
                        : primaryLimit &&
                            tokenUsage.totalOutputTokens / primaryLimit.tokenLimit > 0.7
                          ? '#f59e0b'
                          : '#10b981'}; width: ${primaryLimit
                        ? Math.min(
                            100,
                            (tokenUsage.totalOutputTokens / primaryLimit.tokenLimit) * 100
                          )
                        : 0}%; transition: width 0.3s ease;"
                    ></div>
                    <div
                      style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: 600; color: #1f2937;"
                    >
                      ${formatNumber(tokenUsage.totalOutputTokens)} /
                      ${primaryLimit ? formatNumber(primaryLimit.tokenLimit) : '?'} output tokens
                      (${primaryLimit
                        ? Math.round((tokenUsage.totalOutputTokens / primaryLimit.tokenLimit) * 100)
                        : 0}%)
                    </div>
                  </div>
                </div>

                <!-- Detailed token breakdown -->
                <div class="stats-grid">
                  <div class="stat-card">
                    <div class="stat-label">Input Tokens</div>
                    <div class="stat-value">${formatNumber(tokenUsage.totalInputTokens)}</div>
                    <div class="stat-meta">Messages sent</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-label">Output Tokens</div>
                    <div class="stat-value">${formatNumber(tokenUsage.totalOutputTokens)}</div>
                    <div class="stat-meta">Responses generated</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-label">Cache Read Tokens</div>
                    <div class="stat-value">${formatNumber(tokenUsage.cacheReadInputTokens)}</div>
                    <div class="stat-meta">From cache</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-label">Cache Creation Tokens</div>
                    <div class="stat-value">
                      ${formatNumber(tokenUsage.cacheCreationInputTokens)}
                    </div>
                    <div class="stat-meta">Cached for reuse</div>
                  </div>
                </div>

                <div
                  style="margin-top: 1rem; padding: 1rem; background: #f9fafb; border-radius: 0.375rem;"
                >
                  <div class="text-sm text-gray-600">
                    <strong>Total Requests:</strong> ${tokenUsage.totalRequests}<br />
                    <strong>Total All Tokens:</strong> ${formatNumber(tokenUsage.totalTokens)}<br />
                    <strong>Model:</strong> ${tokenUsage.model || 'All models'}<br />
                    <strong>Domain:</strong> ${tokenUsage.domain || 'All domains'}
                  </div>
                </div>
              `
            : html`
                <p class="text-gray-500">No token usage data available for this time window.</p>
              `}
        </div>
      </div>

      <!-- Sliding Window Usage Chart -->
      <div class="section">
        <div class="section-header">5-Hour Sliding Window Token Usage</div>
        <div class="section-content">
          ${timeSeries && timeSeries.timeSeries.length > 0
            ? (() => {
                const chartScript = `
              // Prepare chart data
              const chartData = ${JSON.stringify(
                timeSeries.timeSeries.map(point => ({
                  time: new Date(point.time).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                  fullTime: point.time,
                  remaining: point.remaining,
                  percentageUsed: point.percentageUsed,
                  hasRateLimitInHour: point.hasRateLimitInHour || false,
                }))
              )};
              
              const tokenLimit = ${timeSeries.tokenLimit};
              const rateLimitInfo = ${tokenUsage?.rateLimitInfo ? JSON.stringify(tokenUsage.rateLimitInfo) : 'null'};
              
              // Wait for canvas to be ready
              setTimeout(() => {
                const canvas = document.getElementById('usageChart');
                if (!canvas) return;
                
                const ctx = canvas.getContext('2d');
                const rect = canvas.getBoundingClientRect();
                canvas.width = rect.width * window.devicePixelRatio;
                canvas.height = rect.height * window.devicePixelRatio;
                ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
                
                const padding = { top: 20, right: 20, bottom: 60, left: 80 };
                const chartWidth = rect.width - padding.left - padding.right;
                const chartHeight = rect.height - padding.top - padding.bottom;
                
                // Clear canvas
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, rect.width, rect.height);
                
                // Draw axes
                ctx.strokeStyle = '#e5e7eb';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(padding.left, padding.top);
                ctx.lineTo(padding.left, padding.top + chartHeight);
                ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
                ctx.stroke();
                
                // Draw horizontal grid lines and Y-axis labels
                ctx.fillStyle = '#6b7280';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'right';
                
                const maxHeight = 500000; // 500k tokens max
                const ySteps = 5;
                for (let i = 0; i <= ySteps; i++) {
                  const y = padding.top + (chartHeight * i / ySteps);
                  const value = maxHeight * (1 - i / ySteps);
                  
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
                
                // Draw X-axis labels (show every nth label to avoid crowding)
                ctx.textAlign = 'center';
                const labelInterval = Math.ceil(chartData.length / 12);
                chartData.forEach((point, index) => {
                  if (index % labelInterval === 0 || index === chartData.length - 1) {
                    const x = padding.left + (index / (chartData.length - 1)) * chartWidth;
                    ctx.fillText(point.time, x, padding.top + chartHeight + 20);
                  }
                });
                
                // Draw rate limit line at 140k
                const limitY = padding.top + (1 - (maxHeight - tokenLimit) / maxHeight) * chartHeight;
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(padding.left, limitY);
                ctx.lineTo(padding.left + chartWidth, limitY);
                ctx.stroke();
                ctx.setLineDash([]);
                
                // Add rate limit label
                ctx.fillStyle = '#ef4444';
                ctx.font = '11px sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText('140k limit', padding.left + 5, limitY - 5);
                
                // Draw the sliding window usage line with segment-based colors
                ctx.lineWidth = 2;
                
                // Draw line segments with appropriate colors
                for (let i = 0; i < chartData.length - 1; i++) {
                  const x1 = padding.left + (i / (chartData.length - 1)) * chartWidth;
                  const y1 = padding.top + (1 - chartData[i].remaining / maxHeight) * chartHeight;
                  const x2 = padding.left + ((i + 1) / (chartData.length - 1)) * chartWidth;
                  const y2 = padding.top + (1 - chartData[i + 1].remaining / maxHeight) * chartHeight;
                  
                  // Determine color based on rate limit events in the hour
                  const segmentColor = chartData[i].hasRateLimitInHour || chartData[i + 1].hasRateLimitInHour ? '#ef4444' : '#10b981';
                  
                  ctx.beginPath();
                  ctx.strokeStyle = segmentColor;
                  ctx.moveTo(x1, y1);
                  ctx.lineTo(x2, y2);
                  ctx.stroke();
                }
                
                // Fill area under the curve
                ctx.beginPath();
                chartData.forEach((point, index) => {
                  const x = padding.left + (index / (chartData.length - 1)) * chartWidth;
                  const y = padding.top + (1 - point.remaining / maxHeight) * chartHeight;
                  
                  if (index === 0) {
                    ctx.moveTo(x, y);
                  } else {
                    ctx.lineTo(x, y);
                  }
                });
                
                ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
                ctx.lineTo(padding.left, padding.top + chartHeight);
                ctx.closePath();
                
                // Use a simple gradient fill
                const fillGradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
                fillGradient.addColorStop(0, 'rgba(156, 163, 175, 0.1)'); // Light gray at top
                fillGradient.addColorStop(1, 'rgba(156, 163, 175, 0.05)'); // Lighter gray at bottom
                
                ctx.fillStyle = fillGradient;
                ctx.fill();
                
                // Draw current point
                const lastPoint = chartData[chartData.length - 1];
                const lastX = padding.left + chartWidth;
                const lastY = padding.top + (1 - lastPoint.remaining / maxHeight) * chartHeight;
                
                // Determine color based on rate limit in hour
                const pointColor = lastPoint.hasRateLimitInHour ? '#ef4444' : '#10b981'; // Red if rate limited, green if not
                
                ctx.fillStyle = pointColor;
                ctx.beginPath();
                ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
                ctx.fill();
                
                // Draw current value label
                ctx.fillStyle = '#1f2937';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(
                  formatNumber(lastPoint.remaining) + ' tokens remaining',
                  lastX - 10,
                  lastY - 10
                );
                
                // Draw vertical lines
                // 1. Draw 5-hour marker (from the right edge)
                const now = new Date(chartData[chartData.length - 1].fullTime);
                const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);
                
                // Find the position of 5 hours ago in the data
                let fiveHourX = null;
                for (let i = chartData.length - 1; i >= 0; i--) {
                  const dataTime = new Date(chartData[i].fullTime);
                  if (dataTime <= fiveHoursAgo) {
                    // Interpolate position
                    const nextTime = i < chartData.length - 1 ? new Date(chartData[i + 1].fullTime) : now;
                    const timeFraction = (fiveHoursAgo - dataTime) / (nextTime - dataTime);
                    const x1 = padding.left + (i / (chartData.length - 1)) * chartWidth;
                    const x2 = i < chartData.length - 1 
                      ? padding.left + ((i + 1) / (chartData.length - 1)) * chartWidth 
                      : padding.left + chartWidth;
                    fiveHourX = x1 + (x2 - x1) * timeFraction;
                    break;
                  }
                }
                
                if (fiveHourX !== null) {
                  ctx.strokeStyle = '#6366f1'; // Indigo color for 5h marker
                  ctx.lineWidth = 2;
                  ctx.setLineDash([5, 5]);
                  ctx.beginPath();
                  ctx.moveTo(fiveHourX, padding.top);
                  ctx.lineTo(fiveHourX, padding.top + chartHeight);
                  ctx.stroke();
                  ctx.setLineDash([]);
                  
                  // Label for 5h marker
                  ctx.fillStyle = '#6366f1';
                  ctx.font = '11px sans-serif';
                  ctx.textAlign = 'center';
                  ctx.fillText('5h window', fiveHourX, padding.top - 5);
                }
                
                // 2. Draw rate limit timestamp marker if available
                if (rateLimitInfo && rateLimitInfo.last_triggered_at) {
                  const rateLimitTime = new Date(rateLimitInfo.last_triggered_at);
                  const oldestDataTime = new Date(chartData[0].fullTime);
                  const newestDataTime = new Date(chartData[chartData.length - 1].fullTime);
                  
                  if (rateLimitTime >= oldestDataTime && rateLimitTime <= newestDataTime) {
                    // Find position in the data
                    let rateLimitX = null;
                    for (let i = 0; i < chartData.length - 1; i++) {
                      const dataTime = new Date(chartData[i].fullTime);
                      const nextTime = new Date(chartData[i + 1].fullTime);
                      
                      if (rateLimitTime >= dataTime && rateLimitTime <= nextTime) {
                        const timeFraction = (rateLimitTime - dataTime) / (nextTime - dataTime);
                        const x1 = padding.left + (i / (chartData.length - 1)) * chartWidth;
                        const x2 = padding.left + ((i + 1) / (chartData.length - 1)) * chartWidth;
                        rateLimitX = x1 + (x2 - x1) * timeFraction;
                        break;
                      }
                    }
                    
                    if (rateLimitX !== null) {
                      ctx.strokeStyle = '#dc2626'; // Red color for rate limit
                      ctx.lineWidth = 2;
                      ctx.setLineDash([3, 3]);
                      ctx.beginPath();
                      ctx.moveTo(rateLimitX, padding.top);
                      ctx.lineTo(rateLimitX, padding.top + chartHeight);
                      ctx.stroke();
                      ctx.setLineDash([]);
                      
                      // Label for rate limit marker
                      ctx.fillStyle = '#dc2626';
                      ctx.font = '11px sans-serif';
                      ctx.textAlign = 'center';
                      ctx.fillText('Rate limited', rateLimitX, padding.top - 5);
                    }
                  }
                }
                
                // Add axis labels
                ctx.fillStyle = '#374151';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Time', padding.left + chartWidth / 2, rect.height - 10);
                
                ctx.save();
                ctx.translate(15, padding.top + chartHeight / 2);
                ctx.rotate(-Math.PI / 2);
                ctx.fillText('Tokens Remaining', 0, 0);
                ctx.restore();
                
                // Helper function
                function formatNumber(num) {
                  return num.toLocaleString();
                }
              }, 100);
            `

                return html`
                  <div style="width: 100%; height: 400px; position: relative;">
                    <canvas id="usageChart" style="width: 100%; height: 100%;"></canvas>
                  </div>
                  ${raw(`<script>${chartScript}</script>`)}
                `
              })()
            : html` <p class="text-gray-500">No time series data available.</p> `}
        </div>
      </div>

      <!-- Daily Usage Chart -->
      <div class="section">
        <div class="section-header">Daily Token Usage (Last 30 Days)</div>
        <div class="section-content">
          ${dailyUsage.length > 0
            ? html`
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
                      ${raw(
                        dailyUsage
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .slice(0, 30)
                          .map(
                            day => `
                        <tr>
                          <td class="text-sm">${new Date(day.date).toLocaleDateString()}</td>
                          <td class="text-sm">${formatNumber(day.totalInputTokens)}</td>
                          <td class="text-sm">${formatNumber(day.totalOutputTokens)}</td>
                          <td class="text-sm">${formatNumber(day.totalTokens)}</td>
                          <td class="text-sm">${day.totalRequests}</td>
                        </tr>
                      `
                          )
                          .join('')
                      )}
                    </tbody>
                  </table>
                </div>
              `
            : html` <p class="text-gray-500">No daily usage data available.</p> `}
        </div>
      </div>

      <!-- Rate Limits Configuration -->
      <div class="section">
        <div class="section-header">Rate Limit Configuration</div>
        <div class="section-content">
          ${rateLimits.length > 0
            ? html`
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
                    ${raw(
                      rateLimits
                        .map(
                          limit => `
                    <tr>
                      <td class="text-sm">
                        ${
                          limit.model
                            ? `Model: ${limit.model}`
                            : limit.domain
                              ? `Domain: ${limit.domain}`
                              : 'Account Default'
                        }
                      </td>
                      <td class="text-sm">${limit.windowMinutes} minutes</td>
                      <td class="text-sm">${formatNumber(limit.tokenLimit)}</td>
                      <td class="text-sm">${limit.requestLimit ? formatNumber(limit.requestLimit) : 'N/A'}</td>
                      <td class="text-sm">${limit.fallbackModel || 'None'}</td>
                      <td class="text-sm">
                        <span style="color: ${limit.enabled ? '#10b981' : '#ef4444'};">
                          ${limit.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                    </tr>
                  `
                        )
                        .join('')
                    )}
                  </tbody>
                </table>
              `
            : html` <p class="text-gray-500">No rate limits configured for this account.</p> `}
        </div>
      </div>
    `

    return c.html(layout('Token Usage', content))
  } catch (error) {
    return c.html(
      layout(
        'Error',
        html`
          <div class="error-banner">
            <strong>Error:</strong> ${getErrorMessage(error) || 'Failed to load token usage data'}
          </div>
          <div class="mb-6">
            <a href="/dashboard" class="text-blue-600">← Back to Dashboard</a>
          </div>
        `
      )
    )
  }
})
