import { Hono } from 'hono'
import { Pool } from 'pg'
import { claudeApiCircuitBreaker } from '../utils/circuit-breaker'
import { logger } from '../middleware/logger'
import os from 'os'

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  uptime: number
  version: string
  checks: {
    [key: string]: {
      status: 'pass' | 'fail' | 'warn'
      message?: string
      responseTime?: number
      metadata?: any
    }
  }
}

interface ReadinessCheckResult {
  ready: boolean
  timestamp: string
  checks: {
    [key: string]: boolean
  }
}

// Create health check routes
export function createHealthRoutes(options: {
  pool?: Pool
  version?: string
}) {
  const app = new Hono()
  const startTime = Date.now()
  
  // Basic liveness probe - just checks if service is running
  app.get('/health/live', (c) => {
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString()
    })
  })
  
  // Readiness probe - checks if service is ready to accept traffic
  app.get('/health/ready', async (c) => {
    const checks: { [key: string]: boolean } = {
      server: true // Server is obviously running if we're here
    }
    
    // Check database connection if configured
    if (options.pool) {
      try {
        const client = await options.pool.connect()
        await client.query('SELECT 1')
        client.release()
        checks.database = true
      } catch (error) {
        logger.error('Database readiness check failed', { error: error.message })
        checks.database = false
      }
    }
    
    // Check circuit breaker state
    const circuitStatus = claudeApiCircuitBreaker.getStatus()
    checks.claudeApi = circuitStatus.state !== 'OPEN'
    
    const ready = Object.values(checks).every(check => check)
    
    const result: ReadinessCheckResult = {
      ready,
      timestamp: new Date().toISOString(),
      checks
    }
    
    return c.json(result, ready ? 200 : 503)
  })
  
  // Comprehensive health check
  app.get('/health', async (c) => {
    const checks: HealthCheckResult['checks'] = {}
    let overallStatus: HealthCheckResult['status'] = 'healthy'
    
    // System health
    const systemCheck = checkSystemHealth()
    checks.system = systemCheck
    if (systemCheck.status === 'fail') overallStatus = 'unhealthy'
    else if (systemCheck.status === 'warn') overallStatus = 'degraded'
    
    // Database health
    if (options.pool) {
      const dbStart = Date.now()
      try {
        const client = await options.pool.connect()
        await client.query('SELECT 1')
        const poolStats = (options.pool as any).pool
        
        checks.database = {
          status: 'pass',
          responseTime: Date.now() - dbStart,
          metadata: {
            totalConnections: poolStats?.size || 0,
            idleConnections: poolStats?.available || 0,
            waitingClients: poolStats?.pending || 0
          }
        }
        client.release()
      } catch (error) {
        checks.database = {
          status: 'fail',
          message: error.message,
          responseTime: Date.now() - dbStart
        }
        overallStatus = 'unhealthy'
      }
    }
    
    // Claude API circuit breaker
    const circuitStatus = claudeApiCircuitBreaker.getStatus()
    checks.claudeApi = {
      status: circuitStatus.state === 'CLOSED' ? 'pass' : 
              circuitStatus.state === 'HALF_OPEN' ? 'warn' : 'fail',
      message: `Circuit ${circuitStatus.state}`,
      metadata: {
        state: circuitStatus.state,
        failures: circuitStatus.failures,
        errorRate: circuitStatus.errorRate.toFixed(2) + '%'
      }
    }
    
    if (circuitStatus.state === 'OPEN') overallStatus = 'degraded'
    
    // External connectivity check (optional)
    if (c.req.query('detailed') === 'true') {
      const connectivityStart = Date.now()
      try {
        const response = await fetch('https://api.anthropic.com/health', {
          signal: AbortSignal.timeout(5000)
        })
        checks.externalConnectivity = {
          status: response.ok ? 'pass' : 'warn',
          responseTime: Date.now() - connectivityStart,
          metadata: {
            statusCode: response.status
          }
        }
      } catch (error) {
        checks.externalConnectivity = {
          status: 'fail',
          message: 'Cannot reach Claude API',
          responseTime: Date.now() - connectivityStart
        }
        if (overallStatus === 'healthy') overallStatus = 'degraded'
      }
    }
    
    const result: HealthCheckResult = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: options.version || process.env.npm_package_version || 'unknown',
      checks
    }
    
    const statusCode = overallStatus === 'healthy' ? 200 : 
                      overallStatus === 'degraded' ? 200 : 503
    
    return c.json(result, statusCode)
  })
  
  // Metrics endpoint (basic, for Prometheus scraping)
  app.get('/metrics', async (c) => {
    const metrics: string[] = []
    
    // Basic service info
    metrics.push(`# HELP claude_proxy_info Service information`)
    metrics.push(`# TYPE claude_proxy_info gauge`)
    metrics.push(`claude_proxy_info{version="${options.version || 'unknown'}"} 1`)
    
    // Uptime
    metrics.push(`# HELP claude_proxy_uptime_seconds Service uptime in seconds`)
    metrics.push(`# TYPE claude_proxy_uptime_seconds counter`)
    metrics.push(`claude_proxy_uptime_seconds ${Math.floor((Date.now() - startTime) / 1000)}`)
    
    // Circuit breaker state
    const circuitStatus = claudeApiCircuitBreaker.getStatus()
    metrics.push(`# HELP claude_proxy_circuit_breaker_state Circuit breaker state (0=closed, 1=open, 2=half-open)`)
    metrics.push(`# TYPE claude_proxy_circuit_breaker_state gauge`)
    const stateValue = circuitStatus.state === 'CLOSED' ? 0 : 
                      circuitStatus.state === 'OPEN' ? 1 : 2
    metrics.push(`claude_proxy_circuit_breaker_state{name="claude-api"} ${stateValue}`)
    
    // Database pool stats
    if (options.pool) {
      const poolStats = (options.pool as any).pool
      if (poolStats) {
        metrics.push(`# HELP claude_proxy_db_pool_size Total database connections`)
        metrics.push(`# TYPE claude_proxy_db_pool_size gauge`)
        metrics.push(`claude_proxy_db_pool_size ${poolStats.size || 0}`)
        
        metrics.push(`# HELP claude_proxy_db_pool_available Available database connections`)
        metrics.push(`# TYPE claude_proxy_db_pool_available gauge`)
        metrics.push(`claude_proxy_db_pool_available ${poolStats.available || 0}`)
      }
    }
    
    // System metrics
    const systemMetrics = getSystemMetrics()
    metrics.push(`# HELP claude_proxy_memory_usage_bytes Memory usage in bytes`)
    metrics.push(`# TYPE claude_proxy_memory_usage_bytes gauge`)
    metrics.push(`claude_proxy_memory_usage_bytes ${systemMetrics.memoryUsage}`)
    
    metrics.push(`# HELP claude_proxy_cpu_usage_percent CPU usage percentage`)
    metrics.push(`# TYPE claude_proxy_cpu_usage_percent gauge`)
    metrics.push(`claude_proxy_cpu_usage_percent ${systemMetrics.cpuUsage}`)
    
    c.header('Content-Type', 'text/plain; version=0.0.4')
    return c.text(metrics.join('\n'))
  })
  
  return app
}

