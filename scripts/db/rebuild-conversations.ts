#!/usr/bin/env bun
/**
 * IMPORTANT: This script should NOT implement any business logic.
 * All it should do is fetch requests and use StorageAdapter to process them,
 * just like the proxy does when it receives an HTTP request.
 *
 * The StorageAdapter is the single source of truth for conversation linking logic.
 */

import { Pool } from 'pg'
import { config } from 'dotenv'
import { enableSqlLogging } from '../../services/proxy/src/utils/sql-logger.js'
import { StorageAdapter } from '../../services/proxy/src/storage/StorageAdapter.js'
import { generateConversationId } from '@claude-nexus/shared'

// Load environment variables
config()

// Default batch size for processing requests (~1GB memory)
const DEFAULT_BATCH_SIZE = 1000

// Memory monitoring utilities
const formatMemoryUsage = () => {
  const used = process.memoryUsage()
  return {
    heap: `${Math.round(used.heapUsed / 1024 / 1024)}MB / ${Math.round(used.heapTotal / 1024 / 1024)}MB`,
    heapUsed: used.heapUsed,
    external: Math.round(used.external / 1024 / 1024),
    rss: Math.round(used.rss / 1024 / 1024),
  }
}

interface DbRequest {
  request_id: string
  domain: string
  timestamp: Date
  conversation_id: string | null
  branch_id: string | null
  current_message_hash: string | null
  parent_message_hash: string | null
  system_hash: string | null
  parent_request_id: string | null
  body: {
    messages: unknown[]
    system?: unknown
  }
  message_count: number | null
  created_at: Date
  is_subtask: boolean | null
  parent_task_request_id: string | null
}

interface ConversationRebuilderConfig {
  pool: Pool
  dryRun: boolean
  domainFilter: string | null
  limit: number | null
  debugMode: boolean
  requestIds: string[] | null
  batchSize: number
}

interface UpdateRecord {
  requestId: string
  conversationId: string
  branchId: string
  parentMessageHash: string | null
  currentMessageHash: string
  systemHash: string | null
  parentRequestId: string | null
  isSubtask: boolean
  parentTaskRequestId: string | null
}

/**
 * Rebuilds conversation and branch IDs for all requests
 * This script recalculates conversation grouping based on message parent hashes
 * and includes subtask detection.
 */
class ConversationRebuilder {
  private config: ConversationRebuilderConfig
  private storageAdapter: StorageAdapter

  constructor(config: ConversationRebuilderConfig) {
    this.config = config

    // Enable SQL logging on the pool if debug mode is enabled
    const loggingPool = enableSqlLogging(this.config.pool, {
      logQueries: this.config.debugMode,
      logSlowQueries: true,
      slowQueryThreshold: 5000,
      logStackTrace: false,
    })

    // Create StorageAdapter which handles all conversation linking logic
    this.storageAdapter = new StorageAdapter(loggingPool)
  }

  async rebuild(): Promise<void> {
    const initialMemory = formatMemoryUsage().heapUsed

    try {
      console.log(`\nStarting conversation rebuild...`)
      console.log(`Using ConversationLinker with request-specific timestamps`)
      console.log(
        `Processing in batches of ${this.config.batchSize} requests to optimize memory usage`
      )
      console.log(
        `\nInitial memory: Heap ${formatMemoryUsage().heap}, RSS ${formatMemoryUsage().rss}MB\n`
      )

      // Track overall progress
      const stats = {
        totalProcessed: 0,
        totalUpdates: 0,
        totalSubtasksDetected: 0,
        batchNumber: 0,
        overallChangeTypes: new Map<string, number>(),
      }

      while (true) {
        stats.batchNumber++
        const batchStartTime = Date.now()

        // Load batch of requests
        console.log(`\n[Batch ${stats.batchNumber}] Loading requests...`)
        const requests = await this.loadRequestsBatch(stats.totalProcessed)

        if (requests.length === 0) {
          break
        }

        console.log(`[Batch ${stats.batchNumber}] Found ${requests.length} requests to process`)

        const batchResults = await this.processBatch(requests, stats.totalProcessed)

        // Update overall counters
        stats.totalProcessed += requests.length
        stats.totalUpdates += batchResults.updates
        stats.totalSubtasksDetected += batchResults.subtasks

        // Accumulate overall change types
        for (const [type, count] of batchResults.changeTypes) {
          stats.overallChangeTypes.set(type, (stats.overallChangeTypes.get(type) || 0) + count)
        }

        // Report batch completion
        this.reportBatchProgress(
          stats.batchNumber,
          requests.length,
          batchResults,
          Date.now() - batchStartTime,
          initialMemory,
          stats.totalProcessed
        )

        // Stop if we've hit the limit
        if (this.config.limit && stats.totalProcessed >= this.config.limit) {
          break
        }
      }

      this.showFinalSummary(stats, initialMemory)
      await this.showDatabaseStats()
    } catch (error) {
      console.error('Rebuild failed:', error)
      throw error
    } finally {
      await this.storageAdapter.close()
    }
  }

