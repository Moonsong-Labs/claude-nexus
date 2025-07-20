import { UpstreamError, TimeoutError } from '@claude-nexus/shared'
import { logger } from '../middleware/logger'

/**
 * Circuit breaker states following the circuit breaker pattern
 */
enum CircuitState {
  /** Normal operation - requests pass through */
  CLOSED = 'CLOSED',
  /** Failing state - all requests are rejected */
  OPEN = 'OPEN',
  /** Testing state - limited requests allowed to test recovery */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Configuration options for the circuit breaker
 */
interface CircuitBreakerConfig {
  /** Number of consecutive failures to open circuit */
  failureThreshold: number
  /** Number of consecutive successes to close circuit from half-open */
  successThreshold: number
  /** Time to wait before transitioning from open to half-open (ms) */
  timeout: number
  /** Minimum requests in window before circuit can open */
  volumeThreshold: number
  /** Error percentage threshold to open circuit */
  errorThresholdPercentage: number
  /** Time window for calculating error rate (ms) */
  rollingWindowSize: number
}

/**
 * Represents the outcome of a request through the circuit breaker
 */
interface RequestOutcome {
  success: boolean
  timestamp: number
  duration: number
  error?: Error
}

/**
 * Circuit breaker implementation for protecting against cascading failures
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker('api-service');
 * try {
 *   const result = await breaker.execute(() => apiCall());
 * } catch (error) {
 *   // Handle error or circuit open
 * }
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failures: number = 0
  private successes: number = 0
  private lastFailureTime: number = 0
  private nextAttempt: number = 0
  private outcomes: RequestOutcome[] = []

  private static readonly DEFAULT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000, // 1 minute
    volumeThreshold: 10,
    errorThresholdPercentage: 50,
    rollingWindowSize: 60000, // 1 minute
  }

  constructor(
    private name: string,
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    this.config = this.validateConfig({ ...CircuitBreaker.DEFAULT_CONFIG, ...config })
  }

  private readonly config: CircuitBreakerConfig

  /**
   * Validates and returns a complete configuration
   */
  private validateConfig(config: CircuitBreakerConfig): CircuitBreakerConfig {
    if (config.failureThreshold < 1) {
      throw new Error('failureThreshold must be at least 1')
    }
    if (config.successThreshold < 1) {
      throw new Error('successThreshold must be at least 1')
    }
    if (config.timeout < 0) {
      throw new Error('timeout must be non-negative')
    }
    if (config.volumeThreshold < 0) {
      throw new Error('volumeThreshold must be non-negative')
    }
    if (config.errorThresholdPercentage < 0 || config.errorThresholdPercentage > 100) {
      throw new Error('errorThresholdPercentage must be between 0 and 100')
    }
    if (config.rollingWindowSize < 1) {
      throw new Error('rollingWindowSize must be at least 1')
    }
    return config
  }

  /**
   * Executes a function through the circuit breaker
   * @param fn - The async function to execute
   * @returns The result of the function
   * @throws {UpstreamError} When circuit is open
   * @throws The original error from the function
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        logger.warn(`Circuit breaker OPEN for ${this.name}`, {
          metadata: {
            nextAttempt: new Date(this.nextAttempt).toISOString(),
            failures: this.failures,
          },
        })
        throw new UpstreamError('Service temporarily unavailable', 503)
      }

      // Move to half-open state
      this.state = CircuitState.HALF_OPEN
      logger.info(`Circuit breaker HALF-OPEN for ${this.name}`)
    }

    const startTime = Date.now()

    try {
      const result = await fn()
      this.onSuccess(Date.now() - startTime)
      return result
    } catch (error) {
      this.onFailure(
        error instanceof Error ? error : new Error(String(error)),
        Date.now() - startTime
      )
      throw error
    }
  }

  /**
   * Handles successful request completion
   */
  private onSuccess(duration: number): void {
    this.recordOutcome({ success: true, timestamp: Date.now(), duration })

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++

      if (this.successes >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED
        this.failures = 0
        this.successes = 0
        logger.info(`Circuit breaker CLOSED for ${this.name}`)
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.failures = Math.max(0, this.failures - 1)
    }
  }

  /**
   * Handles failed request completion
   */
  private onFailure(error: Error, duration: number): void {
    this.recordOutcome({
      success: false,
      timestamp: Date.now(),
      duration,
      error,
    })

    this.lastFailureTime = Date.now()

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN
      this.nextAttempt = Date.now() + this.config.timeout
      this.successes = 0
      logger.warn(`Circuit breaker OPEN for ${this.name} (half-open test failed)`, {
        error: error.message,
      })
      return
    }

