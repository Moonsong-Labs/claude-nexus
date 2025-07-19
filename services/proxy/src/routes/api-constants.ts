/**
 * Constants for API routes
 */

// Token limits
export const TOKEN_LIMITS = {
  FIVE_HOUR_WINDOW: 140000,
} as const

// Default query parameters
export const QUERY_DEFAULTS = {
  LIMIT: 100,
  OFFSET: 0,
  CONVERSATIONS_LIMIT: 20,
  TOKEN_WINDOW_MINUTES: 300, // 5 hours
  DAILY_USAGE_DAYS: 30,
  HOURLY_USAGE_DAYS: 7,
  TIME_SERIES_WINDOW_HOURS: 5,
  TIME_SERIES_INTERVAL_MINUTES: 5,
  ACCOUNTS_INTERVAL_MINUTES: 15,
} as const

// Time intervals
export const TIME_INTERVALS = {
  STATS_DEFAULT_HOURS: 24,
  DOMAINS_DAYS: 7,
} as const

// Database timeouts and intervals
export const DB_TIMEOUTS = {
  SLOW_QUERY_THRESHOLD_MS: 5000,
} as const