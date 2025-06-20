/**
 * Shared formatting utilities for the dashboard
 */

/**
 * Format a number with K/M suffixes
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toString()
}

/**
 * Format duration in human readable format
 */
export function formatDuration(ms: number): string {
  if (!ms || ms < 0) {
    return 'N/A'
  }

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
    return `${minutes}m ${seconds % 60}s`
  }
  if (ms < 1000) {
    return `${ms}ms`
  }
  return `${seconds}s`
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date

  if (!dateObj || isNaN(dateObj.getTime())) {
    return ''
  }

  const hours = dateObj.getHours().toString().padStart(2, '0')
  const minutes = dateObj.getMinutes().toString().padStart(2, '0')
  const seconds = dateObj.getSeconds().toString().padStart(2, '0')

  return `${hours}:${minutes}:${seconds}`
}

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(text: string): string {
  if (!text) return ''

  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
