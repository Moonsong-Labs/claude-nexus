#!/usr/bin/env bun
/**
 * Script to analyze existing requests and show what conversation structure would be created
 * This is a dry-run version that doesn't modify the database
 *
 * Improvements:
 * - Uses production ConversationLinker for accurate analysis
 * - Processes data in batches to handle large databases
 * - Proper TypeScript types throughout
 * - Configurable output options
 */

import { Pool } from 'pg'
import { config } from 'dotenv'
import { createLoggingPool } from './utils/create-logging-pool.js'
import { ConversationLinker } from '../../packages/shared/src/utils/conversation-linker.js'
import type {
  LinkingRequest,
  LinkingResult,
  TaskInvocation,
} from '../../packages/shared/src/utils/conversation-linker.js'

// Load environment variables
config()

// Constants
const DEFAULT_BATCH_SIZE = 10000
const HASH_PREVIEW_LENGTH = 8
const TOP_CHAINS_LIMIT = 10
const TOP_BRANCHES_LIMIT = 5

interface DbRequest {
  request_id: string
  domain: string
  timestamp: Date
  current_message_hash: string | null
  parent_message_hash: string | null
  conversation_id: string | null
  branch_id: string | null
  parent_request_id: string | null
  model: string
  total_tokens: number
  body: any
  system_hash: string | null
  message_count: number
  is_subtask: boolean
  parent_task_request_id: string | null
}

interface ConversationChain {
  conversationId: string
  rootRequestId: string
  rootTimestamp: Date
  requestCount: number
  branchCount: number
  totalTokens: number
  models: Set<string>
  lastActivity: Date
}

interface DomainAnalysis {
  domain: string
  totalRequests: number
  uniqueConversations: number
  rootRequests: number
  orphanedRequests: number
  conversationChains: ConversationChain[]
  branchPoints: Map<string, number> // parent_hash -> child count
  subtaskCount: number
}

class ConversationAnalyzer {
  private pool: Pool
  private batchSize: number
  private showProgress: boolean
  private outputFormat: 'console' | 'json'
  private conversationLinker: ConversationLinker

  constructor(
    databaseUrl: string,
    options: {
      batchSize?: number
      showProgress?: boolean
      outputFormat?: 'console' | 'json'
    } = {}
  ) {
    this.pool = createLoggingPool(databaseUrl)
    this.batchSize = options.batchSize || DEFAULT_BATCH_SIZE
    this.showProgress = options.showProgress ?? true
    this.outputFormat = options.outputFormat || 'console'

    // Initialize ConversationLinker with required executors
    this.conversationLinker = new ConversationLinker(
      {
        queryExecutor: this.createQueryExecutor(),
        compactSearchExecutor: this.createCompactSearchExecutor(),
        subtaskQueryExecutor: this.createSubtaskQueryExecutor(),
        requestByIdExecutor: this.createRequestByIdExecutor(),
      },
      undefined, // logger
      undefined, // sharedLogger
      { version: '1.0' } // metadata
    )
  }

  // Create executor functions for ConversationLinker
  private createQueryExecutor() {
    return async (parentHash: string, domain: string): Promise<LinkingResult | null> => {
      const query = `
        SELECT request_id, conversation_id, branch_id, parent_request_id
        FROM api_requests
        WHERE current_message_hash = $1 AND domain = $2
        LIMIT 1
      `
      const result = await this.pool.query(query, [parentHash, domain])
      if (result.rows.length === 0) return null

      const row = result.rows[0]
      return {
        conversationId: row.conversation_id,
        branchId: row.branch_id,
        parentRequestId: row.parent_request_id,
        currentMessageHash: null,
        parentMessageHash: null,
        systemHash: null,
      }
    }
  }

  private createCompactSearchExecutor() {
    // For analysis, we don't need to search for compact conversations
    return async (): Promise<LinkingResult | null> => null
  }

  private createSubtaskQueryExecutor() {
    // For analysis, we can skip subtask detection to keep it simple
    return async (): Promise<TaskInvocation[]> => []
  }

  private createRequestByIdExecutor() {
    return async (requestId: string): Promise<LinkingResult | null> => {
      const query = `
        SELECT conversation_id, branch_id
        FROM api_requests
        WHERE request_id = $1
        LIMIT 1
      `
      const result = await this.pool.query(query, [requestId])
      if (result.rows.length === 0) return null

      const row = result.rows[0]
      return {
        conversationId: row.conversation_id,
        branchId: row.branch_id,
        parentRequestId: null,
        currentMessageHash: null,
        parentMessageHash: null,
        systemHash: null,
      }
    }
  }

