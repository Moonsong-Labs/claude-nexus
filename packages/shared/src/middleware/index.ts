/**
 * Shared middleware for Claude Nexus Proxy services
 *
 * This module exports reusable middleware components that can be used
 * across different services in the monorepo (proxy, dashboard, etc.)
 */

export {
  requestIdMiddleware,
  type RequestIdOptions,
  type RequestIdVariables,
} from './request-id.js'
