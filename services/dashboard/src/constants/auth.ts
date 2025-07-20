/**
 * Authentication constants shared across the dashboard
 */

/**
 * Name of the authentication cookie
 */
export const AUTH_COOKIE_NAME = 'dashboard_auth'

/**
 * Cookie max age in seconds (7 days)
 */
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7

/**
 * Determine if running in production based on environment variables
 * Supports both NODE_ENV and BUN_ENV for compatibility
 */
export const IS_PRODUCTION =
  process.env.NODE_ENV === 'production' || process.env.BUN_ENV === 'production'