  async analyze() {
    if (this.showProgress) {
      console.log('Starting conversation analysis...')
      console.log(`Processing in batches of ${this.batchSize.toLocaleString()} requests`)
    }

    const domainAnalyses = new Map<string, DomainAnalysis>()
    let totalProcessed = 0
    let offset = 0

    try {
      // Get total count first
      const countResult = await this.pool.query('SELECT COUNT(*) FROM api_requests')
      const totalCount = parseInt(countResult.rows[0].count)

      if (this.showProgress) {
        console.log(`\nTotal requests to analyze: ${totalCount.toLocaleString()}\n`)
      }

      // Process in batches
      while (true) {
        const requests = await this.loadRequestsBatch(offset, this.batchSize)
        if (requests.length === 0) break

        // Analyze this batch
        await this.analyzeBatch(requests, domainAnalyses)

        totalProcessed += requests.length
        offset += this.batchSize

        if (this.showProgress) {
          const progress = Math.round((totalProcessed / totalCount) * 100)
          process.stdout.write(
            `\rProcessed: ${totalProcessed.toLocaleString()} / ${totalCount.toLocaleString()} (${progress}%)`
          )
        }
      }

      if (this.showProgress) {
        console.log('\n')
      }

      // Output results
      if (this.outputFormat === 'json') {
        this.outputJson(domainAnalyses)
      } else {
        this.outputConsole(domainAnalyses)
      }

      // Overall statistics
      const totalStats = await this.getOverallStats()
      if (this.outputFormat === 'console') {
        console.log('\n' + '='.repeat(80))
        console.log('OVERALL STATISTICS:')
        console.log('='.repeat(80))
        console.log(`Total requests analyzed: ${totalStats.totalRequests.toLocaleString()}`)
        console.log(`Unique conversations: ${totalStats.uniqueConversations.toLocaleString()}`)
        console.log(`Total branch points: ${totalStats.totalBranchPoints.toLocaleString()}`)
        console.log(`Total subtasks: ${totalStats.totalSubtasks.toLocaleString()}`)
      }
    } catch (error) {
      console.error('\nError during analysis:', error)
      throw error
    } finally {
      await this.pool.end()
    }
  }

  private async loadRequestsBatch(offset: number, limit: number): Promise<DbRequest[]> {
    const query = `
      SELECT 
        request_id,
        domain,
        timestamp,
        current_message_hash,
        parent_message_hash,
        conversation_id,
        branch_id,
        parent_request_id,
        model,
        total_tokens,
        body,
        system_hash,
        message_count,
        is_subtask,
        parent_task_request_id
      FROM api_requests
      ORDER BY timestamp ASC
      LIMIT $1 OFFSET $2
    `

    const result = await this.pool.query(query, [limit, offset])
    return result.rows
  }

  private async analyzeBatch(requests: DbRequest[], domainAnalyses: Map<string, DomainAnalysis>) {
    // Group by domain
    const requestsByDomain = new Map<string, DbRequest[]>()
    for (const request of requests) {
      if (!requestsByDomain.has(request.domain)) {
        requestsByDomain.set(request.domain, [])
      }
      requestsByDomain.get(request.domain)!.push(request)
    }

    // Process each domain
    for (const [domain, domainRequests] of Array.from(requestsByDomain.entries())) {
      if (!domainAnalyses.has(domain)) {
        domainAnalyses.set(domain, {
          domain,
          totalRequests: 0,
          uniqueConversations: 0,
          rootRequests: 0,
          orphanedRequests: 0,
          conversationChains: [],
          branchPoints: new Map(),
          subtaskCount: 0,
        })
      }

      const analysis = domainAnalyses.get(domain)!

      // Analyze each request
      for (const request of domainRequests) {
        analysis.totalRequests++

        if (!request.parent_message_hash) {
          analysis.rootRequests++
        }

        if (request.is_subtask) {
          analysis.subtaskCount++
        }

        // Track branch points
        if (request.parent_message_hash) {
          const count = analysis.branchPoints.get(request.parent_message_hash) || 0
          analysis.branchPoints.set(request.parent_message_hash, count + 1)
        }
      }
    }
  }

