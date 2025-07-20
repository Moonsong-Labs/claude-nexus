import { Hono } from 'hono'
import { Pool } from 'pg'
import { HonoVariables, HonoBindings } from '@claude-nexus/shared'
import { HTTP_STATUS } from '../constants.js'
import { logger } from '../middleware/logger.js'

// Response interfaces for type safety
interface BaseHealthResponse {
  timestamp: string
  requestId: string
}

interface LivenessResponse extends BaseHealthResponse {
  alive: boolean
}

interface ReadinessResponse extends BaseHealthResponse {
  ready: boolean
  checks: {
    database: 'connected' | 'disconnected'
  }
}

interface FullHealthResponse extends BaseHealthResponse {
  status: 'healthy' | 'unhealthy'
  service: string
  version: string
  dependencies: {
    database: 'connected' | 'disconnected'
  }
}

export interface HealthRouteOptions {
  pool?: Pool
  version?: string
}

/**
 * Check database connectivity using a system catalog query
 * @param pool - PostgreSQL connection pool
 * @param requestId - Request ID for logging context
 * @returns Promise<boolean> - True if database is connected, false otherwise
 */
async function checkDatabaseStatus(pool: Pool, requestId: string): Promise<boolean> {
  try {
    // Query system catalog to verify database is functioning
    await pool.query('SELECT 1 FROM pg_catalog.pg_class LIMIT 1')
    return true
  } catch (error) {
    logger.error('Database health check failed', {
      error,
      requestId,
    })
    return false
  }
}

/**
 * Create health check routes for the proxy service
 * 
 * Provides three endpoints:
 * - /live: Liveness probe (no external dependencies)
 * - /ready: Readiness probe (checks database connectivity)
 * - /: Full health status with detailed information
 * 
 * @param options - Configuration options including database pool and version
 * @returns Hono application with health routes
 */
export function createHealthRoutes(
  options: HealthRouteOptions
): Hono<{ Variables: HonoVariables; Bindings: HonoBindings }> {
  const app = new Hono<{ Variables: HonoVariables; Bindings: HonoBindings }>()

  /**
   * Liveness probe endpoint
   * 
   * Indicates whether the process is running. This endpoint has no external
   * dependencies and should always return 200 OK if the process is alive.
   * Used by orchestrators to determine if the container should be restarted.
   * 
   * @returns {LivenessResponse} Always returns alive: true with 200 status
   */
  app.get('/live', c => {
    const response: LivenessResponse = {
      alive: true,
      timestamp: new Date().toISOString(),
      requestId: c.get('requestId'),
    }
    return c.json(response, HTTP_STATUS.OK)
  })

  /**
   * Readiness probe endpoint
   * 
   * Indicates whether the service is ready to handle requests. Checks critical
   * dependencies like database connectivity. Used by load balancers to determine
   * if traffic should be routed to this instance.
   * 
   * @returns {ReadinessResponse} Ready status with dependency checks
   */
  app.get('/ready', async c => {
    const requestId = c.get('requestId')
    let isDbConnected = true // Default to true if no pool is configured

    if (options.pool) {
      isDbConnected = await checkDatabaseStatus(options.pool, requestId)
    }

    const response: ReadinessResponse = {
      ready: isDbConnected,
      timestamp: new Date().toISOString(),
      requestId,
      checks: {
        database: isDbConnected ? 'connected' : 'disconnected',
      },
    }

    const status = response.ready ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE
    return c.json(response, status)
  })

  /**
   * Full health check endpoint
   * 
   * Provides comprehensive health status including version information and
   * dependency states. Useful for monitoring dashboards and manual debugging.
   * 
   * @returns {FullHealthResponse} Detailed health status
   */
  app.get('/', async c => {
    const requestId = c.get('requestId')
    let isDbConnected = true // Default to true if no pool is configured

    if (options.pool) {
      isDbConnected = await checkDatabaseStatus(options.pool, requestId)
    }

    const response: FullHealthResponse = {
      status: isDbConnected ? 'healthy' : 'unhealthy',
      service: 'claude-nexus-proxy',
      version: options.version || 'unknown',
      timestamp: new Date().toISOString(),
      requestId,
      dependencies: {
        database: isDbConnected ? 'connected' : 'disconnected',
      },
    }

    const status = response.status === 'healthy' ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE
    return c.json(response, status)
  })

  return app
}
