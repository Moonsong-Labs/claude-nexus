#!/usr/bin/env bun
/**
 * Script to rebuild conversation linkages using the ConversationLinker
 * This version delegates all linking logic to the ConversationLinker class
 */

import { Pool } from 'pg'
import { config } from 'dotenv'
import { createLoggingPool } from './utils/create-logging-pool.js'
import { ConversationLinker, createQueryExecutors } from '../../packages/shared/src/index.js'
import { generateConversationId } from '../../packages/shared/src/utils/conversation-hash.js'

// Load environment variables
config()

// Batch size for processing requests (default 1000 ~= 1GB memory)
const BATCH_SIZE = 1000

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
  body: any
  message_count: number | null
  created_at: Date
  is_subtask: boolean | null
}

interface ConversationUpdate {
  request_id: string
  conversation_id: string
  branch_id: string
  parent_request_id: string | null
  current_message_hash: string
  parent_message_hash: string | null
  system_hash: string | null
  is_subtask: boolean
}

class ConversationRebuilderV2 {
  private pool: Pool
  private conversationLinker: ConversationLinker
  private dryRun: boolean
  private domainFilter: string | null
  private limit: number | null
  private debugMode: boolean
  private requestIds: string[] | null

  constructor(
    databaseUrl: string,
    dryRun: boolean = false,
    domainFilter: string | null = null,
    limit: number | null = null,
    debugMode: boolean = false,
    requestIds: string[] | null = null
  ) {
    // Reduce pool size for batch processing to prevent connection accumulation
    this.pool = createLoggingPool(databaseUrl, {
      max: 5, // Reduced from default 10
      idleTimeoutMillis: 30000, // 30 seconds
      connectionTimeoutMillis: 5000,
    })
    this.dryRun = dryRun
    this.domainFilter = domainFilter
    this.limit = limit
    this.debugMode = debugMode
    this.requestIds = requestIds

    // Create query executors using shared implementation
    const { queryExecutor, compactSearchExecutor } = createQueryExecutors(this.pool)
    this.conversationLinker = new ConversationLinker(queryExecutor, compactSearchExecutor)
  }