// Check system health
function checkSystemHealth(): HealthCheckResult['checks'][string] {
  const memoryUsage = process.memoryUsage()
  const totalMemory = os.totalmem()
  const freeMemory = os.freemem()
  const usedMemory = totalMemory - freeMemory
  const memoryPercent = (usedMemory / totalMemory) * 100
  
  // Get CPU usage (simplified)
  const cpus = os.cpus()
  const avgLoad = os.loadavg()[0] // 1 minute average
  const cpuPercent = (avgLoad / cpus.length) * 100
  
  let status: 'pass' | 'warn' | 'fail' = 'pass'
  const warnings: string[] = []
  
  // Check memory usage
  if (memoryPercent > 90) {
    status = 'fail'
    warnings.push('Memory usage critical')
  } else if (memoryPercent > 80) {
    status = 'warn'
    warnings.push('Memory usage high')
  }
  
  // Check heap usage
  const heapPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
  if (heapPercent > 90) {
    if (status !== 'fail') status = 'warn'
    warnings.push('Heap usage high')
  }
  
  // Check CPU
  if (cpuPercent > 90) {
    if (status !== 'fail') status = 'warn'
    warnings.push('CPU usage high')
  }
  
  return {
    status,
    message: warnings.length > 0 ? warnings.join(', ') : undefined,
    metadata: {
      memory: {
        used: Math.round(usedMemory / 1024 / 1024) + 'MB',
        total: Math.round(totalMemory / 1024 / 1024) + 'MB',
        percent: memoryPercent.toFixed(2) + '%',
        heap: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
          percent: heapPercent.toFixed(2) + '%'
        }
      },
      cpu: {
        cores: cpus.length,
        loadAverage: os.loadavg(),
        percent: cpuPercent.toFixed(2) + '%'
      }
    }
  }
}

// Get system metrics for Prometheus
function getSystemMetrics() {
  const memoryUsage = process.memoryUsage()
  const cpus = os.cpus()
  const avgLoad = os.loadavg()[0]
  const cpuPercent = Math.min((avgLoad / cpus.length) * 100, 100)
  
  return {
    memoryUsage: memoryUsage.heapUsed,
    cpuUsage: cpuPercent
  }
}