  private async processBatch(requests: DbRequest[], totalProcessed: number) {
    let batchUpdates = 0
    let batchSubtasks = 0
    const changeTypes = new Map<string, number>()

    for (const request of requests) {
      try {
        if (this.config.debugMode && totalProcessed % 100 === 0) {
          console.log(
            `\n   Processing request ${request.request_id} from ${request.timestamp.toISOString()}`
          )
        }

        const updateData = await this.processRequest(request)

        if (updateData.changes.length > 0) {
          // Log the changes
          console.log(`   [${request.request_id}] Changes:`)
          updateData.changes.forEach(change => console.log(`     - ${change}`))

          // Apply update immediately to ensure next requests can find this one as parent
          if (!this.config.dryRun) {
            await this.applyUpdate(updateData.update)
          }
          batchUpdates++

          // Track change types
          for (const type of updateData.changeTypes) {
            changeTypes.set(type, (changeTypes.get(type) || 0) + 1)
          }

          if (updateData.update.isSubtask) {
            batchSubtasks++
          }
        }
      } catch (error) {
        console.error(`   ❌ Failed to process request ${request.request_id}:`, error)
      }
    }

    return { updates: batchUpdates, subtasks: batchSubtasks, changeTypes }
  }

  private async processRequest(request: DbRequest) {
    // Use StorageAdapter to determine conversation linkage
    const linkingResult = await this.storageAdapter.linkConversation(
      request.domain,
      request.body.messages,
      request.body.system,
      request.request_id,
      request.timestamp // Historical timestamp from the request
    )

    // Log debug info if subtask detected
    if (linkingResult.isSubtask && this.config.debugMode) {
      console.log(
        `   ✓ Detected subtask: parent=${linkingResult.parentTaskRequestId}, sequence=${linkingResult.subtaskSequence}`
      )
    }

    // If no conversation ID was found, keep the existing one or generate a new one if none exists
    const conversationId =
      linkingResult.conversationId || request.conversation_id || generateConversationId()

    // Build list of changes
    const changes: string[] = []
    const changeTypes: string[] = []

    const addChange = (field: string, oldValue: unknown, newValue: unknown) => {
      if (oldValue !== newValue) {
        const oldStr =
          oldValue === null
            ? 'null'
            : typeof oldValue === 'string' && oldValue.length > 20
              ? `${oldValue.substring(0, 8)}...`
              : String(oldValue)
        const newStr =
          newValue === null
            ? 'null'
            : typeof newValue === 'string' && newValue.length > 20
              ? `${newValue.substring(0, 8)}...`
              : String(newValue)
        changes.push(`${field}: ${oldStr} → ${newStr}`)
        changeTypes.push(field)
      }
    }

    addChange('conversation_id', request.conversation_id, conversationId)
    addChange('branch_id', request.branch_id, linkingResult.branchId)
    addChange(
      'current_message_hash',
      request.current_message_hash,
      linkingResult.currentMessageHash
    )
    addChange('parent_message_hash', request.parent_message_hash, linkingResult.parentMessageHash)
    addChange('system_hash', request.system_hash, linkingResult.systemHash)
    addChange('parent_request_id', request.parent_request_id, linkingResult.parentRequestId)
    addChange('is_subtask', request.is_subtask || false, linkingResult.isSubtask || false)
    addChange(
      'parent_task_request_id',
      request.parent_task_request_id,
      linkingResult.parentTaskRequestId
    )

    const update: UpdateRecord = {
      requestId: request.request_id,
      conversationId: conversationId,
      branchId: linkingResult.branchId,
      parentMessageHash: linkingResult.parentMessageHash,
      currentMessageHash: linkingResult.currentMessageHash,
      systemHash: linkingResult.systemHash,
      parentRequestId: linkingResult.parentRequestId,
      isSubtask: linkingResult.isSubtask,
      parentTaskRequestId: linkingResult.parentTaskRequestId || null,
    }

    return { changes, changeTypes, update }
  }