  /**
   * Extract database name from connection string
   */
  public static extractDatabaseName(connectionString: string): string | null {
    if (!connectionString) return null

    try {
      if (
        connectionString.startsWith('postgres://') ||
        connectionString.startsWith('postgresql://')
      ) {
        const url = new URL(connectionString.replace(/^postgres(ql)?:\/\//, 'http://'))
        const dbName = url.pathname.split('/')[1]
        return dbName || null
      } else {
        const match = connectionString.match(/(?:^|\s)dbname=([^\s]+)/)
        return match ? match[1] : null
      }
    } catch {
      return null
    }
  }

  async rebuild() {
    console.log('Starting conversation rebuild (v2)...')
    console.log('Using ConversationLinker for all linking logic')
    console.log(`Processing in batches of ${BATCH_SIZE} requests to optimize memory usage`)
    console.log('')

    // Track initial memory baseline
    const initialMemory = formatMemoryUsage()
    const heapBaseline = initialMemory.heapUsed
    console.log(`Initial memory: Heap ${initialMemory.heap}, RSS ${initialMemory.rss}MB`)
    console.log('')

    try {
      // Initialize counters outside the batch loop
      let totalProcessed = 0
      let totalSkipped = 0
      let totalPreservedOrphans = 0
      let totalPreservedConversations = 0
      let totalChangedConversations = 0
      let totalBranchesDetected = 0
      let totalUpdates = 0
      let totalSubtasksDetected = 0

      let lastSeenId: string | null = null
      let batchNumber = 0
      let hasMoreBatches = true

      // Process requests in batches
      while (hasMoreBatches) {
        batchNumber++

        // Calculate batch size respecting user's limit
        const remainingLimit = this.limit ? this.limit - totalProcessed : Number.MAX_SAFE_INTEGER
        const currentBatchSize = Math.min(BATCH_SIZE, remainingLimit)

        if (currentBatchSize <= 0) {
          break
        }

        // Step 1: Load batch of requests
        console.log(`\n[Batch ${batchNumber}] Loading requests...`)
        const requests = await this.loadRequests(lastSeenId, currentBatchSize)

        if (requests.length === 0) {
          hasMoreBatches = false
          break
        }

        console.log(`[Batch ${batchNumber}] Found ${requests.length} requests to process`)

        // Step 2: Process requests sequentially within this batch
        const updates: ConversationUpdate[] = []
        let processed = 0
        let skipped = 0
        let preservedOrphans = 0
        let preservedConversations = 0
        let changedConversations = 0
        let branchesDetected = 0
        let subtasksDetected = 0

        for (const request of requests) {
          if (!request.body?.messages || request.body.messages.length === 0) {
            skipped++
            continue
          }

          try {
            // Use ConversationLinker to determine conversation linkage
            const linkingResult = await this.conversationLinker.linkConversation({
              domain: request.domain,
              messages: request.body.messages,
              systemPrompt: request.body.system,
              requestId: request.request_id,
              messageCount: request.body.messages.length,
              timestamp: request.timestamp,
            })

            // Special handling for orphan requests (no parent)
            let conversationId: string
            if (!linkingResult.parentRequestId && request.conversation_id) {
              // Preserve existing conversation ID for orphan requests
              conversationId = request.conversation_id
              preservedOrphans++
              if (this.debugMode) {
                console.log(
                  `   Preserving conversation ID for orphan request ${request.request_id}`
                )
              }
            } else {
              // Use the linked conversation ID or generate a new one
              conversationId = linkingResult.conversationId || generateConversationId()
            }

            // Track if conversation ID is being preserved or changed
            if (request.conversation_id) {
              if (request.conversation_id === conversationId) {
                preservedConversations++
              } else {
                changedConversations++
              }
            }

            // Track branch detection
            if (
              linkingResult.branchId !== 'main' &&
              !linkingResult.branchId.startsWith('compact_')
            ) {
              branchesDetected++
              if (this.debugMode) {
                console.log(
                  `   Branch detected for request ${request.request_id}: ${linkingResult.branchId}`
                )
              }
            }

            // Single-message conversations are potential subtasks. The proxy service
            // performs the actual matching against Task tool invocations, but we mark
            // all single-message conversations as potential subtasks for consistency.
            const isSubtask = request.message_count === 1

            // Track subtask detection
            if (isSubtask) {
              subtasksDetected++
              if (this.debugMode) {
                console.log(
                  `   Subtask detected for request ${request.request_id}`
                )
              }
            }

            // Check if update is needed
            const needsUpdate =
              request.conversation_id !== conversationId ||
              request.branch_id !== linkingResult.branchId ||
              request.parent_request_id !== linkingResult.parentRequestId ||
              request.current_message_hash !== linkingResult.currentMessageHash ||
              request.parent_message_hash !== linkingResult.parentMessageHash ||
              request.system_hash !== linkingResult.systemHash ||
              request.is_subtask !== isSubtask

            if (needsUpdate) {
              updates.push({
                request_id: request.request_id,
                conversation_id: conversationId,
                branch_id: linkingResult.branchId,
                parent_request_id: linkingResult.parentRequestId,
                current_message_hash: linkingResult.currentMessageHash,
                parent_message_hash: linkingResult.parentMessageHash,
                system_hash: linkingResult.systemHash,
                is_subtask: isSubtask,
              })

              // Apply update immediately for visibility
              if (!this.dryRun) {
                await this.applySingleUpdate({
                  request_id: request.request_id,
                  conversation_id: conversationId,
                  branch_id: linkingResult.branchId,
                  parent_request_id: linkingResult.parentRequestId,
                  current_message_hash: linkingResult.currentMessageHash,
                  parent_message_hash: linkingResult.parentMessageHash,
                  system_hash: linkingResult.systemHash,
                  is_subtask: isSubtask,
                })
              }
            }

            processed++
            if (processed % 100 === 0) {
              console.log(
                `   [Batch ${batchNumber}] Processed ${processed}/${requests.length} requests...`
              )
            }
          } catch (error) {
            console.warn(`Failed to process request ${request.request_id}:`, error)
          }
        }

        // Batch complete - show batch statistics
        console.log(`[Batch ${batchNumber}] Complete:`)
        console.log(`   Processed: ${processed} requests`)
        if (skipped > 0) {
          console.log(`   Skipped: ${skipped} requests without messages`)
        }
        console.log(`   Updates needed: ${updates.length}`)
        if (branchesDetected > 0) {
          console.log(`   Branches detected: ${branchesDetected}`)
        }
        if (subtasksDetected > 0) {
          console.log(`   Subtasks detected: ${subtasksDetected}`)
        }

        // Accumulate totals
        totalProcessed += processed
        totalSkipped += skipped
        totalUpdates += updates.length
        totalPreservedOrphans += preservedOrphans
        totalPreservedConversations += preservedConversations
        totalChangedConversations += changedConversations
        totalBranchesDetected += branchesDetected
        totalSubtasksDetected += subtasksDetected

        // Update lastSeenId for next batch
        if (requests.length > 0) {
          lastSeenId = requests[requests.length - 1].request_id
        }

        // Check if we have more batches
        // Skip pagination when filtering by specific request IDs
        if (this.requestIds && this.requestIds.length > 0) {
          hasMoreBatches = false
        } else {
          hasMoreBatches =
            requests.length === currentBatchSize &&
            (this.limit === null || totalProcessed < this.limit)
        }

        // Clear request array to release references
        requests.length = 0

        // Memory tracking after batch
        const currentMemory = formatMemoryUsage()
        const heapDelta = (currentMemory.heapUsed - heapBaseline) / 1024 / 1024
        console.log(
          `   Memory: Heap ${currentMemory.heap} (Δ${heapDelta > 0 ? '+' : ''}${heapDelta.toFixed(1)}MB from baseline)`
        )

        // Warn if memory is growing significantly
        if (heapDelta > 200) {
          console.warn(`   ⚠️  WARNING: Heap has grown by ${heapDelta.toFixed(1)}MB since start`)
        }

        // Show overall progress
        if (this.limit) {
          console.log(
            `Overall progress: ${totalProcessed}/${this.limit} requests (${Math.round((totalProcessed / this.limit) * 100)}%)`
          )
        } else {
          console.log(`Overall progress: ${totalProcessed} requests processed`)
        }

        // Optional garbage collection between batches
        if (global.gc && process.argv.includes('--gc')) {
          const beforeGC = process.memoryUsage().heapUsed
          global.gc()
          const afterGC = process.memoryUsage().heapUsed
          const gcFreed = (beforeGC - afterGC) / 1024 / 1024
          if (this.debugMode) {
            console.log(`   GC freed ${gcFreed.toFixed(1)}MB`)
          }
        }
      }

      // Final summary
      console.log('\n=== Final Summary ===')
      console.log(`Total batches processed: ${batchNumber}`)
      console.log(`Total requests processed: ${totalProcessed}`)
      if (totalSkipped > 0) {
        console.log(`Total skipped: ${totalSkipped} requests without messages`)
      }
      console.log(`Total updates applied: ${totalUpdates}`)
      console.log(`Total branches detected: ${totalBranchesDetected}`)
      console.log(`Total subtasks detected: ${totalSubtasksDetected}`)
      console.log(`Total preserved conversation IDs: ${totalPreservedConversations}`)
      console.log(`Total changed conversation IDs: ${totalChangedConversations}`)
      if (totalPreservedOrphans > 0) {
        console.log(`Total preserved orphan conversation IDs: ${totalPreservedOrphans}`)
      }

      // Final memory statistics
      const finalMemory = formatMemoryUsage()
      const totalHeapDelta = (finalMemory.heapUsed - heapBaseline) / 1024 / 1024
      console.log(
        `\nFinal memory: Heap ${finalMemory.heap} (Δ${totalHeapDelta > 0 ? '+' : ''}${totalHeapDelta.toFixed(1)}MB from baseline)`
      )

      // Step 3: Show statistics
      await this.showStatistics()
    } catch (error) {
      console.error('Error during rebuild:', error)
      throw error
    } finally {
      await this.pool.end()
    }
  }

  private async loadRequests(
    lastSeenId: string | null = null,
    batchLimit: number = BATCH_SIZE
  ): Promise<DbRequest[]> {
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
        r.body,
        r.message_count,
        r.parent_request_id,
        r.created_at,
        r.is_subtask
      FROM api_requests r
      WHERE r.request_type = 'inference'
    `
    const params: any[] = []

    // Filter by specific request IDs if provided
    if (this.requestIds && this.requestIds.length > 0) {
      params.push(this.requestIds)
      query += ` AND r.request_id = ANY($${params.length}::uuid[])`
    }

    if (this.domainFilter) {
      params.push(this.domainFilter)
      query += ` AND r.domain = $${params.length}`
    }

    // Key-set pagination for better performance (skip if filtering by request IDs)
    if (lastSeenId && (!this.requestIds || this.requestIds.length === 0)) {
      params.push(lastSeenId)
      query += ` AND (r.timestamp, r.request_id) > (
        SELECT timestamp, request_id FROM api_requests WHERE request_id = $${params.length}::uuid
      )`
    }

    query += ' ORDER BY r.timestamp ASC, r.request_id ASC'

    // Skip limit if filtering by specific request IDs
    if (!this.requestIds || this.requestIds.length === 0) {
      query += ` LIMIT ${batchLimit}`
    }

    const result = await this.pool.query(query, params)
    return result.rows
  }

  private async applySingleUpdate(update: ConversationUpdate) {
    const query = `
      UPDATE api_requests
      SET 
        conversation_id = $2::uuid,
        branch_id = $3,
        parent_request_id = $4::uuid,
        current_message_hash = $5,
        parent_message_hash = $6,
        system_hash = $7,
        is_subtask = $8
      WHERE request_id = $1::uuid
    `

    await this.pool.query(query, [
      update.request_id,
      update.conversation_id,
      update.branch_id,
      update.parent_request_id,
      update.current_message_hash,
      update.parent_message_hash,
      update.system_hash,
      update.is_subtask,
    ])
  }

  private async showStatistics() {
    console.log('\n3. Final statistics:')

    let query = `
      SELECT 
        COUNT(DISTINCT conversation_id) as total_conversations,
        COUNT(DISTINCT branch_id) as total_branches,
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE branch_id != 'main') as branched_requests,
        COUNT(*) FILTER (WHERE parent_request_id IS NOT NULL) as linked_requests,
        COUNT(*) FILTER (WHERE is_subtask = true) as subtask_requests
      FROM api_requests
      WHERE conversation_id IS NOT NULL
    `
    const params: any[] = []

    if (this.domainFilter) {
      params.push(this.domainFilter)
      query += ` AND domain = $${params.length}`
    }

    const stats = await this.pool.query(query, params)
    const row = stats.rows[0]

    if (this.domainFilter) {
      console.log(`   (Statistics for domain: ${this.domainFilter})`)
    }

    console.log(`   Total conversations: ${row.total_conversations}`)
    console.log(`   Total branches: ${row.total_branches}`)
    console.log(`   Total requests with conversations: ${row.total_requests}`)
    console.log(`   Requests on non-main branches: ${row.branched_requests}`)
    console.log(`   Requests with parent links: ${row.linked_requests}`)
    console.log(`   Subtask requests: ${row.subtask_requests}`)
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  const domainIndex = args.findIndex(arg => arg === '--domain')
  const limitIndex = args.findIndex(arg => arg === '--limit')
  const requestsIndex = args.findIndex(arg => arg === '--requests')

  // Parse request IDs
  let requestIds: string[] | null = null
  if (requestsIndex !== -1 && args[requestsIndex + 1]) {
    requestIds = args[requestsIndex + 1].split(',').map(id => id.trim())
  }

  return {
    dryRun: args.includes('--dry-run'),
    domain: domainIndex !== -1 && args[domainIndex + 1] ? args[domainIndex + 1] : null,
    limit: limitIndex !== -1 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1], 10) : null,
    requestIds,
    debug: args.includes('--debug'),
    gc: args.includes('--gc'),
    help: args.includes('--help') || args.includes('-h'),
    yes: args.includes('--yes') || args.includes('-y'),
  }
}

// Main execution
async function main() {
  const { dryRun, domain, limit, requestIds, debug, gc, help, yes } = parseArgs()

  if (help) {
    console.log(`
Usage: bun run scripts/db/rebuild-conversations.ts [options]

This version uses the ConversationLinker class for all linking logic.
Processes requests in batches of ${BATCH_SIZE} to optimize memory usage.

Options:
  --dry-run    Run in dry-run mode (no database changes)
  --domain     Filter by specific domain
  --limit      Limit the number of requests to process
  --requests   Process specific request IDs (comma-separated)
  --debug      Show detailed debug information
  --gc         Enable manual garbage collection between batches (requires: node --expose-gc)
  --yes, -y    Automatically accept the warning prompt
  --help, -h   Show this help message

Memory Management:
  The script monitors memory usage and warns if heap grows beyond 200MB from baseline.
  Use --gc flag with node --expose-gc for aggressive memory cleanup between batches.

Examples:
  # Rebuild all conversations
  bun run scripts/db/rebuild-conversations.ts

  # Dry run for a specific domain
  bun run scripts/db/rebuild-conversations.ts --dry-run --domain example.com

  # Process specific request IDs
  bun run scripts/db/rebuild-conversations.ts --requests "id1,id2,id3"

  # Process with garbage collection
  node --expose-gc $(which bun) run scripts/db/rebuild-conversations.ts --gc

  # Process first 100 requests with debug info
  bun run scripts/db/rebuild-conversations.ts --limit 100 --debug

  # Skip warning prompt for automated scripts
  bun run scripts/db/rebuild-conversations.ts --yes
`)
    process.exit(0)
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required')
    process.exit(1)
  }

  console.log('===========================================')
  console.log('Conversation Rebuild Script V2')
  console.log('===========================================')
  console.log('This version uses ConversationLinker for all linking logic')
  console.log('')

  if (dryRun) {
    console.log('🔍 Running in DRY RUN mode - no changes will be made')
  } else {
    console.log('⚠️  WARNING: This will update existing records in the database')
    console.log('It is recommended to backup your database before proceeding')
  }

  if (domain) {
    console.log(`🌐 Filtering by domain: ${domain}`)
  }

  if (limit) {
    console.log(`📊 Limiting to ${limit} requests`)
  }

  if (requestIds && requestIds.length > 0) {
    console.log(`🎯 Processing specific requests: ${requestIds.join(', ')}`)
  }

  if (debug) {
    console.log('🐛 Debug mode enabled')
  }

  if (gc) {
    if (global.gc) {
      console.log('♻️  Garbage collection enabled')
    } else {
      console.warn('⚠️  --gc flag provided but global.gc not available. Run with: node --expose-gc')
    }
  }

  if (yes && !dryRun) {
    console.log('✅ Auto-accepting warning prompt (--yes flag provided)')
  }

  // Extract and display database name
  const dbName = ConversationRebuilderV2.extractDatabaseName(databaseUrl)
  if (dbName) {
    console.log(`🗄️  Database: ${dbName}`)
  }

  console.log('')

  if (!dryRun && !yes) {
    const response = prompt('Do you want to continue? (yes/no): ')
    if (response?.toLowerCase() !== 'yes') {
      console.log('Operation cancelled.')
      process.exit(0)
    }
  }

  const rebuilder = new ConversationRebuilderV2(
    databaseUrl,
    dryRun,
    domain,
    limit,
    debug,
    requestIds
  )

  try {
    await rebuilder.rebuild()
    console.log('\n✅ Rebuild completed successfully!')
  } catch (error) {
    console.error('\n❌ Rebuild failed:', error)
    process.exit(1)
  }
}

// Run the script
main()
