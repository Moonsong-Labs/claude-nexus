import { Hono } from 'hono'
import { ProxyApiClient } from '../services/api-client.ts'

// Import route modules
import { authRoutes } from './auth.ts'
import { overviewRoutes } from './overview.ts'
import { requestsRoutes } from './requests.ts'
import { requestDetailsRoutes } from './request-details.ts'
import { tokenUsageRoutes } from './token-usage.ts'

export const dashboardRoutes = new Hono<{
  Variables: {
    apiClient?: ProxyApiClient
    domain?: string
  }
}>()

// Mount routes
dashboardRoutes.route('/', authRoutes)
dashboardRoutes.route('/', overviewRoutes)
dashboardRoutes.route('/', requestsRoutes)
dashboardRoutes.route('/', requestDetailsRoutes)
dashboardRoutes.route('/', tokenUsageRoutes)
