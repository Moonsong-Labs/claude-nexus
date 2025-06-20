import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { getErrorMessage } from '@claude-nexus/shared'
import {
  ConversationGraph,
  calculateGraphLayout,
  renderGraphSVG,
  getBranchColor,
} from '../utils/conversation-graph.js'
import { formatNumber, formatDuration, escapeHtml } from '../utils/formatters.js'
import type { ConversationRequest, ConversationSummary } from '../types/conversation.js'

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

    // Use the actual message count from the database
    const requestDetailsMap = new Map<string, { messageCount: number; messageTypes: string[] }>()
    
    conversation.requests.forEach((req, index) => {
      // Use the actual message count from the request
      const messageCount = req.message_count || 0
      
      // Simple type assignment based on position
      const messageTypes: string[] = []
      const isFirst = index === 0
      if (!isFirst) {
        messageTypes.push('user') // Previous user message
      }
      messageTypes.push('assistant') // Current assistant response
      
      requestDetailsMap.set(req.request_id, { 
        messageCount: messageCount,
        messageTypes: messageTypes.slice(-2)
      })
    })

    // Build the graph structure - keep original relationships but display in reverse order
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
          messageIndex: index + 1,
          messageCount: details.messageCount,
          messageTypes: details.messageTypes,
        }
      }),
      edges: [],
    }

    // Build edges from parent relationships with branch awareness
    conversation.requests.forEach((req, index) => {
      if (req.parent_message_hash) {
        // Find the parent request
        // When multiple requests have the same message hash, prefer:
        // 1. Same branch
        // 2. Most recent before this request
        const potentialParents = conversation.requests.filter(r => 
          r.current_message_hash === req.parent_message_hash &&
          new Date(r.timestamp) < new Date(req.timestamp)
        )
        
        let parentReq
        if (potentialParents.length === 1) {
          parentReq = potentialParents[0]
        } else if (potentialParents.length > 1) {
          // Multiple parents with same hash - prefer same branch
          parentReq = potentialParents.find(p => p.branch_id === req.branch_id) || 
                     potentialParents.sort((a, b) => 
                       new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                     )[0]
        }
        
        if (parentReq) {
          graph.edges.push({
            source: parentReq.request_id,
            target: req.request_id,
          })
        }
      }
    })

    // Calculate layout with reversed flag to show newest at top
    const graphLayout = await calculateGraphLayout(graph, true)
    const svgGraph = renderGraphSVG(graphLayout, true)

    // Filter requests by branch if selected
    let filteredRequests = conversation.requests
    if (selectedBranch && selectedBranch !== 'main') {
      // Find the first request in the selected branch
      const branchRequests = conversation.requests.filter(r => r.branch_id === selectedBranch)
      if (branchRequests.length > 0) {
        // Sort by timestamp to get the first request in the branch
        branchRequests.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        const firstBranchRequest = branchRequests[0]
        
        // Get all requests from main branch that happened before the branch diverged
        const mainRequestsBeforeBranch = conversation.requests.filter(r => 
          (r.branch_id === 'main' || !r.branch_id) && 
          new Date(r.timestamp) < new Date(firstBranchRequest.timestamp)
        )
        
        // Combine main requests before branch + all branch requests
        filteredRequests = [...mainRequestsBeforeBranch, ...branchRequests]
      } else {
        filteredRequests = branchRequests
      }
    } else if (selectedBranch === 'main') {
      // For main branch, show only main branch requests
      filteredRequests = conversation.requests.filter(r => r.branch_id === 'main' || !r.branch_id)
    }

    // Calculate stats
    const totalDuration =
      new Date(conversation.last_message).getTime() - new Date(conversation.first_message).getTime()
    const branchStats = conversation.branches.reduce(
      (acc, branch) => {
        const branchRequests = conversation.requests.filter(r => (r.branch_id || 'main') === branch)
        // Get the max message count from the branch (latest request has the highest count)
        const maxMessageCount = Math.max(...branchRequests.map(r => r.message_count || 0), 0)
        acc[branch] = {
          count: maxMessageCount,
          tokens: branchRequests.reduce((sum, r) => sum + r.total_tokens, 0),
          requests: branchRequests.length,
          firstMessage: branchRequests.length > 0 ? Math.min(...branchRequests.map(r => new Date(r.timestamp).getTime())) : 0,
          lastMessage: branchRequests.length > 0 ? Math.max(...branchRequests.map(r => new Date(r.timestamp).getTime())) : 0,
        }
        return acc
      },
      {} as Record<string, { count: number; tokens: number; requests: number; firstMessage: number; lastMessage: number }>
    )

    // Add main branch if not present
    if (!branchStats.main) {
      const mainRequests = conversation.requests.filter(r => !r.branch_id || r.branch_id === 'main')
      // Get the max message count from the main branch
      const maxMessageCount = Math.max(...mainRequests.map(r => r.message_count || 0), 0)
      branchStats.main = {
        count: maxMessageCount,
        tokens: mainRequests.reduce((sum, r) => sum + r.total_tokens, 0),
        requests: mainRequests.length,
        firstMessage: mainRequests.length > 0 ? Math.min(...mainRequests.map(r => new Date(r.timestamp).getTime())) : 0,
        lastMessage: mainRequests.length > 0 ? Math.max(...mainRequests.map(r => new Date(r.timestamp).getTime())) : 0,
      }
    }

    // Calculate stats for selected branch or total
    let displayStats
    if (selectedBranch && branchStats[selectedBranch]) {
      // For branch stats, use the filtered requests which include main branch history
      const maxMessageCount = Math.max(...filteredRequests.map(r => r.message_count || 0), 0)
      const totalTokens = filteredRequests.reduce((sum, r) => sum + r.total_tokens, 0)
      const timestamps = filteredRequests.map(r => new Date(r.timestamp).getTime())
      const duration = timestamps.length > 0 ? Math.max(...timestamps) - Math.min(...timestamps) : 0
      
      displayStats = {
        messageCount: maxMessageCount,
        totalTokens: totalTokens,
        branchCount: 1,
        duration: duration,
        requestCount: filteredRequests.length,
      }
    } else {
      // Show total stats for all branches
      displayStats = {
        messageCount: conversation.message_count || 0,
        totalTokens: conversation.total_tokens,
        branchCount: Object.keys(branchStats).length,
        duration: totalDuration,
        requestCount: conversation.requests.length,
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
          <div class="conversation-stat-label">${selectedBranch ? 'Branch' : 'Total'} Messages</div>
          <div class="conversation-stat-value">${displayStats.messageCount}</div>
        </div>
        <div class="conversation-stat-card">
          <div class="conversation-stat-label">${selectedBranch ? 'Branch' : 'Total'} Tokens</div>
          <div class="conversation-stat-value">${displayStats.totalTokens.toLocaleString()}</div>
        </div>
        <div class="conversation-stat-card">
          <div class="conversation-stat-label">${selectedBranch ? 'Branch Requests' : 'Branches'}</div>
          <div class="conversation-stat-value">${selectedBranch ? displayStats.requestCount : displayStats.branchCount}</div>
        </div>
        <div class="conversation-stat-card">
          <div class="conversation-stat-label">Duration</div>
          <div class="conversation-stat-value">${formatDuration(displayStats.duration)}</div>
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
  } catch (error) {
    console.error('Error loading conversation detail:', error)
    return c.html(html`
      <div class="error-banner">
        <strong>Error:</strong> ${getErrorMessage(error) || 'Failed to load conversation'}
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

    let filteredRequests = conversation.requests
    if (selectedBranch && selectedBranch !== 'main') {
      // Find the first request in the selected branch
      const branchRequests = conversation.requests.filter(r => r.branch_id === selectedBranch)
      if (branchRequests.length > 0) {
        // Sort by timestamp to get the first request in the branch
        branchRequests.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        const firstBranchRequest = branchRequests[0]
        
        // Get all requests from main branch that happened before the branch diverged
        const mainRequestsBeforeBranch = conversation.requests.filter(r => 
          (r.branch_id === 'main' || !r.branch_id) && 
          new Date(r.timestamp) < new Date(firstBranchRequest.timestamp)
        )
        
        // Combine main requests before branch + all branch requests
        filteredRequests = [...mainRequestsBeforeBranch, ...branchRequests]
      } else {
        filteredRequests = branchRequests
      }
    } else if (selectedBranch === 'main') {
      // For main branch, show only main branch requests
      filteredRequests = conversation.requests.filter(r => r.branch_id === 'main' || !r.branch_id)
    }

    return c.html(renderConversationMessages(filteredRequests, conversation.branches))
  } catch (error) {
    console.error('Error loading conversation messages:', error)
    return c.html(html`<div class="error-banner">Failed to load messages</div>`)
  }
})

/**
 * Helper to render conversation messages
 */
function renderConversationMessages(requests: ConversationRequest[], _branches: string[]) {
  // Sort requests by timestamp in descending order (newest first)
  const sortedRequests = [...requests].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  return html`
    <div style="display: grid; gap: 0.25rem;">
      ${raw(
        sortedRequests
          .map(req => {
            const branch = req.branch_id || 'main'
            const branchColor = getBranchColor(branch)

            return `
          <div class="section" id="message-${req.request_id}">
            <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; padding: 0.625rem 1rem;">
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
              <div style="display: flex; gap: 0.75rem; align-items: center;">
                <span class="text-sm text-gray-600">${req.message_count || 0} messages</span>
                <span class="text-sm text-gray-600">${formatNumber(req.total_tokens)} tokens</span>
                ${req.error ? '<span style="color: #ef4444; font-size: 0.875rem;">Error</span>' : ''}
              </div>
            </div>
            <div class="section-content" style="padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center;">
              <div class="text-sm text-gray-500">
                Request ID: ${req.request_id}
              </div>
              <a href="/dashboard/request/${req.request_id}" class="text-sm text-blue-600">
                View details →
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

