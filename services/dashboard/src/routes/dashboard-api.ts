import { Hono } from 'hono'
import { ProxyApiClient } from '../services/api-client.js'

// Import route modules
import { authRoutes } from './auth.js'
import { overviewRoutes } from './overview.js'
import { requestsRoutes } from './requests.js'
import { requestDetailsRoutes } from './request-details.js'
import { tokenUsageRoutes } from './token-usage.js'
import { requestUsageRoutes } from './request-usage.js'
import { promptsRoute } from './prompts.js'
import { promptDetailRoute } from './prompt-detail.js'

/**
 * Dashboard routes aggregator
 *
 * This module serves as the central route composition point for all dashboard-related routes.
 * It imports and mounts various route modules that handle different aspects of the dashboard functionality.
 *
 * The routes are organized as follows:
 * - Auth routes: Handle login/logout functionality
 * - Overview routes: Dashboard home page and conversation listings
 * - Request routes: API request listings and filtering
 * - Request details routes: Individual request inspection
 * - Token usage routes: Token consumption analytics
 * - Request usage routes: Request pattern analytics
 * - Prompt routes: Prompt management and details
 *
 * All routes share common Variables for apiClient and domain context.
 */
export const dashboardRoutes = new Hono<{
  Variables: {
    apiClient?: ProxyApiClient
    domain?: string
  }
}>()

// Mount routes at root path
// These routes handle various dashboard pages and functionality
dashboardRoutes.route('/', authRoutes)
dashboardRoutes.route('/', overviewRoutes)
dashboardRoutes.route('/', requestsRoutes)
dashboardRoutes.route('/', requestDetailsRoutes)
dashboardRoutes.route('/', tokenUsageRoutes)
dashboardRoutes.route('/', requestUsageRoutes)

// Mount prompt-related routes under /prompts prefix
dashboardRoutes.route('/prompts', promptsRoute)
dashboardRoutes.route('/prompts', promptDetailRoute)