    if (this.state === CircuitState.CLOSED) {
      this.failures++

      // Check if we should open the circuit
      if (this.shouldOpen()) {
        this.state = CircuitState.OPEN
        this.nextAttempt = Date.now() + this.config.timeout
        logger.warn(`Circuit breaker OPEN for ${this.name}`, {
          metadata: {
            failures: this.failures,
            errorRate: this.getErrorRate(),
            recentErrors: this.getRecentErrors(),
          },
        })
      }
    }
  }

  /**
   * Determines if the circuit should transition to open state
   */
  private shouldOpen(): boolean {
    // Not enough requests to make a decision
    if (this.getRecentOutcomes().length < this.config.volumeThreshold) {
      return false
    }

    // Too many consecutive failures
    if (this.failures >= this.config.failureThreshold) {
      return true
    }

    // Error rate too high
    const errorRate = this.getErrorRate()
    if (errorRate >= this.config.errorThresholdPercentage) {
      return true
    }

    return false
  }

  /**
   * Records request outcome and maintains rolling window
   */
  private recordOutcome(outcome: RequestOutcome): void {
    this.outcomes.push(outcome)

    // Clean up old outcomes
    const cutoff = Date.now() - this.config.rollingWindowSize
    this.outcomes = this.outcomes.filter(o => o.timestamp > cutoff)
  }

  /**
   * Gets outcomes within the rolling window
   */
  private getRecentOutcomes(): RequestOutcome[] {
    const cutoff = Date.now() - this.config.rollingWindowSize
    return this.outcomes.filter(o => o.timestamp > cutoff)
  }

  /**
   * Calculates current error rate as a percentage
   */
  private getErrorRate(): number {
    const recent = this.getRecentOutcomes()
    if (recent.length === 0) {
      return 0
    }

    const errors = recent.filter(o => !o.success).length
    return (errors / recent.length) * 100
  }

  /**
   * Gets recent error messages for debugging
   */
  private getRecentErrors(): string[] {
    return this.getRecentOutcomes()
      .filter(o => !o.success && o.error)
      .slice(-5)
      .map(o => o.error!.message)
  }

  /**
   * Gets the current status of the circuit breaker
   * @returns Circuit breaker status information
   */
  getStatus(): {
    state: CircuitState
    failures: number
    errorRate: number
    volumeThreshold: number
    nextAttempt?: Date
  } {
    return {
      state: this.state,
      failures: this.failures,
      errorRate: this.getErrorRate(),
      volumeThreshold: this.config.volumeThreshold,
      nextAttempt: this.nextAttempt > Date.now() ? new Date(this.nextAttempt) : undefined,
    }
  }

  /**
   * Manually resets the circuit breaker to closed state
   * Use with caution - intended for testing or manual intervention
   */
  reset(): void {
    this.state = CircuitState.CLOSED
    this.failures = 0
    this.successes = 0
    this.outcomes = []
    logger.info(`Circuit breaker manually reset for ${this.name}`)
  }
}

/**
 * Global registry of circuit breakers
 */
const circuitBreakers = new Map<string, CircuitBreaker>()

/**
 * Gets or creates a circuit breaker instance
 * @param name - Unique name for the circuit breaker
 * @param config - Optional configuration overrides
 * @returns Circuit breaker instance
 */
export function getCircuitBreaker(
  name: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker(name, config))
  }
  return circuitBreakers.get(name)!
}

/**
 * Pre-configured circuit breaker for Claude API calls
 */
export const claudeApiCircuitBreaker = getCircuitBreaker('claude-api', {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 120000, // 2 minutes
  volumeThreshold: 10,
  errorThresholdPercentage: 50,
  rollingWindowSize: 60000, // 1 minute
})

/**
 * Type guard to check if an error has a status code
 */
function hasStatusCode(error: unknown): error is Error & { statusCode: number } {
  return (
    error instanceof Error && 'statusCode' in error && typeof (error as any).statusCode === 'number'
  )
}

/**
 * Determines if an error should cause the circuit breaker to trip
 * @param error - The error to check
 * @returns true if the error should trip the circuit, false otherwise
 */
export function isCircuitBreakerError(error: Error): boolean {
  // Don't trip on client errors (4xx)
  if (hasStatusCode(error)) {
    const statusCode = error.statusCode
    if (statusCode >= 400 && statusCode < 500) {
      return false // Client error, don't trip circuit
    }
  }

  // Trip on timeouts and upstream errors
  if (error instanceof TimeoutError || error instanceof UpstreamError) {
    return true
  }

  // Trip on network errors
  const networkErrors = ['ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH']
  return networkErrors.some(errType => error.message.includes(errType))
}
