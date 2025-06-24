import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { ProxyApiClient } from '../services/api-client.js'
import { getErrorMessage } from '@claude-nexus/shared'
import { formatNumber } from '../utils/formatters.js'
import { layout } from '../layout/index.js'

export const tokenUsageRoutes = new Hono<{
  Variables: {
    apiClient?: ProxyApiClient
  }
}>()

/**
 * Token usage dashboard
 */
tokenUsageRoutes.get('/token-usage', async c => {
  const accountId = c.req.query('accountId')
  const domain = c.req.query('domain')
  const apiClient = c.get('apiClient')

  if (!apiClient) {
    return c.html(layout('Token Usage', html`<div class="error">API client not configured</div>`))
  }

  try {
    // TODO: This is a placeholder. The actual implementation should be extracted from the backup file
    // lines 1867-2437 which contains the full token usage dashboard implementation

    const content = html`
      <div class="container">
        <h2>Token Usage Dashboard</h2>
        <p>This page will show token usage statistics and charts.</p>
        <p>Account ID: ${accountId || 'All Accounts'}</p>
        <p>Domain: ${domain || 'All Domains'}</p>
      </div>
    `

    return c.html(layout('Token Usage', content))
  } catch (error) {
    console.error('Error in token usage route:', error)
    return c.html(
      layout(
        'Error',
        html` <div class="error"><strong>Error:</strong> ${getErrorMessage(error)}</div> `
      )
    )
  }
})
