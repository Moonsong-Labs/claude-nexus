import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { getErrorMessage } from '@claude-nexus/shared'
import {
  ConversationGraph,
  calculateGraphLayout,
  renderGraphSVG,
  getBranchColor,
} from '../utils/conversation-graph.js'

export const conversationDetailRoutes = new Hono()

/**
 * Detailed conversation view with graph visualization
 */
conversationDetailRoutes.get('/conversation/:id', async c => {
  const conversationId = c.req.param('id')
  const selectedBranch = c.req.query('branch')

  // Get storage service from container
  const { container } = await import('../container.js')
  const storageService = container.getStorageService()

  try {
    // Get all conversations to find the one we want
    const conversations = await storageService.getConversations(undefined, 1000)
    const conversation = conversations.find(conv => conv.conversation_id === conversationId)

    if (!conversation) {
      return c.html(html`
        <div class="error-banner"><strong>Error:</strong> Conversation not found</div>
      `)
    }

    // For each request, get the detailed information to calculate message counts
    const requestDetailsMap = new Map<string, { messageCount: number; messageTypes: string[] }>()
    
    // Process each request to get message counts and types
    for (const req of conversation.requests) {
      try {
        const details = await storageService.getRequestDetails(req.request_id)
        let messageCount = 0
        const messageTypes: string[] = []
        
        if (details.request_body?.messages) {
          // Count request messages
          messageCount = details.request_body.messages.length
          
          // Get types of last 2 messages in request
          const lastMessages = details.request_body.messages.slice(-2)
          for (const msg of lastMessages) {
            if (Array.isArray(msg.content)) {
              // Check for tool use/results
              const hasToolUse = msg.content.some((c: any) => c.type === 'tool_use')
              const hasToolResult = msg.content.some((c: any) => c.type === 'tool_result')
              if (hasToolUse) {
                messageTypes.push('tool_use')
              } else if (hasToolResult) {
                messageTypes.push('tool_result')
              } else {
                messageTypes.push('text')
              }
            } else {
              messageTypes.push('text')
            }
          }
        }
        
        // Add assistant response
        if (details.response_body?.content || details.response_body?.role === 'assistant') {
          messageCount += 1
          // Check response type
          if (Array.isArray(details.response_body.content)) {
            const hasToolUse = details.response_body.content.some((c: any) => c.type === 'tool_use')
            if (hasToolUse) {
              messageTypes.push('tool_use')
            } else {
              messageTypes.push('text')
            }
          } else {
            messageTypes.push('text')
          }
        }
        
        requestDetailsMap.set(req.request_id, { messageCount, messageTypes: messageTypes.slice(-2) })
      } catch (err) {
        // If we can't get details, use defaults
        requestDetailsMap.set(req.request_id, { messageCount: 0, messageTypes: [] })
      }
    }

    // Build the graph structure
    const graph: ConversationGraph = {
      nodes: conversation.requests.map((req, index) => {
        const details = requestDetailsMap.get(req.request_id) || { messageCount: 0, messageTypes: [] }
        return {
          id: req.request_id,
          label: `${req.model}`,
          timestamp: new Date(req.timestamp),
          branchId: req.branch_id || 'main',
          parentId: req.parent_message_hash
            ? conversation.requests.find(r => r.current_message_hash === req.parent_message_hash)
                ?.request_id
            : undefined,
          tokens: req.total_tokens,
          model: req.model,
          hasError: !!req.error,
          messageIndex: index + 1, // 1-based index
          messageCount: details.messageCount,
          messageTypes: details.messageTypes,
        }
      }),
      edges: [],
    }

    // Build edges from parent relationships
    graph.nodes.forEach(node => {
      if (node.parentId) {
        graph.edges.push({
          source: node.parentId,
          target: node.id,
        })
      }
    })

    // Calculate layout
    const graphLayout = await calculateGraphLayout(graph)
    const svgGraph = renderGraphSVG(graphLayout, true)

    // Filter requests by branch if selected
    const filteredRequests = selectedBranch
      ? conversation.requests.filter(r => r.branch_id === selectedBranch)
      : conversation.requests

    // Calculate stats
    const totalDuration =
      new Date(conversation.last_message).getTime() - new Date(conversation.first_message).getTime()
    const branchStats = conversation.branches.reduce(
      (acc, branch) => {
        const branchRequests = conversation.requests.filter(r => (r.branch_id || 'main') === branch)
        acc[branch] = {
          count: branchRequests.length,
          tokens: branchRequests.reduce((sum, r) => sum + r.total_tokens, 0),
        }
        return acc
      },
      {} as Record<string, { count: number; tokens: number }>
    )

    // Add main branch if not present
    if (!branchStats.main) {
      const mainRequests = conversation.requests.filter(r => !r.branch_id || r.branch_id === 'main')
      branchStats.main = {
        count: mainRequests.length,
        tokens: mainRequests.reduce((sum, r) => sum + r.total_tokens, 0),
      }
    }

    const content = html`
      <div class="mb-6">
        <a href="/dashboard" class="text-blue-600">← Back to Dashboard</a>
      </div>

      <h2 style="margin: 0 0 1.5rem 0;">Conversation Details</h2>

      <!-- Stats Grid -->
      <div class="conversation-stats-grid">
        <div class="conversation-stat-card">
          <div class="conversation-stat-label">Total Messages</div>
          <div class="conversation-stat-value">${conversation.message_count}</div>
        </div>
        <div class="conversation-stat-card">
          <div class="conversation-stat-label">Total Tokens</div>
          <div class="conversation-stat-value">${conversation.total_tokens.toLocaleString()}</div>
        </div>
        <div class="conversation-stat-card">
          <div class="conversation-stat-label">Branches</div>
          <div class="conversation-stat-value">${Object.keys(branchStats).length}</div>
        </div>
        <div class="conversation-stat-card">
          <div class="conversation-stat-label">Duration</div>
          <div class="conversation-stat-value">${formatDuration(totalDuration)}</div>
        </div>
      </div>

      <!-- Branch Filter -->
      <div class="branch-filter" id="branch-filter">
        <span class="text-sm text-gray-600">Filter by branch:</span>
        <a
          href="/dashboard/conversation/${conversationId}"
          class="branch-chip ${!selectedBranch ? 'branch-chip-active' : 'branch-chip-main'}"
          style="${!selectedBranch ? 'background: #f3f4f6; color: #1f2937; border-color: #9ca3af;' : ''}"
        >
          All Branches
        </a>
        ${raw(
          Object.entries(branchStats)
            .map(([branch, stats]) => {
              const color = getBranchColor(branch)
              const isActive = selectedBranch === branch
              return `
            <a href="/dashboard/conversation/${conversationId}?branch=${branch}"
               class="branch-chip ${isActive ? 'branch-chip-active' : ''}"
               style="${branch !== 'main' ? `background: ${color}20; color: ${color}; border-color: ${color};` : 'background: #f3f4f6; color: #4b5563; border-color: #e5e7eb;'}${isActive ? ' font-weight: 600;' : ''}">
              ${branch} (${stats.count} messages, ${formatNumber(stats.tokens)} tokens)
            </a>
          `
            })
            .join('')
        )}
      </div>

      <!-- Main Content -->
      <div class="conversation-graph-container">
        <!-- Graph Visualization -->
        <div class="conversation-graph">${raw(svgGraph)}</div>

        <!-- Timeline -->
        <div class="conversation-timeline" id="conversation-messages">
          ${raw(renderConversationMessages(filteredRequests, conversation.branches))}
        </div>
      </div>
    `

    // Use the shared layout from dashboard-api
    const { layout: dashboardLayout } = await import('./dashboard-api.js')
    return c.html(dashboardLayout('Conversation Detail', content))
  } catch (_error) {
    return c.html(html`
      <div class="error-banner">
        <strong>Error:</strong> ${getErrorMessage(_error) || 'Failed to load conversation'}
      </div>
    `)
  }
})

