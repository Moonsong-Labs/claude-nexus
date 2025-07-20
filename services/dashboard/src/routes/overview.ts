import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { ProxyApiClient } from '../services/api-client.js'
import { getErrorMessage } from '@claude-nexus/shared'
import {
  formatNumber,
  formatDuration,
  escapeHtml,
  formatRelativeTime,
} from '../utils/formatters.js'
import { layout } from '../layout/index.js'
import type { ConversationBranch } from '../types/conversation.js'
import {
  getBranchDisplayInfo,
  renderBatteryIndicator,
  generatePageNumbers,
} from '../utils/conversation-display.js'
import {
  calculateConversationStats,
  filterConversations,
  sortConversationsByRecent,
  paginateConversations,
} from '../utils/overview-data.js'
import {
  DEFAULT_PAGE,
  DEFAULT_ITEMS_PER_PAGE,
  MIN_ITEMS_PER_PAGE,
  MAX_ITEMS_PER_PAGE,
  MAX_CONVERSATIONS_FETCH,
  CONVERSATION_ID_DISPLAY_LENGTH,
  ACCOUNT_ID_MAX_DISPLAY_LENGTH,
  MAX_VISIBLE_PAGE_BUTTONS,
  PAGINATION_OPTIONS,
} from '../constants/overview.js'

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
  const page = parseInt(c.req.query('page') || String(DEFAULT_PAGE))
  const perPage = parseInt(c.req.query('per_page') || String(DEFAULT_ITEMS_PER_PAGE))
  const searchQuery = c.req.query('search')?.toLowerCase()

  // Validate pagination params
  const currentPage = Math.max(1, page)
  const itemsPerPage = Math.min(Math.max(MIN_ITEMS_PER_PAGE, perPage), MAX_ITEMS_PER_PAGE)

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
    const conversationsResult = await apiClient.getConversations({
      domain,
      limit: MAX_CONVERSATIONS_FETCH,
    })
    const apiConversations = conversationsResult.conversations

    // Create flat list of conversations
    const conversationBranches: ConversationBranch[] = []

    // Process API conversations
    apiConversations.forEach(conv => {
      conversationBranches.push({
        conversationId: conv.conversationId,
        accountId: conv.accountId,
        branch: 'main', // API doesn't return branch info yet
        branchCount: conv.branchCount || 1,
        subtaskBranchCount: conv.subtaskBranchCount || 0,
        compactBranchCount: conv.compactBranchCount || 0,
        userBranchCount: conv.userBranchCount || 0,
        messageCount: conv.messageCount,
        tokens: conv.totalTokens,
        firstMessage: new Date(conv.firstMessageTime),
        lastMessage: new Date(conv.lastMessageTime),
        domain: conv.domain,
        latestRequestId: conv.latestRequestId,
        latestModel: conv.latestModel,
        latestContextTokens: conv.latestContextTokens,
        isSubtask: conv.isSubtask,
        parentTaskRequestId: conv.parentTaskRequestId,
        parentConversationId: conv.parentConversationId,
        subtaskMessageCount: conv.subtaskMessageCount,
      })
    })

    // Apply search filter and sorting
    const filteredBranches = filterConversations(conversationBranches, searchQuery)
    const sortedBranches = sortConversationsByRecent(filteredBranches)

    // Calculate statistics
    const stats = calculateConversationStats(conversationBranches)

    // Apply pagination
    const { paginatedBranches, totalItems, totalPages } = paginateConversations(
      sortedBranches,
      currentPage,
      itemsPerPage
    )

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
            stats.uniqueDomains
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
          <div class="stat-value">${stats.uniqueAccounts.length}</div>
          <div class="stat-meta">Unique account IDs</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Requests</div>
          <div class="stat-value">${stats.totalRequests}</div>
          <div class="stat-meta">Across all conversations</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Tokens</div>
          <div class="stat-value">${formatNumber(stats.totalTokens)}</div>
          <div class="stat-meta">Combined usage</div>
        </div>
      </div>

      <!-- Conversations Table -->
      <div class="section">
        <div class="section-header">
          Conversations
          <span class="text-sm text-gray-500" style="float: right;">
            Showing ${paginatedBranches.length} of ${totalItems}
            ${searchQuery ? 'filtered ' : ''}conversations (Page ${currentPage} of ${totalPages})
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
                      <th>Branches</th>
                      <th>Account</th>
                      <th>Domain</th>
                      <th>Requests</th>
                      <th>Tokens</th>
                      <th>Context</th>
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
                                  ${branch.conversationId.substring(0, CONVERSATION_ID_DISPLAY_LENGTH)}...
                                </a>
                              </td>
                              <td class="text-sm">
                                ${(() => {
                                  const branchInfo = getBranchDisplayInfo(branch)
                                  return `<span style="color: ${branchInfo.color}; font-weight: ${branchInfo.fontWeight};" ${branchInfo.titleText ? `title="${branchInfo.titleText}"` : ''}>
                                    ${branchInfo.displayText}
                                  </span>`
                                })()}
                              </td>
                              <td class="text-sm">
                                ${
                                  branch.accountId
                                    ? `<a href="/dashboard/token-usage?accountId=${encodeURIComponent(branch.accountId)}" 
                                         class="text-blue-600" 
                                         style="font-family: monospace; font-size: 0.75rem;"
                                         title="View token usage for ${escapeHtml(branch.accountId)}">
                                        ${
                                          branch.accountId.length > ACCOUNT_ID_MAX_DISPLAY_LENGTH
                                            ? escapeHtml(
                                                branch.accountId.substring(
                                                  0,
                                                  ACCOUNT_ID_MAX_DISPLAY_LENGTH - 3
                                                )
                                              ) + '...'
                                            : escapeHtml(branch.accountId)
                                        }
                                      </a>`
                                    : '<span class="text-gray-400">N/A</span>'
                                }
                              </td>
                              <td class="text-sm">${escapeHtml(branch.domain)}</td>
                              <td class="text-sm">${branch.messageCount}</td>
                              <td class="text-sm">${formatNumber(branch.tokens)}</td>
                              <td class="text-sm">${
                                branch.latestContextTokens && branch.latestModel
                                  ? renderBatteryIndicator(
                                      branch.latestContextTokens,
                                      branch.latestModel
                                    )
                                  : '<span class="text-gray-400">-</span>'
                              }</td>
                              <td class="text-sm">${formatDuration(duration)}</td>
                              <td class="text-sm">${formatRelativeTime(branch.lastMessage)}</td>
                              <td class="text-sm">
                                <div style="display: flex; gap: 0.5rem; align-items: center;">
                                  ${
                                    branch.parentTaskRequestId
                                      ? `<a href="/dashboard/request/${branch.parentTaskRequestId}" class="text-purple-600" title="View parent task" style="font-size: 0.75rem;">Parent ↑</a>`
                                      : ''
                                  }
                                  ${
                                    branch.latestRequestId
                                      ? `<a href="/dashboard/request/${branch.latestRequestId}" class="text-blue-600" title="View latest request">Latest →</a>`
                                      : '<span class="text-gray-400">N/A</span>'
                                  }
                                </div>
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
                          ${generatePageNumbers(
                            currentPage,
                            totalPages,
                            MAX_VISIBLE_PAGE_BUTTONS
                          ).map(pageNum =>
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
                            ${PAGINATION_OPTIONS.map(
                              option => html`
                                <option
                                  value="${option}"
                                  ${itemsPerPage === option ? 'selected' : ''}
                                >
                                  ${option}
                                </option>
                              `
                            )}
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
