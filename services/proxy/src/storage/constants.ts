/**
 * Constants for storage adapter configuration
 */

// Time windows for task and conversation queries
export const STORAGE_TIME_WINDOWS = {
  QUERY_WINDOW_HOURS: 24,
  MATCH_WINDOW_HOURS: 24,
} as const

// Query limits for database operations
export const STORAGE_QUERY_LIMITS = {
  TASK_INVOCATIONS_WITH_PROMPT: 10,
  TASK_INVOCATIONS_WITHOUT_PROMPT: 100,
} as const

// Request ID mapping cleanup configuration
export const REQUEST_ID_CLEANUP = {
  DEFAULT_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  DEFAULT_RETENTION_MS: 60 * 60 * 1000, // 1 hour
  PERFORMANCE_WARNING_THRESHOLD_MS: 100, // Log warning if cleanup takes longer
} as const

// Environment variable names for configuration
export const STORAGE_ENV_VARS = {
  CLEANUP_INTERVAL: 'STORAGE_ADAPTER_CLEANUP_MS',
  RETENTION_TIME: 'STORAGE_ADAPTER_RETENTION_MS',
} as const

// UUID validation regex
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
