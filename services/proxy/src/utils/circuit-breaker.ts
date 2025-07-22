import { logger } from '../middleware/logger'
import {
  CircuitBreaker as SharedCircuitBreaker,
  CircuitBreakerConfig,
  CircuitBreakerLogger,
  CircuitState,
  isCircuitBreakerError,
} from '@claude-nexus/shared'

// Re-export all types and functions
export { CircuitState, isCircuitBreakerError }
export type { CircuitBreakerConfig }

// Create logger adapter for proxy
const proxyCircuitBreakerLogger: CircuitBreakerLogger = {
  info: (message: string, context?: any) => logger.info(message, context),
  warn: (message: string, context?: any) => logger.warn(message, context),
}

// Proxy-specific circuit breaker class with logging
export class CircuitBreaker extends SharedCircuitBreaker {
  constructor(name: string, config?: Partial<CircuitBreakerConfig>) {
    super(name, { ...config, logger: proxyCircuitBreakerLogger })
  }
}

// Get or create circuit breaker with proxy logging
export function getCircuitBreaker(
  name: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  const configWithLogger = { ...config, logger: proxyCircuitBreakerLogger }
  // Always create a new instance with our logger
  return new CircuitBreaker(name, configWithLogger as CircuitBreakerConfig)
}

// Circuit breaker for Claude API
export const claudeApiCircuitBreaker = getCircuitBreaker('claude-api', {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 120000, // 2 minutes
  volumeThreshold: 10,
  errorThresholdPercentage: 50,
  rollingWindowSize: 60000, // 1 minute
})
