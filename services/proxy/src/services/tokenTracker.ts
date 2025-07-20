export interface DomainTokenStats {
  inputTokens: number
  outputTokens: number
  requestCount: number
  queryEvaluationCount: number // Requests with 1 system message
  inferenceCount: number // Requests with >1 system messages
  toolCallCount: number // Total tool calls across all responses
  lastUpdated: number
}

// Constants
const DEFAULT_REPORTING_INTERVAL = 10000 // 10 seconds
const MAX_DOMAINS = 1000 // Maximum number of domains to track
const STALE_DATA_THRESHOLD = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

/**
 * In-memory token usage tracker with periodic console reporting
 */
class TokenTracker {
  private stats: Map<string, DomainTokenStats> = new Map()
  private intervalId: Timer | null = null
  private startTime: number = Date.now()
  private reportingIntervalMs: number = DEFAULT_REPORTING_INTERVAL

  /**
   * Track token usage for a domain
   * @param domain - The domain to track usage for
   * @param inputTokens - Number of input tokens used
   * @param outputTokens - Number of output tokens generated
   * @param requestType - Type of request (query_evaluation or inference)
   * @param toolCallCount - Number of tool calls in the response
   */
  track(
    domain: string,
    inputTokens: number = 0,
    outputTokens: number = 0,
    requestType?: 'query_evaluation' | 'inference',
    toolCallCount: number = 0
  ) {
    try {
      // Clean up stale data if we're at capacity
      if (this.stats.size >= MAX_DOMAINS) {
        this.cleanupStaleData()
      }

      const current = this.stats.get(domain) || {
        inputTokens: 0,
        outputTokens: 0,
        requestCount: 0,
        queryEvaluationCount: 0,
        inferenceCount: 0,
        toolCallCount: 0,
        lastUpdated: Date.now(),
      }

      this.stats.set(domain, {
        inputTokens: current.inputTokens + inputTokens,
        outputTokens: current.outputTokens + outputTokens,
        requestCount: current.requestCount + 1,
        queryEvaluationCount:
          current.queryEvaluationCount + (requestType === 'query_evaluation' ? 1 : 0),
        inferenceCount: current.inferenceCount + (requestType === 'inference' ? 1 : 0),
        toolCallCount: current.toolCallCount + toolCallCount,
        lastUpdated: Date.now(),
      })
    } catch (error) {
      console.error('Error tracking token usage:', error)
    }
  }

  /**
   * Start periodic reporting
   * @param intervalMs - Reporting interval in milliseconds
   */
  startReporting(intervalMs: number = DEFAULT_REPORTING_INTERVAL) {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }

    this.reportingIntervalMs = intervalMs
    const intervalSeconds = Math.round(intervalMs / 1000)

    // Print initial header
    console.log(`\nToken usage tracking started (reporting every ${intervalSeconds}s)`)
    console.log('='.repeat(90))

    this.intervalId = setInterval(() => {
      this.printStats()
    }, intervalMs)
  }

  /**
   * Stop periodic reporting
   */
  stopReporting() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.log('\nToken usage tracking stopped')
    }
  }

  /**
   * Get current statistics (for API endpoints)
   * @returns Token statistics by domain
   */
  getStats(): Record<string, DomainTokenStats> {
    const result: Record<string, DomainTokenStats> = {}
    for (const [domain, stats] of this.stats) {
      result[domain] = { ...stats }
    }
    return result
  }

  /**
   * Reset all statistics
   */
  reset() {
    this.stats.clear()
    this.startTime = Date.now()
    console.log('Token usage statistics reset')
  }

  /**
   * Print current statistics to console
   */
  printStats() {
    try {
      if (this.stats.size === 0) {
        return // Don't print if no stats collected
      }

      const now = Date.now()
      const uptime = Math.floor((now - this.startTime) / 1000)

      console.log('\n' + '='.repeat(90))
      console.log(
        `Token Usage Report - ${new Date().toLocaleString()} (Uptime: ${this.formatUptime(uptime)})`
      )
      console.log('='.repeat(90))
      console.log(
        'Domain'.padEnd(25) +
          'Reqs'.padStart(6) +
          'Query'.padStart(7) +
          'Infer'.padStart(7) +
          'Tools'.padStart(7) +
          'Input Tok'.padStart(12) +
          'Output Tok'.padStart(12) +
          'Total Tok'.padStart(12)
      )
      console.log('-'.repeat(90))

      let totalInput = 0
      let totalOutput = 0
      let totalRequests = 0
      let totalQueryEval = 0
      let totalInference = 0
      let totalToolCalls = 0

      // Sort domains alphabetically
      const sortedDomains = Array.from(this.stats.entries()).sort((a, b) =>
        a[0].localeCompare(b[0])
      )

      for (const [domain, stats] of sortedDomains) {
        const total = stats.inputTokens + stats.outputTokens
        console.log(
          domain.padEnd(25) +
            stats.requestCount.toString().padStart(6) +
            stats.queryEvaluationCount.toString().padStart(7) +
            stats.inferenceCount.toString().padStart(7) +
            stats.toolCallCount.toString().padStart(7) +
            stats.inputTokens.toLocaleString().padStart(12) +
            stats.outputTokens.toLocaleString().padStart(12) +
            total.toLocaleString().padStart(12)
        )

        totalInput += stats.inputTokens
        totalOutput += stats.outputTokens
        totalRequests += stats.requestCount
        totalQueryEval += stats.queryEvaluationCount
        totalInference += stats.inferenceCount
        totalToolCalls += stats.toolCallCount
      }

      // Print totals
      console.log('-'.repeat(90))
      const grandTotal = totalInput + totalOutput
      console.log(
        'TOTAL'.padEnd(25) +
          totalRequests.toString().padStart(6) +
          totalQueryEval.toString().padStart(7) +
          totalInference.toString().padStart(7) +
          totalToolCalls.toString().padStart(7) +
          totalInput.toLocaleString().padStart(12) +
          totalOutput.toLocaleString().padStart(12) +
          grandTotal.toLocaleString().padStart(12)
      )
      console.log('='.repeat(90))
    } catch (error) {
      console.error('Error printing token stats:', error)
    }
  }

  /**
   * Clean up stale data when approaching capacity limit
   * Removes domains that haven't been updated within the threshold
   */
  private cleanupStaleData() {
    const now = Date.now()
    const staleEntries: string[] = []

    for (const [domain, stats] of this.stats) {
      if (now - stats.lastUpdated > STALE_DATA_THRESHOLD) {
        staleEntries.push(domain)
      }
    }

    // Remove stale entries
    for (const domain of staleEntries) {
      this.stats.delete(domain)
    }

    // If still at capacity after removing stale data, remove oldest entries
    if (this.stats.size >= MAX_DOMAINS) {
      const sortedByTime = Array.from(this.stats.entries()).sort(
        (a, b) => a[1].lastUpdated - b[1].lastUpdated
      )

      // Remove oldest 10% of entries
      const toRemove = Math.ceil(this.stats.size * 0.1)
      for (let i = 0; i < toRemove; i++) {
        this.stats.delete(sortedByTime[i][0])
      }
    }
  }

  /**
   * Format uptime in human-readable format
   * @param seconds - Uptime in seconds
   * @returns Formatted uptime string
   */
  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    const parts = []
    if (days > 0) {
      parts.push(`${days}d`)
    }
    if (hours > 0) {
      parts.push(`${hours}h`)
    }
    if (minutes > 0) {
      parts.push(`${minutes}m`)
    }
    parts.push(`${secs}s`)

    return parts.join(' ')
  }
}

// Create singleton instance
export const tokenTracker = new TokenTracker()
