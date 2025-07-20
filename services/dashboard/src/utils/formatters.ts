/**
 * Shared formatting utilities for the dashboard
 */

// Constants for number formatting
const MILLION = 1_000_000
const THOUSAND = 1_000

// Constants for time formatting
const MS_PER_SECOND = 1_000
const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 3_600_000
const MS_PER_DAY = 86_400_000

/**
 * Format a number with K/M suffixes
 * @example formatNumber(1500) // "1.5K"
 * @example formatNumber(2500000) // "2.5M"
 * @example formatNumber(999) // "999"
 */
export function formatNumber(num: number): string {
  if (!num) {
    return '0'
  }
  if (num >= MILLION) {
    return `${(num / MILLION).toFixed(1)}M`
  }
  if (num >= THOUSAND) {
    return `${(num / THOUSAND).toFixed(1)}K`
  }
  return num.toString()
}

/**
 * Format duration in human readable format
 * @example formatDuration(5000) // "5s"
 * @example formatDuration(125000) // "2m 5s"
 * @example formatDuration(3725000) // "1h 2m"
 * @example formatDuration(90725000) // "1d 1h"
 */
export function formatDuration(ms: number): string {
  if (!ms || ms < 0) {
    return 'N/A'
  }

  const seconds = Math.floor(ms / MS_PER_SECOND)
  const minutes = Math.floor(ms / MS_PER_MINUTE)
  const hours = Math.floor(ms / MS_PER_HOUR)
  const days = Math.floor(ms / MS_PER_DAY)

  if (days > 0) {
    return `${days}d ${hours % 24}h`
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  if (ms < MS_PER_SECOND) {
    return `${ms}ms`
  }
  return `${seconds}s`
}

/**
 * Format timestamp as relative time (e.g., "5m ago")
 * @example formatRelativeTime(new Date(Date.now() - 5000)) // "Just now"
 * @example formatRelativeTime(new Date(Date.now() - 300000)) // "5m ago"
 * @example formatRelativeTime(new Date(Date.now() - 7200000)) // "2h ago"
 */
export function formatRelativeTime(timestamp: string | Date): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < MS_PER_MINUTE) {
    return 'Just now'
  }
  if (diff < MS_PER_HOUR) {
    return `${Math.floor(diff / MS_PER_MINUTE)}m ago`
  }
  if (diff < MS_PER_DAY) {
    return `${Math.floor(diff / MS_PER_HOUR)}h ago`
  }

  return date.toLocaleString()
}

/**
 * Escape HTML to prevent XSS
 * @example escapeHtml('<script>alert("XSS")</script>') // "&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;"
 * @example escapeHtml("It's a test") // "It&#039;s a test"
 * @example escapeHtml(null) // ""
 */
export function escapeHtml(text: string | null | undefined): string {
  if (!text) {
    return ''
  }

  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Escape an array of strings for safe HTML rendering
 * @example escapeHtmlArray(['<b>Bold</b>', 'Normal']) // ["&lt;b&gt;Bold&lt;/b&gt;", "Normal"]
 */
export function escapeHtmlArray(items: readonly string[]): string[] {
  return items.map(item => escapeHtml(item))
}
