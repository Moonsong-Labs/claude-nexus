/**
 * Helper functions for displaying conversation data
 */

import { getBatteryColor, getModelContextLimit } from '@claude-nexus/shared'
import type { ConversationBranch, BranchDisplayInfo } from '../types/conversation.js'
import { BRANCH_COUNT_DISPLAY_LIMIT } from '../constants/overview.js'

/**
 * Format branch display information for a conversation
 */
export function getBranchDisplayInfo(branch: ConversationBranch): BranchDisplayInfo {
  const parts: string[] = []

  if (branch.subtaskBranchCount > 0) {
    parts.push(`${branch.subtaskBranchCount}💻`)
  }
  if (branch.compactBranchCount > 0) {
    parts.push(`${branch.compactBranchCount}📦`)
  }
  if (branch.userBranchCount > 0) {
    parts.push(`${branch.userBranchCount}🌿`)
  }

  const hasMultipleBranches = branch.branchCount > 1
  let displayText: string

  if (parts.length > 0) {
    displayText = parts.join(', ')
  } else {
    displayText = branch.branchCount > 1 ? branch.branchCount.toString() : ''
  }

  // Truncate if too many branches to prevent UI overflow
  const totalBranches =
    branch.subtaskBranchCount + branch.compactBranchCount + branch.userBranchCount
  if (totalBranches > BRANCH_COUNT_DISPLAY_LIMIT) {
    displayText = `${BRANCH_COUNT_DISPLAY_LIMIT}+...`
  }

  const titleText =
    totalBranches > 0 || hasMultipleBranches
      ? `Total branches: ${branch.branchCount} (${branch.subtaskBranchCount} subtasks, ${branch.compactBranchCount} compacted, ${branch.userBranchCount} user branches)`
      : ''

  return {
    displayText,
    titleText,
    hasMultipleBranches,
    color: hasMultipleBranches ? '#2563eb' : '#6b7280',
    fontWeight: hasMultipleBranches ? '600' : 'normal',
  }
}

/**
 * Render a battery indicator for context usage
 */
export function renderBatteryIndicator(contextTokens: number, model: string): string {
  const { limit: maxTokens, isEstimate } = getModelContextLimit(model)
  const percentage = contextTokens / maxTokens
  const batteryColor = getBatteryColor(percentage)
  const isOverflow = percentage > 1
  const percentageText = (percentage * 100).toFixed(1)

  return `
    <div style="display: inline-flex; align-items: center; gap: 4px;">
      <svg width="16" height="30" viewBox="0 0 16 30" xmlns="http://www.w3.org/2000/svg">
        <!-- Battery nub (positive terminal) -->
        <rect x="6" y="1" width="4" height="3" rx="1" ry="1" style="fill: #888;" />
        <!-- Battery casing -->
        <rect x="3" y="4" width="10" height="24" rx="2" ry="2" style="fill: #f0f0f0; stroke: #888; stroke-width: 1;" />
        <!-- Battery level fill (from bottom to top) -->
        <rect x="4" y="${5 + (1 - Math.min(percentage, 1)) * 22}" width="8" height="${Math.min(percentage, 1) * 22}" rx="1" ry="1" style="fill: ${batteryColor};" />
        ${isOverflow ? '<text x="8" y="18" text-anchor="middle" style="font-size: 8px; font-weight: bold; fill: white;">!</text>' : ''}
      </svg>
      <span style="font-size: 11px; color: #6b7280;" title="${contextTokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens${isEstimate ? ' (estimated)' : ''}">${percentageText}%</span>
    </div>
  `
}

/**
 * Generate page numbers for pagination
 */
export function generatePageNumbers(
  current: number,
  total: number,
  maxVisible: number = 7
): (number | string)[] {
  const pages: (number | string)[] = []

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
