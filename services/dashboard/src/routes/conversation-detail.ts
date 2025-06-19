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
        <div class="error-banner">
          <strong>Error:</strong> Conversation not found
        </div>
      `)
    }
    
    // Build the graph structure
    const graph: ConversationGraph = {
      nodes: conversation.requests.map(req => ({
        id: req.request_id,
        label: `${req.model}`,
        timestamp: new Date(req.timestamp),
        branchId: req.branch_id || 'main',
        parentId: req.parent_message_hash ? 
          conversation.requests.find(r => r.current_message_hash === req.parent_message_hash)?.request_id 
          : undefined,
        tokens: req.total_tokens,
        model: req.model,
        hasError: !!req.error,
      })),
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
    const totalDuration = new Date(conversation.last_message).getTime() - new Date(conversation.first_message).getTime()
    const branchStats = conversation.branches.reduce((acc, branch) => {
      const branchRequests = conversation.requests.filter(r => (r.branch_id || 'main') === branch)
      acc[branch] = {
        count: branchRequests.length,
        tokens: branchRequests.reduce((sum, r) => sum + r.total_tokens, 0),
      }
      return acc
    }, {} as Record<string, { count: number; tokens: number }>)
    
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
        <a href="/dashboard/conversations" class="text-blue-600">← Back to Conversations</a>
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
      <div class="branch-filter">
        <span class="text-sm text-gray-600">Filter by branch:</span>
        <a href="/dashboard/conversation/${conversationId}" 
           class="branch-chip ${!selectedBranch ? 'branch-chip-active' : 'branch-chip-main'}"
           hx-get="/dashboard/conversation/${conversationId}/messages"
           hx-target="#conversation-messages"
           hx-push-url="/dashboard/conversation/${conversationId}">
          All Branches
        </a>
        ${raw(Object.entries(branchStats).map(([branch, stats]) => {
          const color = getBranchColor(branch)
          const isActive = selectedBranch === branch
          return `
            <a href="/dashboard/conversation/${conversationId}?branch=${branch}"
               class="branch-chip ${isActive ? 'branch-chip-active' : ''}"
               style="${!isActive && branch !== 'main' ? `background: ${color}20; color: ${color}; border-color: ${color};` : ''}"
               hx-get="/dashboard/conversation/${conversationId}/messages?branch=${branch}"
               hx-target="#conversation-messages"
               hx-push-url="/dashboard/conversation/${conversationId}?branch=${branch}">
              ${branch} (${stats.count} messages, ${formatNumber(stats.tokens)} tokens)
            </a>
          `
        }).join(''))}
      </div>
      
      <!-- Main Content -->
      <div class="conversation-graph-container">
        <!-- Graph Visualization -->
        <div class="conversation-graph">
          ${raw(svgGraph)}
        </div>
        
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
    
    const filteredRequests = selectedBranch 
      ? conversation.requests.filter(r => r.branch_id === selectedBranch)
      : conversation.requests
    
    return c.html(renderConversationMessages(filteredRequests, conversation.branches))
  } catch (error) {
    return c.html(html`<div class="error-banner">Failed to load messages</div>`)
  }
})

/**
 * Helper to render conversation messages
 */
function renderConversationMessages(requests: any[], branches: string[]) {
  return html`
    <div style="display: grid; gap: 1rem;">
      ${raw(requests.map((req, idx) => {
        const isFirst = idx === 0
        const isLast = idx === requests.length - 1
        const branch = req.branch_id || 'main'
        const branchColor = getBranchColor(branch)
        
        return `
          <div class="section" id="message-${req.request_id}">
            <div class="section-header" style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="font-size: 0.875rem; color: #6b7280;">
                  ${new Date(req.timestamp).toLocaleString()}
                </span>
                ${branch !== 'main' ? `
                  <span style="margin-left: 0.5rem; font-size: 0.7rem; background: ${branchColor}20; color: ${branchColor}; padding: 0.125rem 0.375rem; border-radius: 0.25rem; border: 1px solid ${branchColor};">
                    ${escapeHtml(branch)}
                  </span>
                ` : ''}
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
      }).join(''))}
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
  
  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m`
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