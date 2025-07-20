import { html, raw } from 'hono/html'
import { formatNumber, formatDuration, escapeHtml } from '../utils/formatters.js'
import { formatDuration as formatMetricDuration } from '../utils/conversation-metrics.js'
import { styles, getBranchColor } from '../utils/conversation-styles.js'
import type { ConversationRequest } from '../types/conversation.js'
import type { EnrichedInvocation } from '../utils/conversation-graph-data.js'
import { getLastMessageContent, getResponseSummary } from '../utils/conversation-helpers.js'

interface ConversationStats {
  messageCount: number
  totalTokens: number
  branchCount: number
  duration: number
  inferenceTime: number
  requestCount: number
  totalSubtasks: number
  toolExecution: { count: number; totalMs: number }
  userReply: { count: number; totalMs: number }
  userInteractions: { count: number; requests: string[] }
  currentContextSize: number
}

interface BranchStats {
  branchName: string
  messageCount: number
  totalTokens: number
  duration: number
  inferenceTime: number
  requestCount: number
  totalSubtasks: number
  toolExecution: { count: number; totalMs: number }
  userReply: { count: number; totalMs: number }
  userInteractions: { count: number; requests: string[] }
  currentContextSize: number
}

/**
 * Render conversation stats grid
 */
export function renderStatsGrid(stats: ConversationStats | BranchStats, title: string) {
  const isBranchStats = 'branchName' in stats

  return html`
    <div style="margin-bottom: 2rem;">
      <h3
        style="margin: 0 0 ${isBranchStats
          ? '0.5rem'
          : '1rem'} 0; font-size: 1.25rem; font-weight: 600;"
      >
        ${title}
        ${isBranchStats
          ? html`<span style="color: ${getBranchColor(stats.branchName)};"
              >${stats.branchName}</span
            >`
          : ''}
      </h3>
      ${isBranchStats
        ? html`<p style="margin: 0 0 1rem 0; font-size: 0.875rem; color: #6b7280;">
            Includes parent branch history up to this branch
          </p>`
        : ''}
      <div class="conversation-stats-grid">
        <div class="conversation-stat-card">
          <span class="conversation-stat-label"
            >${isBranchStats ? 'Branch' : 'Total'} Messages:</span
          >
          <span class="conversation-stat-value">${stats.messageCount}</span>
        </div>
        <div class="conversation-stat-card">
          <span class="conversation-stat-label"
            >${isBranchStats ? 'Branch' : 'Total'} Sub-tasks:</span
          >
          <span class="conversation-stat-value">${stats.totalSubtasks}</span>
        </div>
        <div class="conversation-stat-card">
          <span class="conversation-stat-label">${isBranchStats ? 'Branch' : 'Total'} Tokens:</span>
          <span class="conversation-stat-value">${stats.totalTokens.toLocaleString()}</span>
        </div>
        <div class="conversation-stat-card">
          <span class="conversation-stat-label">Current Context Size:</span>
          <span class="conversation-stat-value"
            >${stats.currentContextSize.toLocaleString()} tokens</span
          >
        </div>
        ${!isBranchStats && 'branchCount' in stats
          ? html`<div class="conversation-stat-card">
              <span class="conversation-stat-label">Branches:</span>
              <span class="conversation-stat-value">${stats.branchCount}</span>
            </div>`
          : ''}
        ${isBranchStats
          ? html`<div class="conversation-stat-card">
              <span class="conversation-stat-label">Branch Requests:</span>
              <span class="conversation-stat-value">${stats.requestCount}</span>
            </div>`
          : ''}
        <div class="conversation-stat-card">
          <span class="conversation-stat-label"
            >${isBranchStats ? 'Branch' : 'Total'} Duration:</span
          >
          <span class="conversation-stat-value">${formatDuration(stats.duration)}</span>
        </div>
        <div class="conversation-stat-card">
          <span class="conversation-stat-label"
            >${isBranchStats ? 'Branch' : 'Total'} AI Inference:</span
          >
          <span class="conversation-stat-value">${formatDuration(stats.inferenceTime)}</span>
        </div>
        <div class="conversation-stat-card">
          <span class="conversation-stat-label"
            >${isBranchStats ? 'Branch' : 'Total'} Tool Execution:</span
          >
          <span class="conversation-stat-value">
            ${stats.toolExecution.count > 0
              ? `${formatMetricDuration(stats.toolExecution.totalMs)} (${stats.toolExecution.count} tools)`
              : 'No tools used'}
          </span>
        </div>
        <div class="conversation-stat-card">
          <span class="conversation-stat-label"
            >${isBranchStats ? 'Branch' : 'Total'} Time to Reply:</span
          >
          <span class="conversation-stat-value">
            ${stats.userReply.count > 0
              ? `${formatMetricDuration(stats.userReply.totalMs)} (${stats.userReply.count} intervals)`
              : 'No replies'}
          </span>
        </div>
      </div>
    </div>
  `
}

