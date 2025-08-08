/**
 * Dashboard-specific configuration
 */

/**
 * Check if the dashboard is running in read-only mode
 * This is determined by the absence of DASHBOARD_API_KEY
 * Note: This is a function to allow dynamic checking in tests
 */
export const isReadOnly = () => !process.env.DASHBOARD_API_KEY

/**
 * Get the dashboard API key from environment
 * Note: This is a function to allow dynamic checking in tests
 */
export const getDashboardApiKey = () => process.env.DASHBOARD_API_KEY

// Legacy exports for backward compatibility
export const dashboardApiKey = process.env.DASHBOARD_API_KEY

/**
 * Export configuration flags for easy access
 */
export const dashboardConfig = {
  isReadOnly: isReadOnly(),
  dashboardApiKey,
} as const