/**
 * HTMX endpoint for updating just the messages part
 */
conversationDetailRoutes.get('/conversation/:id/messages', async c => {
  const conversationId = c.req.param('id')
  const selectedBranch = c.req.query('branch')

  // Get storage service from container
  const { container } = await import('../container.js')
  const storageService = container.getStorageService()

  try {
    const conversations = await storageService.getConversations(undefined, 1000)
    const conversation = conversations.find(conv => conv.conversation_id === conversationId)

    if (!conversation) {
      return c.html(html`<div class="error-banner">Conversation not found</div>`)
    }

    const filteredRequests = selectedBranch
      ? conversation.requests.filter(r => r.branch_id === selectedBranch)
      : conversation.requests

    return c.html(renderConversationMessages(filteredRequests, conversation.branches))
  } catch (_error) {
    return c.html(html`<div class="error-banner">Failed to load messages</div>`)
  }
})

/**
 * Helper to render conversation messages
 */
function renderConversationMessages(requests: any[], _branches: string[]) {
  // Sort requests by timestamp in descending order (newest first)
  const sortedRequests = [...requests].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  return html`
    <div style="display: grid; gap: 1rem;">
      ${raw(
        sortedRequests
          .map((req, idx) => {
            const _isFirst = idx === 0
            const _isLast = idx === sortedRequests.length - 1
            const branch = req.branch_id || 'main'
            const branchColor = getBranchColor(branch)

            return `
          <div class="section" id="message-${req.request_id}">
            <div class="section-header" style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="font-size: 0.875rem; color: #6b7280;">
                  ${new Date(req.timestamp).toLocaleString()}
                </span>
                ${
                  branch !== 'main'
                    ? `
                  <span style="margin-left: 0.5rem; font-size: 0.7rem; background: ${branchColor}20; color: ${branchColor}; padding: 0.125rem 0.375rem; border-radius: 0.25rem; border: 1px solid ${branchColor};">
                    ${escapeHtml(branch)}
                  </span>
                `
                    : ''
                }
              </div>
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <span class="text-sm text-gray-600">${req.model}</span>
                <span class="text-sm text-gray-600">${formatNumber(req.total_tokens)} tokens</span>
                ${req.error ? '<span style="color: #ef4444; font-size: 0.875rem;">Error</span>' : ''}
              </div>
            </div>
            <div class="section-content">
              <div class="text-sm text-gray-500">
                Request ID: ${req.request_id}
                ${req.current_message_hash ? `<br>Message Hash: ${req.current_message_hash.substring(0, 8)}...` : ''}
              </div>
              <a href="/dashboard/request/${req.request_id}" class="text-sm text-blue-600" style="display: inline-block; margin-top: 0.5rem;">
                View full details →
              </a>
            </div>
          </div>
        `
          })
          .join('')
      )}
    </div>
  `
}

// Helper functions
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toString()
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return `${days}d ${hours % 24}h`
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m`
  }
  return `${seconds}s`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
