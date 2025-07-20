/**
 * MCP Prompts dashboard page
 */

import { Hono } from 'hono'
import { html } from 'hono/html'
import { layout } from '../layout/index.js'
import { ProxyApiClient } from '../services/api-client.js'
import { csrfProtection } from '../middleware/csrf.js'
import { escapeHtml } from '../utils/html.js'
import { promptsStyles } from '../styles/prompts.js'
import { promptsSyncScript } from '../scripts/prompts-sync.js'
import type {
  McpPrompt,
  McpPromptsResponse,
  McpSyncStatus,
  PROMPTS_PAGE_SIZE,
} from '../types/mcp-prompts.js'

const PAGE_SIZE: typeof PROMPTS_PAGE_SIZE = 20

const promptsRoute = new Hono<{
  Variables: {
    apiClient?: ProxyApiClient
    domain?: string
    csrfToken?: string
  }
}>()

// Apply CSRF protection to generate tokens
promptsRoute.use('*', csrfProtection())

promptsRoute.get('/', async c => {
  const apiClient = c.get('apiClient')
  const domain = c.req.query('domain') || undefined
  const page = parseInt(c.req.query('page') || '1')
  const search = c.req.query('search') || undefined

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
    // Fetch prompts
    const { prompts, total } = await apiClient.get<McpPromptsResponse>(
      `/api/mcp/prompts?page=${page}&limit=${PAGE_SIZE}${search ? `&search=${encodeURIComponent(search)}` : ''}${domain ? `&domain=${domain}` : ''}`
    )

    // Fetch sync status
    let syncStatus: McpSyncStatus | null = null
    try {
      syncStatus = await apiClient.get<McpSyncStatus>('/api/mcp/sync/status')
    } catch (error) {
      // Log error but continue without sync status
      console.error('Failed to fetch sync status:', error)
    }

    const content = html`
      <div>
        <div class="header-section">
          <h2>MCP Prompts</h2>
          <p class="subtitle">Model Context Protocol prompts synced from GitHub</p>
        </div>

        <!-- Sync Status -->
        ${syncStatus
          ? html`
              <div class="sync-status ${syncStatus.sync_status}">
                <div class="sync-info">
                  <span class="status-label">Status:</span>
                  <span class="status-value ${syncStatus.sync_status}"
                    >${syncStatus.sync_status}</span
                  >
                  ${syncStatus.last_sync_at
                    ? html`
                        <span class="sync-time"
                          >Last sync: ${new Date(syncStatus.last_sync_at).toLocaleString()}</span
                        >
                      `
                    : ''}
                  ${syncStatus.last_error
                    ? html`
                        <span class="error-message">${escapeHtml(syncStatus.last_error)}</span>
                      `
                    : ''}
                </div>
                <button
                  id="sync-button"
                  class="btn btn-primary"
                  ${syncStatus.sync_status === 'syncing' ? 'disabled' : ''}
                  onclick="triggerSync()"
                >
                  ${syncStatus.sync_status === 'syncing' ? 'Syncing...' : 'Sync Now'}
                </button>
              </div>
              <div
                id="sync-error"
                class="error-message"
                style="display: none; margin-top: 1rem;"
              ></div>
            `
          : ''}

        <!-- Search Bar -->
        <div class="search-container">
          <form method="get" action="/dashboard/prompts" class="search-form">
            <input
              type="text"
              name="search"
              placeholder="Search prompts..."
              value="${escapeHtml(search || '')}"
              class="search-input"
            />
            <button type="submit" class="btn btn-secondary">Search</button>
          </form>
        </div>

        <!-- Prompts List -->
        <div class="prompts-grid">
          ${prompts.length > 0
            ? prompts.map(
                (prompt: McpPrompt) => html`
                  <div class="prompt-card">
                    <h3 class="prompt-name">${escapeHtml(prompt.name)}</h3>
                    ${prompt.description
                      ? html` <p class="prompt-description">${escapeHtml(prompt.description)}</p> `
                      : ''}
                    <div class="prompt-meta">
                      <span class="prompt-id">${escapeHtml(prompt.promptId)}</span>
                    </div>
                    <div class="prompt-actions">
                      <a
                        href="/dashboard/prompts/${encodeURIComponent(prompt.promptId)}"
                        class="btn btn-small"
                        >View Details</a
                      >
                    </div>
                  </div>
                `
              )
            : html`
                <div class="empty-state">
                  <p>
                    No prompts found.
                    ${!syncStatus || syncStatus.sync_status === 'never_synced'
                      ? 'Click "Sync Now" to fetch prompts from GitHub.'
                      : ''}
                  </p>
                </div>
              `}
        </div>

        <!-- Pagination -->
        ${total > PAGE_SIZE
          ? html`
              <div class="pagination">
                ${page > 1
                  ? html`
                      <a
                        href="?page=${page - 1}${search
                          ? `&search=${encodeURIComponent(search)}`
                          : ''}"
                        class="btn btn-secondary"
                        >Previous</a
                      >
                    `
                  : ''}
                <span>Page ${page} of ${Math.ceil(total / PAGE_SIZE)}</span>
                ${page < Math.ceil(total / PAGE_SIZE)
                  ? html`
                      <a
                        href="?page=${page + 1}${search
                          ? `&search=${encodeURIComponent(search)}`
                          : ''}"
                        class="btn btn-secondary"
                        >Next</a
                      >
                    `
                  : ''}
              </div>
            `
          : ''}
      </div>

      <style>
        ${promptsStyles}
      </style>

      <script>
        ${promptsSyncScript}
      </script>
    `

    return c.html(layout('MCP Prompts', content, '', c))
  } catch (error) {
    console.error('Error loading prompts page:', error)
    return c.html(
      layout(
        'MCP Prompts - Error',
        html`
          <div class="error-container">
            <h2>Error Loading Prompts</h2>
            <p>${escapeHtml(error instanceof Error ? error.message : 'Unknown error')}</p>
            <a href="/dashboard" class="btn btn-primary">Back to Dashboard</a>
          </div>
        `,
        '',
        c
      )
    )
  }
})

export { promptsRoute }
