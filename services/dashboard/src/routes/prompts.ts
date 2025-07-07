/**
 * MCP Prompts dashboard page
 */

import { Hono } from 'hono'
import { html } from 'hono/html'
import { layout } from '../layout/index.js'
import { ProxyApiClient } from '../services/api-client.js'

const promptsRoute = new Hono<{
  Variables: {
    apiClient?: ProxyApiClient
    domain?: string
  }
}>()

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
    const promptsResponse = await apiClient.get(
      `/api/mcp/prompts?page=${page}&limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}${domain ? `&domain=${domain}` : ''}`
    )

    if (!promptsResponse.ok) {
      throw new Error(`Failed to fetch prompts: ${promptsResponse.status}`)
    }

    const promptsData = (await promptsResponse.json()) as { prompts: any[]; total: number }
    const { prompts, total } = promptsData

    // Fetch sync status
    const syncStatusResponse = await apiClient.get('/api/mcp/sync/status')
    const syncStatus = syncStatusResponse.ok ? ((await syncStatusResponse.json()) as any) : null

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
                    ? html` <span class="error-message">${syncStatus.last_error}</span> `
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
            `
          : ''}

        <!-- Search Bar -->
        <div class="search-container">
          <form method="get" action="/dashboard/prompts">
            <input
              type="text"
              name="search"
              placeholder="Search prompts..."
              value="${search || ''}"
              class="search-input"
            />
            <button type="submit" class="btn btn-secondary">Search</button>
          </form>
        </div>

        <!-- Prompts List -->
        <div class="prompts-grid">
          ${prompts.length > 0
            ? prompts.map(
                (prompt: any) => html`
                  <div class="prompt-card">
                    <h3 class="prompt-name">${prompt.name}</h3>
                    ${prompt.description
                      ? html` <p class="prompt-description">${prompt.description}</p> `
                      : ''}
                    <div class="prompt-meta">
                      <span class="prompt-id">${prompt.promptId}</span>
                      ${prompt.arguments && prompt.arguments.length > 0
                        ? html`
                            <span class="prompt-args"
                              >${prompt.arguments.length}
                              argument${prompt.arguments.length > 1 ? 's' : ''}</span
                            >
                          `
                        : ''}
                    </div>
                    <div class="prompt-actions">
                      <a href="/dashboard/prompts/${prompt.promptId}" class="btn btn-small"
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
        ${total > 20
          ? html`
              <div class="pagination">
                ${page > 1
                  ? html`
                      <a
                        href="?page=${page - 1}${search ? `&search=${search}` : ''}"
                        class="btn btn-secondary"
                        >Previous</a
                      >
                    `
                  : ''}
                <span>Page ${page} of ${Math.ceil(total / 20)}</span>
                ${page < Math.ceil(total / 20)
                  ? html`
                      <a
                        href="?page=${page + 1}${search ? `&search=${search}` : ''}"
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
        .header-section {
          margin-bottom: 2rem;
        }

        .subtitle {
          color: #6b7280;
          margin-top: 0.5rem;
        }

        .sync-status {
          background-color: #f3f4f6;
          border-radius: 0.5rem;
          padding: 1rem;
          margin-bottom: 2rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .sync-status.error {
          background-color: #fee2e2;
        }

        .sync-status.syncing {
          background-color: #dbeafe;
        }

        .sync-status.success {
          background-color: #d1fae5;
        }

        .sync-info {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .status-label {
          font-weight: 600;
        }

        .status-value {
          text-transform: capitalize;
        }

        .status-value.error {
          color: #dc2626;
        }

        .status-value.syncing {
          color: #2563eb;
        }

        .status-value.success {
          color: #059669;
        }

        .sync-time {
          color: #6b7280;
          font-size: 0.875rem;
        }

        .error-message {
          color: #dc2626;
          font-size: 0.875rem;
        }

        .search-container {
          margin-bottom: 2rem;
        }

        .search-input {
          padding: 0.5rem 1rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          width: 300px;
          margin-right: 0.5rem;
        }

        .prompts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .prompt-card {
          background-color: white;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 1.5rem;
          transition: box-shadow 0.2s;
        }

        .prompt-card:hover {
          box-shadow:
            0 4px 6px -1px rgba(0, 0, 0, 0.1),
            0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }

        .prompt-name {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0 0 0.5rem 0;
          color: #1f2937;
        }

        .prompt-description {
          color: #6b7280;
          margin: 0.5rem 0;
          line-height: 1.5;
        }

        .prompt-meta {
          display: flex;
          gap: 1rem;
          margin: 1rem 0;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .prompt-id {
          font-family: monospace;
          background-color: #f3f4f6;
          padding: 0.125rem 0.5rem;
          border-radius: 0.25rem;
        }

        .prompt-args {
          background-color: #dbeafe;
          color: #1e40af;
          padding: 0.125rem 0.5rem;
          border-radius: 0.25rem;
        }

        .prompt-actions {
          margin-top: 1rem;
        }

        .btn {
          display: inline-block;
          padding: 0.5rem 1rem;
          border-radius: 0.375rem;
          text-decoration: none;
          transition: background-color 0.2s;
          cursor: pointer;
          border: none;
        }

        .btn-primary {
          background-color: #3b82f6;
          color: white;
        }

        .btn-primary:hover {
          background-color: #2563eb;
        }

        .btn-primary:disabled {
          background-color: #9ca3af;
          cursor: not-allowed;
        }

        .btn-secondary {
          background-color: #6b7280;
          color: white;
        }

        .btn-secondary:hover {
          background-color: #4b5563;
        }

        .btn-small {
          padding: 0.25rem 0.75rem;
          font-size: 0.875rem;
        }

        .empty-state {
          text-align: center;
          padding: 3rem;
          color: #6b7280;
        }

        .pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 1rem;
          margin-top: 2rem;
        }
      </style>

      <script>
        async function triggerSync() {
          const button = document.getElementById('sync-button')
          button.disabled = true
          button.textContent = 'Syncing...'

          try {
            const response = await fetch('/dashboard/api/mcp/sync', {
              method: 'POST',
              credentials: 'same-origin',
            })

            if (response.ok) {
              // Reload page after a short delay to show updated status
              setTimeout(() => {
                window.location.reload()
              }, 1000)
            } else {
              const error = await response.json()
              alert('Sync failed: ' + (error.error || 'Unknown error'))
              button.disabled = false
              button.textContent = 'Sync Now'
            }
          } catch (error) {
            alert('Sync failed: ' + error.message)
            button.disabled = false
            button.textContent = 'Sync Now'
          }
        }
      </script>
    `

    return c.html(layout('MCP Prompts', content))
  } catch (error) {
    console.error('Error loading prompts page:', error)
    return c.html(
      layout(
        'MCP Prompts - Error',
        html`
          <div class="error-container">
            <h2>Error Loading Prompts</h2>
            <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
            <a href="/dashboard" class="btn btn-primary">Back to Dashboard</a>
          </div>
        `
      )
    )
  }
})

export { promptsRoute }
