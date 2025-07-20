import { Hono } from 'hono'
import { html, raw } from 'hono/html'
import { getErrorMessage } from '@claude-nexus/shared'
import { csrfProtection } from '../middleware/csrf.js'
import { calculateGraphLayout, renderGraphSVG } from '../utils/conversation-graph.js'
import { calculateConversationMetrics } from '../utils/conversation-metrics.js'
import type { ConversationRequest } from '../types/conversation.js'
// Removed unused imports - these are now only used in conversation-ui.ts
import {
  buildConversationGraph,
  type EnrichedInvocation,
} from '../utils/conversation-graph-data.js'
import {
  renderStatsGrid,
  renderBranchFilter,
  renderTabNavigation,
  renderConversationHeader,
  renderConversationMessage,
} from '../components/conversation-ui.js'
// Removed unused import - getBranchColor is now only used in components

export const conversationDetailRoutes = new Hono<{
  Variables: {
    csrfToken?: string
  }
}>()

// Apply CSRF protection to all routes
conversationDetailRoutes.use('*', csrfProtection())

/**
 * Detailed conversation view with graph visualization
 */
conversationDetailRoutes.get('/conversation/:id', async c => {
  const conversationId = c.req.param('id')
  const selectedBranch = c.req.query('branch')
  const view = c.req.query('view') || 'tree' // Default to tree view

  // Get storage service from container
  const { container } = await import('../container.js')
  const storageService = container.getStorageService()

  try {
    // Get the specific conversation by ID - optimized query
    const conversation = await storageService.getConversationById(conversationId)

    if (!conversation) {
      return c.html(html`
        <div class="error-banner"><strong>Error:</strong> Conversation not found</div>
      `)
    }

    // Build the conversation graph using the new helper
    const { graph, requestMap, subtasksMap } = await buildConversationGraph(
      conversation.requests,
      storageService
    )

    // Calculate layout with reversed flag to show newest at top
    const graphLayout = await calculateGraphLayout(graph, true, requestMap)
    const svgGraph = renderGraphSVG(graphLayout, true)

    // Filter requests by branch if selected
    let filteredRequests = conversation.requests
    if (selectedBranch && selectedBranch !== 'main') {
      // Find the first request in the selected branch
      const branchRequests = conversation.requests.filter(r => r.branch_id === selectedBranch)
      if (branchRequests.length > 0) {
        // Sort by timestamp to get the first request in the branch
        branchRequests.sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
        const firstBranchRequest = branchRequests[0]

        // Get all requests from main branch that happened before the branch diverged
        const mainRequestsBeforeBranch = conversation.requests.filter(
          r =>
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

    // Calculate AI inference time (sum of all request durations)
    const totalInferenceTime = conversation.requests.reduce(
      (sum, req) => sum + (req.duration_ms || 0),
      0
    )

    // Calculate current context size (last request of conversation)
    // Total input tokens = input_tokens + cache_read_input_tokens + cache_creation_input_tokens
    let currentContextSize = 0
    const lastRequest = conversation.requests[conversation.requests.length - 1]
    if (lastRequest?.response_body?.usage) {
      const usage = lastRequest.response_body.usage
      currentContextSize =
        (usage.input_tokens || 0) +
        (usage.cache_read_input_tokens || 0) +
        (usage.cache_creation_input_tokens || 0)
    }

    const branchStats = conversation.branches.reduce(
      (acc, branch) => {
        const branchRequests = conversation.requests.filter(r => (r.branch_id || 'main') === branch)
        // Get the max message count from the branch (latest request has the highest count)
        const maxMessageCount = Math.max(...branchRequests.map(r => r.message_count || 0), 0)

        // Calculate context size for the last request of this branch
        let branchContextSize = 0
        if (branchRequests.length > 0) {
          const lastBranchRequest = branchRequests[branchRequests.length - 1]
          if (lastBranchRequest?.response_body?.usage) {
            const usage = lastBranchRequest.response_body.usage
            branchContextSize =
              (usage.input_tokens || 0) +
              (usage.cache_read_input_tokens || 0) +
              (usage.cache_creation_input_tokens || 0)
          }
        }

        acc[branch] = {
          count: maxMessageCount,
          tokens: branchRequests.reduce((sum, r) => sum + r.total_tokens, 0),
          requests: branchRequests.length,
          firstMessage:
            branchRequests.length > 0
              ? Math.min(...branchRequests.map(r => new Date(r.timestamp).getTime()))
              : 0,
          lastMessage:
            branchRequests.length > 0
              ? Math.max(...branchRequests.map(r => new Date(r.timestamp).getTime()))
              : 0,
          contextSize: branchContextSize,
        }
        return acc
      },
      {} as Record<
        string,
        {
          count: number
          tokens: number
          requests: number
          firstMessage: number
          lastMessage: number
          contextSize: number
        }
      >
    )

    // Add main branch if not present
    if (!branchStats.main) {
      const mainRequests = conversation.requests.filter(r => !r.branch_id || r.branch_id === 'main')
      // Get the max message count from the main branch
      const maxMessageCount = Math.max(...mainRequests.map(r => r.message_count || 0), 0)

      // Calculate context size for the last request of main branch
      let mainBranchContextSize = 0
      if (mainRequests.length > 0) {
        const lastMainRequest = mainRequests[mainRequests.length - 1]
        if (lastMainRequest?.response_body?.usage) {
          const usage = lastMainRequest.response_body.usage
          mainBranchContextSize =
            (usage.input_tokens || 0) +
            (usage.cache_read_input_tokens || 0) +
            (usage.cache_creation_input_tokens || 0)
        }
      }

      branchStats.main = {
        count: maxMessageCount,
        tokens: mainRequests.reduce((sum, r) => sum + r.total_tokens, 0),
        requests: mainRequests.length,
        firstMessage:
          mainRequests.length > 0
            ? Math.min(...mainRequests.map(r => new Date(r.timestamp).getTime()))
            : 0,
        lastMessage:
          mainRequests.length > 0
            ? Math.max(...mainRequests.map(r => new Date(r.timestamp).getTime()))
            : 0,
        contextSize: mainBranchContextSize,
      }
    }

    // Calculate total sub-tasks spawned by this conversation
    // First, get the actual count of sub-task requests linked to this conversation
    let totalSubtasksSpawned = 0

    // Get request IDs that have task invocations
    const requestIdsWithTasks = conversation.requests
      .filter(
        req =>
          req.task_tool_invocation &&
          Array.isArray(req.task_tool_invocation) &&
          req.task_tool_invocation.length > 0
      )
      .map(req => req.request_id)

    if (requestIdsWithTasks.length > 0) {
      // Count actual sub-tasks linked to these requests
      totalSubtasksSpawned = await storageService.countSubtasksForRequests(requestIdsWithTasks)
    }

    // Calculate metrics for all requests (conversation level)
    const allMetrics = calculateConversationMetrics(conversation.requests)

    // Calculate conversation-level stats
    const conversationStats = {
      messageCount: conversation.message_count || 0,
      totalTokens: conversation.total_tokens,
      branchCount: Object.keys(branchStats).length,
      duration: totalDuration,
      inferenceTime: totalInferenceTime,
      requestCount: conversation.requests.length,
      totalSubtasks: totalSubtasksSpawned,
      toolExecution: allMetrics.toolExecution,
      userReply: allMetrics.userReply,
      userInteractions: allMetrics.userInteractions,
      currentContextSize: currentContextSize,
    }

    // Calculate branch-specific stats if a branch is selected
    let selectedBranchStats = null
    if (selectedBranch) {
      // Calculate metrics for filtered requests (includes parent branches)
      const branchMetrics = calculateConversationMetrics(filteredRequests)

      // For cumulative stats, use all filtered requests (includes parent branches)
      const cumulativeTokens = filteredRequests.reduce((sum, r) => sum + r.total_tokens, 0)
      const cumulativeInferenceTime = filteredRequests.reduce(
        (sum, req) => sum + (req.duration_ms || 0),
        0
      )

      // Calculate cumulative duration (from first to last request in filtered set)
      let cumulativeDuration = 0
      if (filteredRequests.length > 0) {
        const timestamps = filteredRequests.map(r => new Date(r.timestamp).getTime())
        cumulativeDuration = Math.max(...timestamps) - Math.min(...timestamps)
      }

      // Calculate sub-tasks for all filtered requests
      let cumulativeSubtasks = 0
      const cumulativeRequestIdsWithTasks = filteredRequests
        .filter(
          req =>
            req.task_tool_invocation &&
            Array.isArray(req.task_tool_invocation) &&
            req.task_tool_invocation.length > 0
        )
        .map(req => req.request_id)

      if (cumulativeRequestIdsWithTasks.length > 0) {
        cumulativeSubtasks = await storageService.countSubtasksForRequests(
          cumulativeRequestIdsWithTasks
        )
      }

      // Get the maximum message count from filtered requests (cumulative)
      const maxMessageCount = Math.max(...filteredRequests.map(r => r.message_count || 0), 0)

      // Get context size from branchStats
      const branchContextSize = branchStats[selectedBranch]?.contextSize || 0

      selectedBranchStats = {
        branchName: selectedBranch,
        messageCount: maxMessageCount,
        totalTokens: cumulativeTokens,
        duration: cumulativeDuration,
        inferenceTime: cumulativeInferenceTime,
        requestCount: filteredRequests.length,
        totalSubtasks: cumulativeSubtasks,
        toolExecution: branchMetrics.toolExecution,
        userReply: branchMetrics.userReply,
        userInteractions: branchMetrics.userInteractions,
        currentContextSize: branchContextSize,
      }
    }

    const content = html`
      <div class="mb-6">
        <a href="/dashboard" class="text-blue-600">← Back to Dashboard</a>
      </div>

      <!-- Conversation Details Panel -->
      <div style="margin-bottom: 2rem;">
        ${renderConversationHeader(conversationId)}
        ${renderStatsGrid(conversationStats, 'Conversation Details')}
      </div>

      <!-- Branch Details Panel (only show when a branch is selected) -->
      ${selectedBranchStats ? renderStatsGrid(selectedBranchStats, 'Branch Details:') : ''}

      <!-- Branch Filter -->
      ${renderBranchFilter(conversationId, selectedBranch, branchStats)}

      <!-- Tab Navigation -->
      ${renderTabNavigation(view)}

      <!-- Main Content -->
      <div class="conversation-content">
        <!-- Graph Visualization -->
        <div
          id="tree-panel"
          class="conversation-graph"
          style="display: ${view === 'tree'
            ? 'block'
            : 'none'}; width: 100%; position: relative; overflow: hidden; cursor: grab;"
        >
          <div id="tree-container" style="position: relative; transform: translate(0px, 0px);">
            ${raw(svgGraph)}
          </div>
        </div>

        <!-- Timeline -->
        <div
          id="timeline-panel"
          class="conversation-timeline"
          style="display: ${view === 'timeline' ? 'block' : 'none'};"
        >
          ${raw(renderConversationMessages(filteredRequests, conversation.branches, subtasksMap))}
        </div>

        <!-- AI Analysis -->
        <div
          id="analytics-panel"
          class="conversation-analytics"
          style="display: ${view === 'analytics' ? 'block' : 'none'};"
        >
          <!-- AI Analysis Panel -->
          <div
            id="analysis-panel"
            hx-get="/partials/analysis/status/${conversationId}/${selectedBranch || 'main'}"
            hx-trigger="load"
            hx-swap="outerHTML"
          >
            <div class="section">
              <div class="section-content">
                <div style="display: flex; align-items: center; gap: 0.75rem; color: #6b7280;">
                  <span class="spinner"></span>
                  <span>Loading AI Analysis...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        // Tab switching functionality
        function switchTab(tabName) {
          // Update panel visibility
          document.getElementById('tree-panel').style.display =
            tabName === 'tree' ? 'block' : 'none'
          document.getElementById('timeline-panel').style.display =
            tabName === 'timeline' ? 'block' : 'none'
          document.getElementById('analytics-panel').style.display =
            tabName === 'analytics' ? 'block' : 'none'

          // Update tab styles
          const treeTab = document.getElementById('tree-tab')
          const timelineTab = document.getElementById('timeline-tab')
          const analyticsTab = document.getElementById('analytics-tab')

          // Reset all tabs
          const allTabs = [treeTab, timelineTab, analyticsTab]
          allTabs.forEach(tab => {
            tab.style.borderBottomColor = 'transparent'
            tab.style.color = '#6b7280'
            tab.classList.remove('tab-active')
            tab.classList.add('tab-inactive')
          })

          // Activate selected tab
          const activeTab =
            tabName === 'tree' ? treeTab : tabName === 'timeline' ? timelineTab : analyticsTab
          activeTab.style.borderBottomColor = '#3b82f6'
          activeTab.style.color = '#3b82f6'
          activeTab.classList.add('tab-active')
          activeTab.classList.remove('tab-inactive')

          // Update URL without reload
          const url = new URL(window.location)
          url.searchParams.set('view', tabName)
          window.history.replaceState({}, '', url)
        }

        // Add hover effects for tabs
        document.addEventListener('DOMContentLoaded', function () {
          const tabs = document.querySelectorAll('.tab-button')
          tabs.forEach(tab => {
            tab.addEventListener('mouseenter', function () {
              if (this.classList.contains('tab-inactive')) {
                this.style.color = '#4b5563'
              }
            })
            tab.addEventListener('mouseleave', function () {
              if (this.classList.contains('tab-inactive')) {
                this.style.color = '#6b7280'
              }
            })
          })

          // Add hover functionality for sub-task tooltips
          const subtaskGroups = document.querySelectorAll('.subtask-node-group')

          subtaskGroups.forEach(group => {
            const promptHover = group.querySelector('.subtask-prompt-hover')
            if (promptHover) {
              group.addEventListener('mouseenter', function () {
                promptHover.style.display = 'block'
              })

              group.addEventListener('mouseleave', function () {
                promptHover.style.display = 'none'
              })
            }
          })

          // Add panning functionality to tree view
          const treePanel = document.getElementById('tree-panel')
          const treeContainer = document.getElementById('tree-container')

          if (treePanel && treeContainer) {
            let isPanning = false
            let startX = 0
            let startY = 0
            let scrollLeft = 0
            let scrollTop = 0
            let currentTranslateX = 0
            let currentTranslateY = 0

            // Parse existing transform
            const getTransform = () => {
              const transform = treeContainer.style.transform
              const match = transform.match(
                /translate\\((-?\\d+(?:\\.\\d+)?)px,\\s*(-?\\d+(?:\\.\\d+)?)px\\)/
              )
              if (match) {
                return {
                  x: parseFloat(match[1]),
                  y: parseFloat(match[2]),
                }
              }
              return { x: 0, y: 0 }
            }

            treePanel.addEventListener('mousedown', e => {
              // Only start panning if clicking on the panel itself or SVG elements
              if (e.target.tagName === 'A' || e.target.closest('a')) {
                return // Don't pan when clicking links
              }

              isPanning = true
              treePanel.style.cursor = 'grabbing'
              startX = e.pageX
              startY = e.pageY

              const currentTransform = getTransform()
              currentTranslateX = currentTransform.x
              currentTranslateY = currentTransform.y

              e.preventDefault()
            })

            document.addEventListener('mousemove', e => {
              if (!isPanning) return

              e.preventDefault()
              const deltaX = e.pageX - startX
              const deltaY = e.pageY - startY

              const newTranslateX = currentTranslateX + deltaX
              const newTranslateY = currentTranslateY + deltaY

              treeContainer.style.transform =
                'translate(' + newTranslateX + 'px, ' + newTranslateY + 'px)'
            })

            document.addEventListener('mouseup', () => {
              if (isPanning) {
                isPanning = false
                treePanel.style.cursor = 'grab'
              }
            })

            // Handle mouse leave to stop panning
            document.addEventListener('mouseleave', () => {
              if (isPanning) {
                isPanning = false
                treePanel.style.cursor = 'grab'
              }
            })

            // Prevent text selection while panning
            treePanel.addEventListener('selectstart', e => {
              if (isPanning) {
                e.preventDefault()
              }
            })
          }
        })
      </script>
    `

    // Use the shared layout
    const { layout } = await import('../layout/index.js')
    return c.html(layout('Conversation Detail', content, '', c))
  } catch (error) {
    console.error('Error loading conversation detail:', error)
    const { layout } = await import('../layout/index.js')
    return c.html(
      layout(
        'Error',
        html`
          <div class="error-banner">
            <strong>Error:</strong> ${getErrorMessage(error) || 'Failed to load conversation'}
          </div>
        `,
        '',
        c
      )
    )
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
    const conversation = await storageService.getConversationById(conversationId)

    if (!conversation) {
      return c.html(html`<div class="error-banner">Conversation not found</div>`)
    }

    let filteredRequests = conversation.requests
    if (selectedBranch && selectedBranch !== 'main') {
      // Find the first request in the selected branch
      const branchRequests = conversation.requests.filter(r => r.branch_id === selectedBranch)
      if (branchRequests.length > 0) {
        // Sort by timestamp to get the first request in the branch
        branchRequests.sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
        const firstBranchRequest = branchRequests[0]

        // Get all requests from main branch that happened before the branch diverged
        const mainRequestsBeforeBranch = conversation.requests.filter(
          r =>
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
function renderConversationMessages(
  requests: ConversationRequest[],
  _branches: string[],
  subtasksMap?: Map<string, EnrichedInvocation[]>
) {
  // Sort requests by timestamp in descending order (newest first)
  const sortedRequests = [...requests].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  return html`
    <div style="display: grid; gap: 0.25rem;">
      ${raw(
        sortedRequests
          .map(req => {
            const taskInvocations = subtasksMap?.get(req.request_id) || req.task_tool_invocation
            return renderConversationMessage(req, taskInvocations).toString()
          })
          .join('')
      )}
    </div>

    <script>
      function toggleSubtasks(requestId) {
        const subtasksDiv = document.getElementById('subtasks-' + requestId)
        if (subtasksDiv) {
          subtasksDiv.style.display = subtasksDiv.style.display === 'none' ? 'block' : 'none'
        }
      }
    </script>
  `
}
