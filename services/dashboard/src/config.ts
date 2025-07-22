/**
 * Dashboard-specific configuration
 */

/**
 * Whether the dashboard is running in read-only mode
 * This is determined by the absence of DASHBOARD_API_KEY
 */
export const isReadOnly = !process.env.DASHBOARD_API_KEY

/**
 * Get the dashboard API key from environment
 */
export const dashboardApiKey = process.env.DASHBOARD_API_KEY

/**
 * Export configuration flags for easy access
 */
export const dashboardConfig = {
  isReadOnly,
  dashboardApiKey,
} as const
