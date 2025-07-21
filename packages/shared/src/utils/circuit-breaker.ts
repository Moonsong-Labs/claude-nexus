import { UpstreamError, TimeoutError } from '../types/errors.js'

// Logger interface for circuit breaker operations
export interface CircuitBreakerLogger {
  info: (message: string, context?: any) => void
  warn: (message: string, context?: any) => void
}

// Circuit breaker states
export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing, reject all requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

// Circuit breaker configuration
export interface CircuitBreakerConfig {
  failureThreshold: number // Number of failures to open circuit
  successThreshold: number // Number of successes to close circuit
  timeout: number // Time to wait before half-open (ms)
  volumeThreshold: number // Minimum requests before opening
  errorThresholdPercentage: number // Error percentage to open
  rollingWindowSize: number // Time window for stats (ms)
  logger?: CircuitBreakerLogger
}

// Request outcome
export interface RequestOutcome {
  success: boolean
  timestamp: number
  duration: number
  error?: Error
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failures: number = 0
  private successes: number = 0
  private lastFailureTime: number = 0
  private nextAttempt: number = 0
  private outcomes: RequestOutcome[] = []

  constructor(
    private name: string,
    private config: CircuitBreakerConfig = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000, // 1 minute
      volumeThreshold: 10,
      errorThresholdPercentage: 50,
      rollingWindowSize: 60000, // 1 minute
    }
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        if (this.config.logger) {
          this.config.logger.warn(`Circuit breaker OPEN for ${this.name}`, {
            metadata: {
              nextAttempt: new Date(this.nextAttempt).toISOString(),
              failures: this.failures,
            },
          })
        }
        throw new UpstreamError('Service temporarily unavailable', 503)
      }

      // Move to half-open state
      this.state = CircuitState.HALF_OPEN
      if (this.config.logger) {
        this.config.logger.info(`Circuit breaker HALF-OPEN for ${this.name}`)
      }
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

  private onSuccess(duration: number): void {
    this.recordOutcome({ success: true, timestamp: Date.now(), duration })

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++

      if (this.successes >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED
        this.failures = 0
        this.successes = 0
        if (this.config.logger) {
          this.config.logger.info(`Circuit breaker CLOSED for ${this.name}`)
        }
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.failures = Math.max(0, this.failures - 1)
    }
  }

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
      if (this.config.logger) {
        this.config.logger.warn(`Circuit breaker OPEN for ${this.name} (half-open test failed)`, {
          error: error.message,
        })
      }
      return
    }

    if (this.state === CircuitState.CLOSED) {
      this.failures++

      // Check if we should open the circuit
      if (this.shouldOpen()) {
        this.state = CircuitState.OPEN
        this.nextAttempt = Date.now() + this.config.timeout
        if (this.config.logger) {
          this.config.logger.warn(`Circuit breaker OPEN for ${this.name}`, {
            metadata: {
              failures: this.failures,
              errorRate: this.getErrorRate(),
              recentErrors: this.getRecentErrors(),
            },
          })
        }
      }
    }
  }

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

  private recordOutcome(outcome: RequestOutcome): void {
    this.outcomes.push(outcome)

    // Clean up old outcomes
    const cutoff = Date.now() - this.config.rollingWindowSize
    this.outcomes = this.outcomes.filter(o => o.timestamp > cutoff)
  }

  private getRecentOutcomes(): RequestOutcome[] {
    const cutoff = Date.now() - this.config.rollingWindowSize
    return this.outcomes.filter(o => o.timestamp > cutoff)
  }

  private getErrorRate(): number {
    const recent = this.getRecentOutcomes()
    if (recent.length === 0) {
      return 0
    }

    const errors = recent.filter(o => !o.success).length
    return (errors / recent.length) * 100
  }

  private getRecentErrors(): string[] {
    return this.getRecentOutcomes()
      .filter(o => !o.success && o.error)
      .slice(-5)
      .map(o => o.error!.message)
  }

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

  // Force circuit to close (for testing or manual intervention)
  reset(): void {
    this.state = CircuitState.CLOSED
    this.failures = 0
    this.successes = 0
    this.outcomes = []
    if (this.config.logger) {
      this.config.logger.info(`Circuit breaker manually reset for ${this.name}`)
    }
  }
}

// Global circuit breakers registry
const circuitBreakers = new Map<string, CircuitBreaker>()

// Get or create circuit breaker
export function getCircuitBreaker(
  name: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker(name, config as any))
  }
  return circuitBreakers.get(name)!
}

// Helper to check if error should trip circuit
export function isCircuitBreakerError(error: Error): boolean {
  // Don't trip on client errors
  if (error instanceof Error && 'statusCode' in error) {
    const statusCode = (error as any).statusCode
    if (statusCode >= 400 && statusCode < 500) {
      return false // Client error, don't trip circuit
    }
  }

  // Trip on timeouts, network errors, 5xx errors
  return (
    error instanceof TimeoutError ||
    error instanceof UpstreamError ||
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('ETIMEDOUT') ||
    error.message.includes('ENETUNREACH')
  )
}
