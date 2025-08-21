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

/**
 * Check if Gemini API key is configured and valid
 * Note: This is a function to allow dynamic checking in tests
 */
export const hasGeminiKey = () => {
  const key = process.env.GEMINI_API_KEY?.trim()
  // Ensure key exists and has reasonable length
  return !!key && key.length > 10
}

/**
 * Check if AI Analysis should be enabled in read-only mode
 * Requires both GEMINI_API_KEY and explicit feature flag
 * Note: This is a function to allow dynamic checking in tests
 */
export const isAiAnalysisEnabledInReadOnly = () => {
  const featureEnabled = process.env.AI_ANALYSIS_READONLY_ENABLED === 'true'
  return featureEnabled && hasGeminiKey()
}

// Legacy exports for backward compatibility
export const dashboardApiKey = process.env.DASHBOARD_API_KEY

/**
 * Export configuration flags for easy access
 */
export const dashboardConfig = {
  isReadOnly: isReadOnly(),
  dashboardApiKey,
  hasGeminiKey: hasGeminiKey(),
  aiAnalysisEnabledInReadOnly: isAiAnalysisEnabledInReadOnly(),
} as const