/**
 * Render branch filter UI
 */
export function renderBranchFilter(
  conversationId: string,
  selectedBranch: string | undefined,
  branchStats: Record<string, any>
) {
  return html`
    <div class="branch-filter" id="branch-filter">
      <span class="text-sm text-gray-600">Filter by branch:</span>
      <a
        href="/dashboard/conversation/${conversationId}"
        class="branch-chip ${!selectedBranch ? 'branch-chip-active' : 'branch-chip-main'}"
        style="${!selectedBranch
          ? 'background: #f3f4f6; color: #1f2937; border-color: #9ca3af;'
          : ''}"
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
  `
}

/**
 * Render tab navigation
 */
export function renderTabNavigation(view: string) {
  return html`
    <div class="tab-container" style="margin: 1.5rem 0; border-bottom: 1px solid #e5e7eb;">
      <div style="display: flex; gap: 0;">
        <button
          id="tree-tab"
          class="tab-button ${view === 'tree' ? 'tab-active' : 'tab-inactive'}"
          style="${styles.button.base}
            border-bottom: 2px solid ${view === 'tree' ? '#3b82f6' : 'transparent'};
            color: ${view === 'tree' ? '#3b82f6' : '#6b7280'};"
          onclick="switchTab('tree')"
        >
          Tree View
        </button>
        <button
          id="timeline-tab"
          class="tab-button ${view === 'timeline' ? 'tab-active' : 'tab-inactive'}"
          style="${styles.button.base}
            border-bottom: 2px solid ${view === 'timeline' ? '#3b82f6' : 'transparent'};
            color: ${view === 'timeline' ? '#3b82f6' : '#6b7280'};"
          onclick="switchTab('timeline')"
        >
          Timeline
        </button>
        <button
          id="analytics-tab"
          class="tab-button ${view === 'analytics' ? 'tab-active' : 'tab-inactive'}"
          style="${styles.button.base}
            border-bottom: 2px solid ${view === 'analytics' ? '#3b82f6' : 'transparent'};
            color: ${view === 'analytics' ? '#3b82f6' : '#6b7280'};"
          onclick="switchTab('analytics')"
        >
          AI Analysis
        </button>
      </div>
    </div>
  `
}

/**
 * Render conversation header
 */
export function renderConversationHeader(conversationId: string) {
  return html`
    <h3
      style="margin: 0 0 1rem 0; font-size: 1.25rem; font-weight: 600; display: flex; align-items: center; gap: 1rem;"
    >
      Conversation Details
      <span
        style="display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; font-weight: normal; color: #6b7280;"
      >
        <code
          style="font-family: monospace; background: #f3f4f6; padding: 0.125rem 0.5rem; border-radius: 0.25rem;"
        >
          ${conversationId}
        </code>
        <button
          onclick="navigator.clipboard.writeText('${conversationId}').then(() => {
            const btn = this;
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '✓';
            btn.style.color = '#10b981';
            setTimeout(() => {
              btn.innerHTML = originalHTML;
              btn.style.color = '';
            }, 2000);
          })"
          style="background: none; border: none; cursor: pointer; padding: 0.25rem; color: #6b7280; hover:color: #374151;"
          title="Copy conversation ID"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </span>
    </h3>
  `
}

/**
 * Render a single conversation message
 */
