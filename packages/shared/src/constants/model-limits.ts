/**
 * Model context window limits configuration
 *
 * This file contains the context window limits for various Claude models.
 * The limits are based on official Anthropic announcements and documentation.
 *
 * Note: Regex patterns use wildcards (.*) to future-proof against new model versions
 * and date variants, as this proxy needs to handle various Claude model formats.
 *
 * @see https://docs.anthropic.com/en/docs/about-claude/models
 */

export interface ModelContextRule {
  pattern: RegExp
  limit: number
  source?: string // Optional source link for documentation
}

/**
 * Model context window rules
 * Order matters - more specific patterns should come before general ones
 */
export const MODEL_CONTEXT_RULES: ModelContextRule[] = [
  // Claude 4 (future-proofed with .*)
  // Source: Anthropic API docs (200k standard for Claude 4)
  { pattern: /claude-4.*opus/i, limit: 200000 },
  { pattern: /claude-4.*sonnet/i, limit: 200000 },

  // Claude 3.5 (both confirmed with 200k)
  // Source: https://www.anthropic.com/news/claude-3-5-sonnet (June 20, 2024)
  // Source: https://www.anthropic.com/claude/haiku (Oct 22, 2024)
  { pattern: /claude-3\.5.*sonnet/i, limit: 200000 },
  { pattern: /claude-3\.5.*haiku/i, limit: 200000 },

  // Claude 3
  // Source: https://www.anthropic.com/news/claude-3-family (March 4, 2024)
  { pattern: /claude-3.*opus/i, limit: 200000 },
  { pattern: /claude-3.*sonnet/i, limit: 200000 },
  { pattern: /claude-3.*haiku/i, limit: 200000 },

  // Claude 2 (order matters - 2.1 before 2)
  // Source: Claude 2.1 announcement (200k), Claude 2.0 (100k)
  { pattern: /claude-2\.1/i, limit: 200000 },
  { pattern: /claude-2/i, limit: 100000 },

  // Claude Instant
  // Source: Anthropic docs (100k context)
  { pattern: /claude-instant/i, limit: 100000 },
]

/**
 * Default context limit for unknown models
 */
export const DEFAULT_CONTEXT_LIMIT = 200000

/**
 * Get the context limit for a given model
 * @param model - The model identifier (e.g., "claude-3-opus-20240229")
 * @returns An object with the limit and whether it's an estimate
 */
export function getModelContextLimit(model: string): { limit: number; isEstimate: boolean } {
  for (const rule of MODEL_CONTEXT_RULES) {
    if (rule.pattern.test(model)) {
      return { limit: rule.limit, isEstimate: false }
    }
  }
  // Unknown model - return default with estimate flag
  return { limit: DEFAULT_CONTEXT_LIMIT, isEstimate: true }
}

/**
 * Battery level thresholds for visualization
 *
 * Uses a non-linear scale to emphasize urgency near the context limit:
 * - 0-70%: Safe zone with plenty of context remaining (green)
 * - 71-90%: Caution zone where users should start thinking about context (yellow)
 * - 91-100%: Warning zone where context is nearly exhausted (red)
 * - >100%: Overflow state indicating context limit exceeded (red with warning)
 *
 * This UX pattern helps users manage their context proactively rather than
 * hitting the limit unexpectedly.
 */
export const BATTERY_THRESHOLDS = {
  GREEN: 0.7, // 0-70% = green (safe)
  YELLOW: 0.9, // 71-90% = yellow (caution)
  RED: 1.0, // 91-100% = red (warning)
  // >100% = red with exclamation (overflow)
} as const

/**
 * Get battery color based on usage percentage
 * @param percentage - Usage percentage (0-1+)
 * @returns CSS color value
 */
export function getBatteryColor(percentage: number): string {
  if (percentage <= BATTERY_THRESHOLDS.GREEN) {
    return '#22c55e' // green-500: Safe zone
  }
  if (percentage <= BATTERY_THRESHOLDS.YELLOW) {
    return '#eab308' // yellow-500: Caution zone
  }
  return '#ef4444' // red-500: Warning/overflow zone
}

/**
 * Get battery level (1-5) based on usage percentage
 *
 * Note: Scale is inverted for backward compatibility
 * - 5 = Lowest usage (0-20%)
 * - 4 = Low usage (21-40%)
 * - 3 = Medium usage (41-60%)
 * - 2 = High usage (61-80%)
 * - 1 = Very high usage (81%+)
 *
 * @param percentage - Usage percentage (0-1+)
 * @returns Battery level 1-5 (inverted scale)
 */
export function getBatteryLevel(percentage: number): number {
  if (percentage <= 0.2) {
    return 5
  }
  if (percentage <= 0.4) {
    return 4
  }
  if (percentage <= 0.6) {
    return 3
  }
  if (percentage <= 0.8) {
    return 2
  }
  return 1
}
