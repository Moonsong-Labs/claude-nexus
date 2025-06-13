interface DomainTokenStats {
  inputTokens: number
  outputTokens: number
  requestCount: number
  lastUpdated: number
}

class TokenTracker {
  private stats: Map<string, DomainTokenStats> = new Map()
  private intervalId: NodeJS.Timeout | null = null
  private startTime: number = Date.now()

  /**
   * Track token usage for a domain
   */
  track(domain: string, inputTokens: number = 0, outputTokens: number = 0) {
    const current = this.stats.get(domain) || {
      inputTokens: 0,
      outputTokens: 0,
      requestCount: 0,
      lastUpdated: Date.now()
    }

    this.stats.set(domain, {
      inputTokens: current.inputTokens + inputTokens,
      outputTokens: current.outputTokens + outputTokens,
      requestCount: current.requestCount + 1,
      lastUpdated: Date.now()
    })
  }

  /**
   * Start periodic reporting
   */
  startReporting(intervalMs: number = 10000) {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }

    // Print initial header
    console.log('\nToken usage tracking started (reporting every 10s)')
    console.log('=' .repeat(80))

    this.intervalId = setInterval(() => {
      this.printStats()
    }, intervalMs)
  }

  /**
   * Stop periodic reporting
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.log('\nToken usage tracking stopped')
    }
  }

  /**
   * Print current statistics
   */
  private printStats() {
    if (this.stats.size === 0) {
      return // Don't print if no stats collected
    }

    const now = Date.now()
    const uptime = Math.floor((now - this.startTime) / 1000)
    
    console.log('\n' + '='.repeat(80))
    console.log(`Token Usage Report - ${new Date().toLocaleString()} (Uptime: ${this.formatUptime(uptime)})`)
    console.log('='.repeat(80))
    console.log(
      'Domain'.padEnd(30) + 
      'Requests'.padStart(10) + 
      'Input Tokens'.padStart(15) + 
      'Output Tokens'.padStart(15) + 
      'Total Tokens'.padStart(15)
    )
    console.log('-'.repeat(80))

    let totalInput = 0
    let totalOutput = 0
    let totalRequests = 0

    // Sort domains alphabetically
    const sortedDomains = Array.from(this.stats.entries()).sort((a, b) => a[0].localeCompare(b[0]))

    for (const [domain, stats] of sortedDomains) {
      const total = stats.inputTokens + stats.outputTokens
      console.log(
        domain.padEnd(30) + 
        stats.requestCount.toString().padStart(10) + 
        stats.inputTokens.toLocaleString().padStart(15) + 
        stats.outputTokens.toLocaleString().padStart(15) + 
        total.toLocaleString().padStart(15)
      )
      
      totalInput += stats.inputTokens
      totalOutput += stats.outputTokens
      totalRequests += stats.requestCount
    }

    // Print totals
    console.log('-'.repeat(80))
    const grandTotal = totalInput + totalOutput
    console.log(
      'TOTAL'.padEnd(30) + 
      totalRequests.toString().padStart(10) + 
      totalInput.toLocaleString().padStart(15) + 
      totalOutput.toLocaleString().padStart(15) + 
      grandTotal.toLocaleString().padStart(15)
    )
    console.log('='.repeat(80))
  }

  /**
   * Format uptime in human-readable format
   */
  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    const parts = []
    if (days > 0) parts.push(`${days}d`)
    if (hours > 0) parts.push(`${hours}h`)
    if (minutes > 0) parts.push(`${minutes}m`)
    parts.push(`${secs}s`)

    return parts.join(' ')
  }

  /**
   * Get current statistics (for API endpoints)
   */
  getStats(): Record<string, DomainTokenStats> {
    const result: Record<string, DomainTokenStats> = {}
    for (const [domain, stats] of this.stats) {
      result[domain] = { ...stats }
    }
    return result
  }

  /**
   * Reset statistics
   */
  reset() {
    this.stats.clear()
    this.startTime = Date.now()
    console.log('Token usage statistics reset')
  }
}

// Create singleton instance
export const tokenTracker = new TokenTracker()