export function renderConversationMessage(
  req: ConversationRequest,
  taskInvocations?: EnrichedInvocation[]
) {
  const branch = req.branch_id || 'main'
  const branchColor = getBranchColor(branch)
  const hasTaskInvocation = taskInvocations && taskInvocations.length > 0

  return html`
    <div class="section" id="message-${req.request_id}">
      <div class="section-header" style="${styles.section.header}">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 0.875rem; color: #6b7280;">
            ${new Date(req.timestamp).toLocaleString()}
          </span>
          <a
            href="/dashboard/request/${req.request_id}"
            class="request-id-link"
            style="${styles.requestIdLink}"
            onmouseover="this.style.backgroundColor='#3b82f6'; this.style.color='white'; this.style.borderColor='#3b82f6';"
            onmouseout="this.style.backgroundColor='#f9fafb'; this.style.color='#3b82f6'; this.style.borderColor='#e5e7eb';"
            title="Click to view request details"
          >
            ${req.request_id}
          </a>
          ${branch !== 'main'
            ? html`
                <span
                  style="margin-left: 0.5rem; font-size: 0.7rem; background: ${branchColor}20; color: ${branchColor}; padding: 0.125rem 0.375rem; border-radius: 0.25rem; border: 1px solid ${branchColor};"
                >
                  ${escapeHtml(branch)}
                </span>
              `
            : ''}
          ${req.is_subtask
            ? '<span style="margin-left: 0.5rem; font-size: 0.875rem;" title="Sub-task conversation">🔗</span>'
            : ''}
          ${hasTaskInvocation
            ? html`<span style="margin-left: 0.5rem; font-size: 0.875rem;" title="Has sub-tasks"
                >📋 (${taskInvocations.length})</span
              >`
            : ''}
        </div>
        <div style="display: flex; gap: 0.75rem; align-items: center;">
          <span class="text-sm text-gray-600">${req.message_count || 0} messages</span>
          <span class="text-sm text-gray-600">${formatNumber(req.total_tokens)} tokens</span>
          ${req.duration_ms
            ? html`<span class="text-sm text-gray-600">${formatDuration(req.duration_ms)}</span>`
            : ''}
          ${req.error ? '<span style="color: #ef4444; font-size: 0.875rem;">Error</span>' : ''}
        </div>
      </div>
      <div class="section-content" style="${styles.section.content}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="flex: 1; margin-right: 1rem;">
            <div
              class="text-sm text-gray-700"
              style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 0.25rem;"
            >
              ${escapeHtml(getResponseSummary(req))}
            </div>
            <div
              class="text-sm text-gray-600"
              style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
            >
              👤 ${escapeHtml(getLastMessageContent(req).replace(/^(👤|🤖|⚙️|🔧|✅)\s*/, ''))}
            </div>
          </div>
          <div style="display: flex; gap: 1rem; align-items: center;">
            ${req.parent_task_request_id
              ? html`<a
                  href="/dashboard/request/${req.parent_task_request_id}"
                  class="text-sm text-blue-600"
                  title="View parent task"
                >
                  ↑ Parent Task
                </a>`
              : ''}
            ${hasTaskInvocation
              ? html`<button
                  onclick="toggleSubtasks('${req.request_id}')"
                  class="text-sm text-blue-600"
                  style="cursor: pointer; background: none; border: none; padding: 0;"
                >
                  View Sub-tasks ▼
                </button>`
              : ''}
          </div>
        </div>
        ${hasTaskInvocation ? renderSubtaskDetails(req.request_id, taskInvocations) : ''}
      </div>
    </div>
  `
}

/**
 * Render sub-task details
 */
function renderSubtaskDetails(requestId: string, taskInvocations: EnrichedInvocation[]) {
  return html`
    <div
      id="subtasks-${requestId}"
      style="display: none; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb;"
    >
      <div class="text-sm text-gray-600" style="margin-bottom: 0.5rem;">
        Sub-tasks spawned by this request:
      </div>
      ${raw(
        taskInvocations
          .map(
            (task: any) => `
          <div style="margin-bottom: 0.5rem; padding: 0.5rem; background: #f9fafb; border-radius: 0.25rem;">
            <div style="font-size: 0.875rem; color: #4b5563;">
              <strong>Task:</strong> ${escapeHtml(task.name || 'Unnamed task')}
            </div>
            ${task.input?.prompt ? `<div style="font-size: 0.75rem; color: #6b7280; margin-top: 0.25rem;">${escapeHtml(task.input.prompt.substring(0, 200))}${task.input.prompt.length > 200 ? '...' : ''}</div>` : ''}
            ${task.input?.description ? `<div style="font-size: 0.75rem; color: #6b7280; margin-top: 0.25rem;">Description: ${escapeHtml(task.input.description)}</div>` : ''}
            ${
              task.linked_conversation_id
                ? `
              <div style="margin-top: 0.5rem;">
                <a href="/dashboard/conversation/${task.linked_conversation_id}" class="text-sm text-blue-600">
                  View sub-task conversation →
                </a>
              </div>
            `
                : '<div style="margin-top: 0.5rem; font-size: 0.75rem; color: #9ca3af;">Sub-task not yet linked</div>'
            }
          </div>
        `
          )
          .join('')
      )}
    </div>
  `
}
