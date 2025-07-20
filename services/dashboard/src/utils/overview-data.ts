/**
 * Data processing functions for the overview page
 */

import type { ConversationBranch } from '../types/conversation.js'

export interface ConversationStats {
  totalRequests: number
  totalTokens: number
  uniqueAccounts: string[]
  uniqueDomains: string[]
}

/**
 * Calculate statistics from conversation branches
 */
export function calculateConversationStats(branches: ConversationBranch[]): ConversationStats {
  const totalRequests = branches.reduce((sum, branch) => sum + branch.messageCount, 0)
  const totalTokens = branches.reduce((sum, branch) => sum + branch.tokens, 0)
  const uniqueAccounts = Array.from(
    new Set(branches.map(b => b.accountId).filter(Boolean))
  ) as string[]
  const uniqueDomains = Array.from(new Set(branches.map(branch => branch.domain))).sort()

  return {
    totalRequests,
    totalTokens,
    uniqueAccounts,
    uniqueDomains,
  }
}

/**
 * Filter conversation branches based on search query
 */
export function filterConversations(
  branches: ConversationBranch[],
  searchQuery?: string
): ConversationBranch[] {
  if (!searchQuery) {
    return branches
  }

  const query = searchQuery.toLowerCase()
  return branches.filter(branch => {
    return (
      branch.conversationId.toLowerCase().includes(query) ||
      branch.branch.toLowerCase().includes(query) ||
      branch.domain.toLowerCase().includes(query)
    )
  })
}

/**
 * Sort conversations by last message time (newest first)
 */
export function sortConversationsByRecent(branches: ConversationBranch[]): ConversationBranch[] {
  return [...branches].sort((a, b) => b.lastMessage.getTime() - a.lastMessage.getTime())
}

/**
 * Apply pagination to conversation list
 */
export function paginateConversations(
  branches: ConversationBranch[],
  currentPage: number,
  itemsPerPage: number
): {
  paginatedBranches: ConversationBranch[]
  totalItems: number
  totalPages: number
  startIndex: number
  endIndex: number
} {
  const totalItems = branches.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedBranches = branches.slice(startIndex, endIndex)

  return {
    paginatedBranches,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
  }
}