  private async loadRequestsBatch(offset: number): Promise<DbRequest[]> {
    let query = `
      SELECT 
        r.request_id,
        r.domain,
        r.timestamp,
        r.conversation_id,
        r.branch_id,
        r.current_message_hash,
        r.parent_message_hash,
        r.system_hash,
        r.parent_request_id,
        r.body,
        r.message_count,
        r.created_at,
        r.is_subtask,
        r.parent_task_request_id
      FROM api_requests r
      WHERE r.method = 'POST'
        AND r.request_type = 'inference'
    `

    const params: unknown[] = []

    // Apply request ID filter if specified
    if (this.config.requestIds && this.config.requestIds.length > 0) {
      query += ` AND r.request_id = ANY($${params.length + 1})`
      params.push(this.config.requestIds)
    } else {
      // Apply domain filter only if not filtering by request IDs
      if (this.config.domainFilter) {
        query += ` AND r.domain = $${params.length + 1}`
        params.push(this.config.domainFilter)
      }
    }

    // Order and pagination
    query += ` ORDER BY r.timestamp, r.request_id`
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(
      Math.min(
        this.config.batchSize,
        this.config.limit ? this.config.limit - offset : this.config.batchSize
      )
    )
    params.push(offset)

    const result = await this.config.pool.query<DbRequest>(query, params)
    return result.rows
  }

  private async applyUpdate(update: UpdateRecord): Promise<void> {
    const query = `
      UPDATE api_requests
      SET 
        conversation_id = $2,
        branch_id = $3,
        parent_message_hash = $4,
        current_message_hash = $5,
        system_hash = $6,
        parent_request_id = $7,
        is_subtask = $8,
        parent_task_request_id = $9
      WHERE request_id = $1
    `

    await this.config.pool.query(query, [
      update.requestId,
      update.conversationId,
      update.branchId,
      update.parentMessageHash,
      update.currentMessageHash,
      update.systemHash,
      update.parentRequestId,
      update.isSubtask,
      update.parentTaskRequestId,
    ])
  }

