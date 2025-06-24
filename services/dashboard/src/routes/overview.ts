import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { ProxyApiClient } from '../services/api-client.js'
import { getErrorMessage } from '@claude-nexus/shared'
import { formatNumber, formatDuration, escapeHtml } from '../utils/formatters.js'
import { layout } from '../layout/index.js'

export const overviewRoutes = new Hono<{
  Variables: {
    apiClient?: ProxyApiClient
    domain?: string
  }
}>()

/**
 * Main dashboard page - Shows conversations overview with branches
 */
overviewRoutes.get('/', async c => {
  const domain = c.req.query('domain')
  const page = parseInt(c.req.query('page') || '1')
  const perPage = parseInt(c.req.query('per_page') || '50')
  const searchQuery = c.req.query('search')?.toLowerCase()

  // Validate pagination params
  const currentPage = Math.max(1, page)
  const itemsPerPage = Math.min(Math.max(10, perPage), 100) // Between 10 and 100

  // Get API client from context
  const apiClient = c.get('apiClient')

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
    // Fetch conversations with account information from the API
    const conversationsResult = await apiClient.getConversations({ domain, limit: 1000 })
    const apiConversations = conversationsResult.conversations

    // Create flat list of conversations (simplified for now)
    const conversationBranches: Array<{
      conversationId: string
      accountId?: string
      branch: string
      messageCount: number
      tokens: number
      firstMessage: Date
      lastMessage: Date
      domain: string
      latestRequestId?: string
    }> = []

    // Process API conversations
    apiConversations.forEach(conv => {
      conversationBranches.push({
        conversationId: conv.conversationId,
        accountId: conv.accountId,
        branch: 'main', // API doesn't return branch info yet
        messageCount: conv.messageCount,
        tokens: conv.totalTokens,
        firstMessage: new Date(conv.firstMessageTime),
        lastMessage: new Date(conv.lastMessageTime),
        domain: conv.domain,
        latestRequestId: undefined, // Not available from API yet
      })
    })

    // Apply search filter if provided
    let filteredBranches = conversationBranches
    if (searchQuery) {
      filteredBranches = conversationBranches.filter(branch => {
        return (
          branch.conversationId.toLowerCase().includes(searchQuery) ||
          branch.branch.toLowerCase().includes(searchQuery) ||
          branch.domain.toLowerCase().includes(searchQuery)
        )
      })
    }

    // Sort by last message time
    filteredBranches.sort((a, b) => b.lastMessage.getTime() - a.lastMessage.getTime())

    // Get unique domains for the dropdown
    const uniqueDomains = [...new Set(conversationBranches.map(branch => branch.domain))].sort()

    // Calculate totals from conversation branches
    const totalMessages = conversationBranches.reduce((sum, branch) => sum + branch.messageCount, 0)
    const totalTokens = conversationBranches.reduce((sum, branch) => sum + branch.tokens, 0)
    const uniqueAccounts = [...new Set(conversationBranches.map(b => b.accountId).filter(Boolean))]

    // Calculate pagination
    const totalItems = filteredBranches.length
    const totalPages = Math.ceil(totalItems / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const paginatedBranches = filteredBranches.slice(startIndex, endIndex)

    const content = html`
      <div
        style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;"
      >
        <h2 style="margin: 0;">Conversations Overview</h2>
        <div style="display: flex; gap: 1rem; align-items: center;">
          <!-- Search Bar -->
          <form action="/dashboard" method="get" style="display: flex; gap: 0.5rem;">
            ${domain
              ? html`<input type="hidden" name="domain" value="${escapeHtml(domain)}" />`
              : ''}
            <input type="hidden" name="page" value="1" />
            <input type="hidden" name="per_page" value="${itemsPerPage}" />
            <input
              type="search"
              name="search"
              placeholder="Search conversations..."
              value="${escapeHtml(c.req.query('search') || '')}"
              style="padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem; width: 250px; font-size: 0.875rem;"
            />
            <button
              type="submit"
              class="btn btn-secondary"
              style="padding: 0.5rem 1rem; font-size: 0.875rem;"
            >
              Search
            </button>
          </form>
          <a
            href="/dashboard?refresh=true&page=${currentPage}&per_page=${itemsPerPage}${domain
              ? `&domain=${encodeURIComponent(domain)}`
              : ''}${searchQuery
              ? `&search=${encodeURIComponent(c.req.query('search') || '')}`
              : ''}"
            class="btn btn-secondary"
            style="font-size: 0.875rem;"
          >
            Refresh
          </a>
        </div>
      </div>

      <!-- Domain Filter -->
      <div style="margin-bottom: 1.5rem;">
        <label class="text-sm text-gray-600">Filter by Domain:</label>
        <select
          onchange="window.location.href = '/dashboard' + (this.value ? '?domain=' + this.value : '?') + '&page=1&per_page=${itemsPerPage}${searchQuery
            ? `&search=${encodeURIComponent(c.req.query('search') || '')}`
            : ''}'"
          style="margin-left: 0.5rem; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 0.875rem;"
        >
          <option value="">All Domains</option>
          ${raw(
            uniqueDomains
              .map(
                d =>
                  `<option value="${escapeHtml(d)}" ${domain === d ? 'selected' : ''}>${escapeHtml(d)}</option>`
              )
              .join('')
          )}
        </select>
      </div>

      <!-- Stats Summary -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Total Conversations</div>
          <div class="stat-value">${apiConversations.length}</div>
          <div class="stat-meta">Unique conversations</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Active Accounts</div>
          <div class="stat-value">${uniqueAccounts.length}</div>
          <div class="stat-meta">Unique account IDs</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Messages</div>
          <div class="stat-value">${totalMessages}</div>
          <div class="stat-meta">Across all conversations</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Tokens</div>
          <div class="stat-value">${formatNumber(totalTokens)}</div>
          <div class="stat-meta">Combined usage</div>
        </div>
      </div>

      <!-- Conversation Branches Table -->
      <div class="section">
        <div class="section-header">
          Conversation Branches
          <span class="text-sm text-gray-500" style="float: right;">
            Showing ${paginatedBranches.length} of ${totalItems}
            ${searchQuery ? 'filtered ' : ''}branches (Page ${currentPage} of ${totalPages})
          </span>
        </div>
        <div class="section-content">
          ${paginatedBranches.length === 0
            ? html`<p class="text-gray-500">No conversations found</p>`
            : html`
                <table>
                  <thead>
                    <tr>
                      <th>Conversation</th>
                      <th>Account</th>
                      <th>Domain</th>
                      <th>Messages</th>
                      <th>Tokens</th>
                      <th>Duration</th>
                      <th>Last Activity</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${raw(
                      paginatedBranches
                        .map(branch => {
                          const duration =
                            branch.lastMessage.getTime() - branch.firstMessage.getTime()

                          return `
                            <tr>
                              <td class="text-sm">
                                <a href="/dashboard/conversation/${branch.conversationId}${branch.branch !== 'main' ? `?branch=${branch.branch}` : ''}" 
                                   class="text-blue-600" 
                                   style="font-family: monospace; font-size: 0.75rem;">
                                  ${branch.conversationId.substring(0, 8)}...
                                </a>
                              </td>
                              <td class="text-sm">
                                ${
                                  branch.accountId
                                    ? `<a href="/dashboard/token-usage?accountId=${encodeURIComponent(branch.accountId)}" 
                                         class="text-blue-600" 
                                         style="font-family: monospace; font-size: 0.75rem;"
                                         title="View token usage for ${escapeHtml(branch.accountId)}">
                                        ${escapeHtml(branch.accountId.substring(0, 12))}...
                                      </a>`
                                    : '<span class="text-gray-400">N/A</span>'
                                }
                              </td>
                              <td class="text-sm">${branch.domain}</td>
                              <td class="text-sm">${branch.messageCount}</td>
                              <td class="text-sm">${formatNumber(branch.tokens)}</td>
                              <td class="text-sm">${formatDuration(duration)}</td>
                              <td class="text-sm">${formatTimestamp(branch.lastMessage)}</td>
                              <td class="text-sm">
                                ${
                                  branch.latestRequestId
                                    ? `<a href="/dashboard/request/${branch.latestRequestId}" class="text-blue-600" title="View latest request">Latest →</a>`
                                    : '<span class="text-gray-400">N/A</span>'
                                }
                              </td>
                            </tr>
                          `
                        })
                        .join('')
                    )}
                  </tbody>
                </table>

                ${totalPages > 1
                  ? html`
                      <div
                        style="display: flex; justify-content: center; align-items: center; gap: 1rem; margin-top: 2rem; padding: 1rem 0;"
                      >
                        ${currentPage > 1
                          ? html`
                              <a
                                href="?page=${currentPage - 1}${domain
                                  ? `&domain=${domain}`
                                  : ''}&per_page=${itemsPerPage}${searchQuery
                                  ? `&search=${encodeURIComponent(c.req.query('search') || '')}`
                                  : ''}"
                                class="pagination-link"
                              >
                                ← Previous
                              </a>
                            `
                          : html` <span class="pagination-disabled">← Previous</span> `}

                        <div style="display: flex; gap: 0.5rem;">
                          ${generatePageNumbers(currentPage, totalPages).map(pageNum =>
                            pageNum === '...'
                              ? html`<span style="padding: 0.5rem;">...</span>`
                              : pageNum === currentPage
                                ? html`<span class="pagination-current">${pageNum}</span>`
                                : html`
                                    <a
                                      href="?page=${pageNum}${domain
                                        ? `&domain=${domain}`
                                        : ''}&per_page=${itemsPerPage}${searchQuery
                                        ? `&search=${encodeURIComponent(c.req.query('search') || '')}`
                                        : ''}"
                                      class="pagination-link"
                                    >
                                      ${pageNum}
                                    </a>
                                  `
                          )}
                        </div>

                        ${currentPage < totalPages
                          ? html`
                              <a
                                href="?page=${currentPage + 1}${domain
                                  ? `&domain=${domain}`
                                  : ''}&per_page=${itemsPerPage}${searchQuery
                                  ? `&search=${encodeURIComponent(c.req.query('search') || '')}`
                                  : ''}"
                                class="pagination-link"
                              >
                                Next →
                              </a>
                            `
                          : html` <span class="pagination-disabled">Next →</span> `}

                        <div style="margin-left: 2rem; color: #6b7280; font-size: 0.875rem;">
                          Items per page:
                          <select
                            onchange="window.location.href='?page=1${domain
                              ? `&domain=${domain}`
                              : ''}&per_page=' + this.value + '${searchQuery
                              ? `&search=${encodeURIComponent(c.req.query('search') || '')}`
                              : ''}'"
                            style="margin-left: 0.5rem; padding: 0.25rem 0.5rem; border: 1px solid #e5e7eb; border-radius: 0.375rem;"
                          >
                            <option value="10" ${itemsPerPage === 10 ? 'selected' : ''}>10</option>
                            <option value="25" ${itemsPerPage === 25 ? 'selected' : ''}>25</option>
                            <option value="50" ${itemsPerPage === 50 ? 'selected' : ''}>50</option>
                            <option value="100" ${itemsPerPage === 100 ? 'selected' : ''}>
                              100
                            </option>
                          </select>
                        </div>
                      </div>
                    `
                  : ''}
              `}
        </div>
      </div>
    `

    return c.html(layout('Dashboard', content))
  } catch (error) {
    return c.html(
      layout(
        'Error',
        html`
          <div class="error-banner">
            <strong>Error:</strong> ${getErrorMessage(error) || 'Failed to load conversations'}
          </div>
        `
      )
    )
  }
})

function generatePageNumbers(current: number, total: number): (number | string)[] {
  const pages: (number | string)[] = []
  const maxVisible = 7 // Maximum number of page buttons to show

  if (total <= maxVisible) {
    // Show all pages if total is small
    for (let i = 1; i <= total; i++) {
      pages.push(i)
    }
  } else {
    // Always show first page
    pages.push(1)

    if (current > 3) {
      pages.push('...')
    }

    // Show pages around current
    const start = Math.max(2, current - 1)
    const end = Math.min(total - 1, current + 1)

    for (let i = start; i <= end; i++) {
      pages.push(i)
    }

    if (current < total - 2) {
      pages.push('...')
    }

    // Always show last page
    if (total > 1) {
      pages.push(total)
    }
  }

  return pages
}

function formatTimestamp(timestamp: string | Date): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) {
    return 'Just now'
  }
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}m ago`
  }
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}h ago`
  }

  return date.toLocaleString()
}
