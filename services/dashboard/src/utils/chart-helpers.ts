/**
 * Chart rendering helper functions
 */

import { DOMAIN_COLOR_PALETTE } from './chart-constants.js'

/**
 * Generate consistent color from domain name using hash-based selection
 */
export function getDomainColor(domain: string): string {
  // Generate hash from domain name
  let hash = 0
  for (let i = 0; i < domain.length; i++) {
    const char = domain.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }

  // Select color from palette based on hash
  const colorIndex = Math.abs(hash) % DOMAIN_COLOR_PALETTE.length
  return DOMAIN_COLOR_PALETTE[colorIndex]
}

/**
 * Format number with locale-appropriate thousands separators
 */
export function formatNumber(num: number): string {
  return num.toLocaleString()
}