  private reportBatchProgress(
    batchNumber: number,
    requestCount: number,
    batchResults: { updates: number; subtasks: number; changeTypes: Map<string, number> },
    duration: number,
    initialMemory: number,
    totalProcessed: number
  ): void {
    const currentMemory = formatMemoryUsage()
    const memoryDelta = Math.round((currentMemory.heapUsed - initialMemory) / 1024 / 1024)

    console.log(`[Batch ${batchNumber}] Complete:`)
    console.log(`   Processed: ${requestCount} requests`)
    console.log(`   Updates applied: ${batchResults.updates}`)
    console.log(`   Subtasks detected: ${batchResults.subtasks}`)

    // Show change type breakdown if there were updates
    if (batchResults.updates > 0 && batchResults.changeTypes.size > 0) {
      console.log(`   Changes by type:`)
      const sortedTypes = Array.from(batchResults.changeTypes.entries()).sort((a, b) => b[1] - a[1])
      for (const [type, count] of sortedTypes) {
        console.log(`     - ${type}: ${count}`)
      }
    }

    console.log(`   Memory: Heap ${currentMemory.heap} (Δ+${memoryDelta}MB from baseline)`)
    console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`)
    console.log(`Overall progress: ${totalProcessed} requests processed`)
  }

  private showFinalSummary(
    stats: {
      totalProcessed: number
      totalUpdates: number
      totalSubtasksDetected: number
      batchNumber: number
      overallChangeTypes: Map<string, number>
    },
    initialMemory: number
  ): void {
    console.log('\n=== Final Summary ===')
    console.log(`Total batches processed: ${stats.batchNumber}`)
    console.log(`Total requests processed: ${stats.totalProcessed}`)
    console.log(`Total updates applied: ${this.config.dryRun ? 0 : stats.totalUpdates}`)
    console.log(`Total subtasks detected: ${stats.totalSubtasksDetected}`)

    // Show overall change type breakdown
    if (stats.totalUpdates > 0 && stats.overallChangeTypes.size > 0) {
      console.log(`\nOverall changes by type:`)
      const sortedTypes = Array.from(stats.overallChangeTypes.entries()).sort((a, b) => b[1] - a[1])
      for (const [type, count] of sortedTypes) {
        const percentage = ((count / stats.totalUpdates) * 100).toFixed(1)
        console.log(`  - ${type}: ${count} (${percentage}% of updates)`)
      }
    }

    const finalMemory = formatMemoryUsage()
    const totalMemoryDelta = Math.round((finalMemory.heapUsed - initialMemory) / 1024 / 1024)
    console.log(`\nFinal memory: Heap ${finalMemory.heap} (Δ+${totalMemoryDelta}MB from baseline)`)
  }

  private async showDatabaseStats(): Promise<void> {
    console.log('\nDatabase statistics:')

    const statsQuery = `
      SELECT 
        COUNT(DISTINCT conversation_id) as total_conversations,
        COUNT(DISTINCT CONCAT(conversation_id, ':', branch_id)) as total_branches,
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE branch_id != 'main') as branch_requests,
        COUNT(*) FILTER (WHERE parent_message_hash IS NOT NULL) as requests_with_parent,
        COUNT(*) FILTER (WHERE is_subtask = true) as subtask_requests
      FROM api_requests
      WHERE method = 'POST' 
        AND request_type = 'inference'
        AND conversation_id IS NOT NULL
    `

    const stats = await this.config.pool.query(statsQuery)
    const row = stats.rows[0]

    console.log(`   Total conversations: ${row.total_conversations}`)
    console.log(`   Total branches: ${row.total_branches}`)
    console.log(`   Total requests with conversations: ${row.total_requests}`)
    console.log(`   Requests on non-main branches: ${row.branch_requests}`)
    console.log(`   Requests with parent links: ${row.requests_with_parent}`)
    console.log(`   Subtask requests: ${row.subtask_requests}`)
  }

  async close(): Promise<void> {
    await this.storageAdapter.close()
  }
}

// Show help information
function showHelp(): void {
  console.log(`
Usage: bun run scripts/db/rebuild-conversations.ts [options]

Rebuilds conversation and branch IDs for all requests by reprocessing them through
the same StorageAdapter pipeline used by the proxy. This script does NOT implement
any business logic - it simply fetches requests and processes them through the
standard conversation linking logic.

Options:
  --help               Show this help message
  --execute            Actually apply changes (default is dry run)
  --domain <domain>    Filter by specific domain
  --limit <number>     Limit number of requests to process
  --batch-size <n>     Number of requests per batch (default: ${DEFAULT_BATCH_SIZE})
  --requests <ids>     Process specific request IDs (comma-separated)
  --debug              Enable debug logging and SQL query logging
  --yes                Skip confirmation prompt (auto-accept)

Examples:
  # Dry run on all requests (shows what would change)
  bun run scripts/db/rebuild-conversations.ts

  # Actually apply changes to all requests
  bun run scripts/db/rebuild-conversations.ts --execute --yes

  # Process with custom batch size for memory optimization
  bun run scripts/db/rebuild-conversations.ts --batch-size 500 --execute

  # Process specific domain with debug output
  bun run scripts/db/rebuild-conversations.ts --domain example.com --debug

  # Process specific requests
  bun run scripts/db/rebuild-conversations.ts --requests "id1,id2,id3" --execute