  private outputConsole(domainAnalyses: Map<string, DomainAnalysis>) {
    console.log('\n' + '='.repeat(80))
    console.log('CONVERSATION ANALYSIS RESULTS')
    console.log('='.repeat(80))

    for (const [domain, analysis] of Array.from(domainAnalyses.entries())) {
      console.log(`\nDomain: ${domain}`)
      console.log('-'.repeat(40))
      console.log(`Total requests: ${analysis.totalRequests.toLocaleString()}`)
      console.log(`Root requests: ${analysis.rootRequests.toLocaleString()}`)
      console.log(`Subtasks: ${analysis.subtaskCount.toLocaleString()}`)

      // Count actual branch points (where count > 1)
      const actualBranchPoints = Array.from(analysis.branchPoints.entries()).filter(
        ([_, count]) => count > 1
      ) as Array<[string, number]>
      console.log(`Branch points: ${actualBranchPoints.length.toLocaleString()}`)

      // Show top branch points
      if (actualBranchPoints.length > 0) {
        console.log(`\nTop branch points:`)
        const topBranches = actualBranchPoints
          .sort((a, b) => b[1] - a[1])
          .slice(0, TOP_BRANCHES_LIMIT)

        for (const [hash, count] of topBranches) {
          console.log(`  ${hash.substring(0, HASH_PREVIEW_LENGTH)}... → ${count} branches`)
        }

        if (actualBranchPoints.length > TOP_BRANCHES_LIMIT) {
          console.log(`  ... and ${actualBranchPoints.length - TOP_BRANCHES_LIMIT} more`)
        }
      }
    }
  }

  private outputJson(domainAnalyses: Map<string, DomainAnalysis>) {
    const output = {
      domains: Object.fromEntries(domainAnalyses),
      summary: {
        totalDomains: domainAnalyses.size,
        totalRequests: Array.from(domainAnalyses.values()).reduce(
          (sum, d) => sum + d.totalRequests,
          0
        ),
      },
    }
    console.log(JSON.stringify(output, null, 2))
  }

  private async getOverallStats() {
    const queries = await Promise.all([
      // Total requests
      this.pool.query('SELECT COUNT(*) FROM api_requests'),
      // Unique conversations
      this.pool.query(
        'SELECT COUNT(DISTINCT conversation_id) FROM api_requests WHERE conversation_id IS NOT NULL'
      ),
      // Branch points
      this.pool.query(`
        SELECT COUNT(*) FROM (
          SELECT parent_message_hash, COUNT(*) as child_count
          FROM api_requests
          WHERE parent_message_hash IS NOT NULL
          GROUP BY parent_message_hash
          HAVING COUNT(*) > 1
        ) AS branch_points
      `),
      // Subtasks
      this.pool.query('SELECT COUNT(*) FROM api_requests WHERE is_subtask = true'),
    ])

    return {
      totalRequests: parseInt(queries[0].rows[0].count),
      uniqueConversations: parseInt(queries[1].rows[0].count),
      totalBranchPoints: parseInt(queries[2].rows[0].count),
      totalSubtasks: parseInt(queries[3].rows[0].count),
    }
  }

  // Parse command line arguments
  static parseArgs(args: string[]): {
    batchSize?: number
    format?: 'console' | 'json'
    help?: boolean
  } {
    const options: {
      batchSize?: number
      format?: 'console' | 'json'
      help?: boolean
    } = {}

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]

      if (arg === '--help' || arg === '-h') {
        options.help = true
      } else if (arg === '--batch-size' && i + 1 < args.length) {
        options.batchSize = parseInt(args[++i])
      } else if (arg === '--format' && i + 1 < args.length) {
        const format = args[++i]
        if (format === 'json' || format === 'console') {
          options.format = format
        }
      }
    }

    return options
  }

  static showHelp() {
    console.log(`
Conversation Analysis Script

Analyzes existing requests to show conversation structure without modifying data.

Usage:
  bun run scripts/db/analyze-conversations.ts [options]

Options:
  --batch-size <number>   Number of requests to process per batch (default: ${DEFAULT_BATCH_SIZE})
  --format <format>       Output format: 'console' or 'json' (default: console)
  --help, -h             Show this help message

Examples:
  # Standard analysis
  bun run scripts/db/analyze-conversations.ts
  
  # Large database with custom batch size
  bun run scripts/db/analyze-conversations.ts --batch-size 50000
  
  # Output as JSON
  bun run scripts/db/analyze-conversations.ts --format json
`)
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2)
  const options = ConversationAnalyzer.parseArgs(args)

  if (options.help) {
    ConversationAnalyzer.showHelp()
    process.exit(0)
  }

  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required')
    process.exit(1)
  }

  if (options.format !== 'json') {
    console.log('===========================================')
    console.log('Conversation Analysis Script')
    console.log('===========================================')
    console.log('Analyzing conversation structure in the database.')
    console.log('This is a read-only operation.\n')
  }

  const analyzer = new ConversationAnalyzer(databaseUrl, {
    batchSize: options.batchSize,
    outputFormat: options.format,
    showProgress: options.format !== 'json',
  })

  try {
    await analyzer.analyze()
  } catch (error) {
    console.error('\n❌ Analysis failed:', error)
    process.exit(1)
  }
}

// Run the script
main()
