import { raw } from 'hono/html'
import { formatDuration, escapeHtml } from '../utils/formatters.js'
import { copyButton } from './copy-button.js'
import type { RequestDetailsData } from '../types/request-details.js'
import type { ConversationData } from '../utils/conversation.js'

/**
 * Props for request summary component
 */
interface RequestSummaryProps {
  details: RequestDetailsData
  conversation: ConversationData
  cost: { formattedTotal: string }
  toolUsage: Record<string, number>
}

/**
 * Creates the request summary section with all metadata
 */
export function requestSummary({
  details,
  conversation,
  cost,
  toolUsage,
}: RequestSummaryProps): string {
  return `
    <div class="section">
      <div class="section-header">Request Summary</div>
      <div class="section-content" style="display: flex; gap: 2rem; align-items: start; flex-wrap: wrap;">
        <!-- Left side: Main details -->
        <div style="flex: 1; min-width: 300px;">
          ${renderMainDetails(details, conversation, cost)}
        </div>
        
        <!-- Right side: Tool usage badges -->
        ${renderToolUsage(toolUsage)}
      </div>
    </div>
  `
}

/**
 * Renders the main details section
 */
function renderMainDetails(
  details: RequestDetailsData,
  conversation: ConversationData,
  cost: { formattedTotal: string }
): string {
  return `
    <dl style="display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; font-size: 0.875rem;">
      <dt class="text-gray-600">Request ID:</dt>
      <dd style="display: flex; align-items: center; gap: 0.5rem;">
        <span class="font-mono">${details.requestId}</span>
        ${raw(copyButton({ text: details.requestId, title: 'Copy request ID' }))}
      </dd>
      
      ${
        details.conversationId
          ? `
        <dt class="text-gray-600">Conversation ID:</dt>
        <dd style="display: flex; align-items: center; gap: 0.5rem;">
          <a href="/dashboard/conversation/${details.conversationId}" 
             class="font-mono text-blue-600 hover:text-blue-800 hover:underline">
            ${details.conversationId}
          </a>
          ${raw(copyButton({ text: details.conversationId, title: 'Copy conversation ID' }))}
        </dd>
      `
          : ''
      }
      
      ${
        details.parentRequestId
          ? `
        <dt class="text-gray-600">Parent Request:</dt>
        <dd>
          <a href="/dashboard/request/${details.parentRequestId}" 
             class="font-mono text-blue-600 hover:text-blue-800 hover:underline">
            ${details.parentRequestId}
          </a>
        </dd>
      `
          : ''
      }
      
      <dt class="text-gray-600">Branch:</dt>
      <dd>${details.branchId || 'main'}</dd>
      
      <dt class="text-gray-600">Domain:</dt>
      <dd>${details.domain}</dd>
      
      <dt class="text-gray-600">Model:</dt>
      <dd>${conversation.model}</dd>
      
      <dt class="text-gray-600">Timestamp:</dt>
      <dd>${new Date(details.timestamp).toLocaleString()}</dd>
      
      <dt class="text-gray-600">Tokens:</dt>
      <dd>
        <span class="cost-info" style="font-size: 0.8rem;">
          <span>Input: ${conversation.totalInputTokens.toLocaleString()}</span>
          <span>Output: ${conversation.totalOutputTokens.toLocaleString()}</span>
          <span>Total: ${(conversation.totalInputTokens + conversation.totalOutputTokens).toLocaleString()}</span>
        </span>
      </dd>
      
      <dt class="text-gray-600">Cost:</dt>
      <dd>${cost.formattedTotal}</dd>
      
      <dt class="text-gray-600">Duration:</dt>
      <dd>${conversation.duration ? formatDuration(conversation.duration) : 'N/A'}</dd>
      
      <dt class="text-gray-600">Status:</dt>
      <dd>${details.responseStatus}</dd>
    </dl>
  `
}

/**
 * Renders tool usage badges
 */
function renderToolUsage(toolUsage: Record<string, number>): string {
  const toolCount = Object.keys(toolUsage).length
  if (toolCount === 0) {
    return ''
  }

  // Create a stable-sorted list of tools
  const sortedTools = Object.entries(toolUsage).sort(
    ([toolA, countA], [toolB, countB]) => countB - countA || toolA.localeCompare(toolB)
  )

  // Calculate total
  const totalCalls = sortedTools.reduce((sum, [, count]) => sum + count, 0)

  // Generate tool badges
  const toolBadges = sortedTools
    .map(([tool, count]) => {
      const colors = getColorForProportion(count / totalCalls)
      const percentage = ((count / totalCalls) * 100).toFixed(0)

      return `
        <span style="
          display: inline-block;
          background-color: ${colors.bg};
          color: ${colors.color};
          padding: 0.125rem 0.5rem;
          margin: 0.125rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 500;
          white-space: nowrap;
        " title="${escapeHtml(tool)}: ${count} calls (${percentage}%)">
          ${escapeHtml(tool)}
          <span style="
            background-color: ${colors.countBg};
            color: ${colors.countColor};
            padding: 0 0.375rem;
            margin-left: 0.25rem;
            border-radius: 9999px;
            font-weight: 600;
          ">${count}</span>
        </span>
      `
    })
    .join('')

  return `
    <div style="min-width: 200px; max-width: 300px; flex-shrink: 0;">
      <div style="
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin-bottom: 0.375rem;
      ">
        <h4 style="margin: 0; font-size: 0.875rem; font-weight: 600; color: #4b5563;">
          Tool Usage
        </h4>
        <span style="font-size: 0.75rem; color: #6b7280;">
          Total: ${totalCalls}
        </span>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 0.25rem;">
        ${toolBadges}
      </div>
    </div>
  `
}

/**
 * Get color scheme based on usage proportion
 */
function getColorForProportion(proportion: number) {
  if (proportion >= 0.3) {
    // High usage (30%+) - blue tones
    return {
      bg: '#dbeafe', // blue-100
      color: '#1e40af', // blue-800
      countBg: '#3b82f6', // blue-500
      countColor: '#ffffff',
    }
  } else if (proportion >= 0.15) {
    // Medium usage (15-30%) - green tones
    return {
      bg: '#d1fae5', // green-100
      color: '#065f46', // green-800
      countBg: '#10b981', // green-500
      countColor: '#ffffff',
    }
  } else if (proportion >= 0.05) {
    // Low usage (5-15%) - amber tones
    return {
      bg: '#fef3c7', // amber-100
      color: '#92400e', // amber-800
      countBg: '#f59e0b', // amber-500
      countColor: '#ffffff',
    }
  } else {
    // Very low usage (<5%) - gray tones
    return {
      bg: '#f3f4f6', // gray-100
      color: '#374151', // gray-700
      countBg: '#6b7280', // gray-500
      countColor: '#ffffff',
    }
  }
}