  # Limit processing to first 100 requests
  bun run scripts/db/rebuild-conversations.ts --limit 100 --execute

Note: This script uses the StorageAdapter to ensure consistency with the proxy's
conversation linking logic, including subtask detection and branch management.
  `)
}

// Parse command line arguments
interface CliFlags {
  dryRun: boolean
  domain: string | null
  limit: number | null
  batchSize: number
  debug: boolean
  yes: boolean
  requests: string[] | null
}

function parseArgs(): CliFlags {
  const args = process.argv.slice(2)

  // Check for help flag first
  if (args.includes('--help') || args.includes('-h')) {
    showHelp()
    process.exit(0)
  }

  const flags: CliFlags = {
    dryRun: !args.includes('--execute'),
    domain: null,
    limit: null,
    batchSize: DEFAULT_BATCH_SIZE,
    debug: args.includes('--debug'),
    yes: args.includes('--yes'),
    requests: null,
  }

  // Parse domain flag
  const domainIndex = args.indexOf('--domain')
  if (domainIndex !== -1 && args[domainIndex + 1]) {
    flags.domain = args[domainIndex + 1]
  }

  // Parse limit flag
  const limitIndex = args.indexOf('--limit')
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    flags.limit = parseInt(args[limitIndex + 1], 10)
    if (isNaN(flags.limit) || flags.limit <= 0) {
      console.error('❌ Invalid limit value. Must be a positive number.')
      process.exit(1)
    }
  }

  // Parse batch size flag
  const batchSizeIndex = args.indexOf('--batch-size')
  if (batchSizeIndex !== -1 && args[batchSizeIndex + 1]) {
    flags.batchSize = parseInt(args[batchSizeIndex + 1], 10)
    if (isNaN(flags.batchSize) || flags.batchSize <= 0) {
      console.error('❌ Invalid batch-size value. Must be a positive number.')
      process.exit(1)
    }
  }

  // Parse requests flag (comma-separated list)
  const requestsIndex = args.indexOf('--requests')
  if (requestsIndex !== -1 && args[requestsIndex + 1]) {
    flags.requests = args[requestsIndex + 1]
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0)
    if (flags.requests.length === 0) {
      console.error('❌ No valid request IDs provided.')
      process.exit(1)
    }
  }

  return flags
}

// Main function
async function main(): Promise<void> {
  console.log('=====================================')
  console.log('Conversation Rebuild Script')
  console.log('=====================================')
  console.log('This script rebuilds conversation linkages using StorageAdapter')

  const flags = parseArgs()

  // Show warnings
  console.log('\n⚠️  WARNING: This will update existing records in the database')
  console.log('It is recommended to backup your database before proceeding')

  // Show current settings
  if (flags.dryRun) {
    console.log('\n🔍 DRY RUN MODE - No changes will be made')
  } else {
    console.log('\n✏️  EXECUTE MODE - Changes WILL be applied')
  }

  if (flags.requests) {
    console.log(`🎯 Processing specific requests: ${flags.requests.join(', ')}`)
  } else if (flags.domain) {
    console.log(`🌐 Filtering by domain: ${flags.domain}`)
  }

  if (flags.limit) {
    console.log(`📊 Limiting to ${flags.limit} requests`)
  }

  console.log(`📦 Batch size: ${flags.batchSize} requests per batch`)

  if (flags.debug) {
    console.log('🐛 Debug mode enabled')
  }

  if (flags.yes) {
    console.log('✅ Auto-accepting warning prompt (--yes flag provided)')
  }

  // Show database info
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    console.error('\n❌ DATABASE_URL environment variable is not set')
    process.exit(1)
  }

  // Parse database name from URL
  const dbName = dbUrl.split('/').pop()?.split('?')[0] || 'unknown'
  console.log(`🗄️  Database: ${dbName}`)

  // Confirm with user unless --yes flag is provided
  if (!flags.yes && !flags.dryRun) {
    console.log('\nDo you want to continue? (yes/no)')
    const answer = await new Promise<string>(resolve => {
      process.stdin.once('data', data => {
        resolve(data.toString().trim().toLowerCase())
      })
    })

    if (answer !== 'yes' && answer !== 'y') {
      console.log('❌ Operation cancelled')
      process.exit(0)
    }
  }

  // Create database pool
  let pool = new Pool({
    connectionString: dbUrl,
    max: 10,
  })

  // Enable SQL logging if DEBUG_SQL is set
  if (process.env.DEBUG_SQL === 'true') {
    pool = enableSqlLogging(pool, {
      logQueries: true,
      logSlowQueries: true,
      slowQueryThreshold: Number(process.env.SLOW_QUERY_THRESHOLD_MS) || 5000,
      logStackTrace: process.env.DEBUG === 'true',
    })
  }

  try {
    const config: ConversationRebuilderConfig = {
      pool,
      dryRun: flags.dryRun,
      domainFilter: flags.domain,
      limit: flags.limit,
      debugMode: flags.debug,
      requestIds: flags.requests,
      batchSize: flags.batchSize,
    }

    const rebuilder = new ConversationRebuilder(config)
    await rebuilder.rebuild()
    console.log('\n✅ Rebuild completed successfully!')
  } catch (error) {
    console.error('\n❌ Rebuild failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
    // Ensure the process exits cleanly after pool is closed
    process.exit(0)
  }
}

// Run the script
main().catch(error => {
  console.error('Unexpected error:', error)
  process.exit(1)
})
