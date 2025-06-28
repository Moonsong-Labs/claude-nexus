#!/usr/bin/env bun
/**
 * Script to retroactively compute conversation IDs and branches from existing requests
 * This version processes requests in batches to avoid loading all data into memory at once
 *
 * Key improvements:
 * - Processes requests in configurable batch sizes (default 10,000)
 * - Maintains a sliding window of request data for parent-child linking
 * - Memory-efficient for large databases
 */

import { Pool } from 'pg'
import { randomUUID } from 'crypto'
import { config } from 'dotenv'
import { extractMessageHashes } from '../../packages/shared/src/utils/conversation-hash'

// Load environment variables
config()

interface Request {
  request_id: string
  domain: string
  timestamp: Date
  current_message_hash: string | null
  parent_message_hash: string | null
  system_hash: string | null
  conversation_id: string | null
  branch_id: string | null
  body: any
  request_type: string | null
  message_count: number | null
  response_body?: any
}

interface ConversationNode {
  request_id: string
  timestamp: Date
  parent_message_hash: string | null
  current_message_hash: string | null
  system_hash?: string | null
  conversation_id?: string
  branch_id?: string
  message_count?: number | null
  children: ConversationNode[]
}

interface ConversationContext {
  conversationId: string
  branchId: string
  lastMessageHash: string
}

class BatchedConversationRebuilder {
  private pool: Pool
  private dryRun: boolean
  private onlyOrphanConversations: boolean
  private domainFilter: string | null
  private limit: number | null
  private debugConversationChanges: boolean
  private batchSize: number

  // Memory-efficient data structures
  private hashToContext: Map<string, ConversationContext> = new Map()
  private pendingUpdates: Array<any> = []
  private totalProcessed = 0
  private totalUpdated = 0
  private conversationStats = {
    preserved: new Set<string>(),
    changed: new Set<string>(),
    created: new Set<string>(),
  }
  // Track conversation request counts for verification
  private originalConversationCounts: Map<string, number> = new Map()
  private newConversationCounts: Map<string, number> = new Map()

  constructor(
    databaseUrl: string,
    dryRun: boolean = false,
    onlyOrphanConversations: boolean = false,
    domainFilter: string | null = null,
    limit: number | null = null,
    debugConversationChanges: boolean = false,
    batchSize: number = 10000
  ) {
    this.pool = new Pool({ connectionString: databaseUrl })
    this.dryRun = dryRun
    this.onlyOrphanConversations = onlyOrphanConversations
    this.domainFilter = domainFilter
    this.limit = limit
    this.debugConversationChanges = debugConversationChanges
    this.batchSize = batchSize
  }

  async rebuild() {
    console.log('Starting batched conversation rebuild...')
    console.log(`Processing requests in batches of ${this.batchSize}`)

    try {
      // Step 0: Capture original conversation counts for verification
      console.log('\n0. Capturing original conversation request counts...')
      await this.captureOriginalConversationCounts()

      // Step 1: Get total count
      const totalCount = await this.getTotalRequestCount()
      const effectiveLimit = this.limit ? Math.min(this.limit, totalCount) : totalCount
      console.log(`\n1. Total requests to process: ${effectiveLimit}`)

      // Step 2: Process in batches
      console.log('\n2. Processing requests in batches...')
      let offset = 0
      let batchNumber = 1

      while (offset < effectiveLimit) {
        const currentBatchSize = Math.min(this.batchSize, effectiveLimit - offset)
        console.log(
          `\n   Batch ${batchNumber}: Processing ${currentBatchSize} requests (offset: ${offset})`
        )

        await this.processBatch(offset, currentBatchSize)

        // Flush pending updates periodically
        if (this.pendingUpdates.length >= this.batchSize) {
          await this.flushUpdates()
        }

        offset += currentBatchSize
        batchNumber++
      }

      // Step 3: Flush remaining updates
      if (this.pendingUpdates.length > 0) {
        console.log('\n3. Flushing remaining updates...')
        await this.flushUpdates()
      }

      // Step 4: Verify conversation integrity
      console.log('\n4. Verifying conversation integrity...')
      await this.verifyConversationIntegrity()

      // Step 5: Show statistics
      console.log('\n5. Final statistics:')
      console.log(`   Total requests processed: ${this.totalProcessed}`)
      console.log(`   Total requests updated: ${this.totalUpdated}`)
      console.log(`   Preserved conversations: ${this.conversationStats.preserved.size}`)
      console.log(`   Changed conversations: ${this.conversationStats.changed.size}`)
      console.log(`   New conversations: ${this.conversationStats.created.size}`)

      await this.showDatabaseStatistics()
    } catch (error) {
      console.error('Error during rebuild:', error)
      throw error
    } finally {
      await this.pool.end()
    }
  }

  private async captureOriginalConversationCounts() {
    let query = `
      SELECT conversation_id, COUNT(*) as request_count
      FROM api_requests
      WHERE request_type IN ('inference')
        AND conversation_id IS NOT NULL
    `
    const queryParams: any[] = []

    if (this.domainFilter) {
      queryParams.push(this.domainFilter)
      query += ` AND domain = $${queryParams.length}`
    }

    query += ' GROUP BY conversation_id'

    const result = await this.pool.query(query, queryParams)

    // Store the counts
    for (const row of result.rows) {
      this.originalConversationCounts.set(row.conversation_id, parseInt(row.request_count))
    }

    console.log(
      `   Captured request counts for ${this.originalConversationCounts.size} existing conversations`
    )
  }

  private async getTotalRequestCount(): Promise<number> {
    let query = `
      SELECT COUNT(*) as count
      FROM api_requests
      WHERE request_type IN ('inference')
    `
    const queryParams: any[] = []

    if (this.domainFilter) {
      queryParams.push(this.domainFilter)
      query += ` AND domain = $${queryParams.length}`
    }

    if (this.onlyOrphanConversations) {
      // Count only orphan conversations
      let orphanSubquery = `
        SELECT DISTINCT conversation_id 
        FROM api_requests 
        WHERE request_type IN ('inference')
          AND conversation_id IS NOT NULL
          AND (message_count = 1 OR (message_count IS NULL AND jsonb_array_length(body->'messages') = 1))
      `

      if (this.domainFilter) {
        orphanSubquery += ` AND domain = '${this.domainFilter}'`
      }

      query += `
        AND (conversation_id IS NULL OR conversation_id NOT IN (${orphanSubquery}))
      `
    }

    const result = await this.pool.query(query, queryParams)
    return parseInt(result.rows[0].count)
  }

  private async processBatch(offset: number, batchSize: number) {
    // Load batch of requests
    const requests = await this.loadRequestBatch(offset, batchSize)
    console.log(`      Loaded ${requests.length} requests`)

    // Process each request
    let hashesComputed = 0
    let messageCountsComputed = 0

    for (const request of requests) {
      this.totalProcessed++

      // Compute missing hashes
      if (!request.current_message_hash && request.body?.messages) {
        try {
          const { currentMessageHash, parentMessageHash, systemHash } = extractMessageHashes(
            request.body.messages,
            request.body.system
          )
          request.current_message_hash = currentMessageHash
          request.parent_message_hash = parentMessageHash
          request.system_hash = systemHash
          hashesComputed++
        } catch (error) {
          console.warn(`Failed to compute hashes for request ${request.request_id}:`, error)
        }
      }

      // Compute message count if missing
      if (
        request.message_count === null &&
        request.body?.messages &&
        Array.isArray(request.body.messages)
      ) {
        request.message_count = request.body.messages.length
        messageCountsComputed++
      }

      // Process the request
      await this.processRequest(request)
    }

    if (hashesComputed > 0) {
      console.log(`      Computed hashes for ${hashesComputed} requests`)
    }
    if (messageCountsComputed > 0) {
      console.log(`      Computed message counts for ${messageCountsComputed} requests`)
    }
  }

  private async loadRequestBatch(offset: number, batchSize: number): Promise<Request[]> {
    let query = `
      SELECT 
        request_id,
        domain,
        timestamp,
        current_message_hash,
        parent_message_hash,
        system_hash,
        conversation_id,
        branch_id,
        body,
        response_body,
        request_type,
        message_count
      FROM api_requests
      WHERE request_type IN ('inference')
    `
    const queryParams: any[] = []

    if (this.domainFilter) {
      queryParams.push(this.domainFilter)
      query += ` AND domain = $${queryParams.length}`
    }

    if (this.onlyOrphanConversations) {
      let orphanSubquery = `
        SELECT DISTINCT conversation_id 
        FROM api_requests 
        WHERE request_type IN ('inference')
          AND conversation_id IS NOT NULL
          AND (message_count = 1 OR (message_count IS NULL AND jsonb_array_length(body->'messages') = 1))
      `

      if (this.domainFilter) {
        orphanSubquery += ` AND domain = '${this.domainFilter}'`
      }

      query += `
        AND (conversation_id IS NULL OR conversation_id NOT IN (${orphanSubquery}))
      `
    }

    query += ' ORDER BY timestamp ASC'
    query += ` LIMIT ${batchSize} OFFSET ${offset}`

    const result = await this.pool.query(query, queryParams)
    return result.rows
  }

  private async processRequest(request: Request) {
    if (!request.current_message_hash) {
      return // Skip requests without hashes
    }

    // Check for special linking cases
    const specialLinking = this.detectSpecialLinking(request)

    let conversationId: string
    let branchId: string = 'main'
    let needsUpdate = false

    // Handle continuation requests
    if (specialLinking.isContinuation && specialLinking.continuationTarget) {
      const sourceContext = await this.findContinuationContext(
        specialLinking.continuationTarget,
        request.timestamp,
        request.domain
      )

      if (sourceContext) {
        conversationId = sourceContext.conversationId
        branchId = `compact_${new Date(request.timestamp)
          .toISOString()
          .replace(/[^0-9]/g, '')
          .substring(8, 14)}`
        needsUpdate = true

        console.log(
          `      Linked continuation request ${request.request_id} to conversation ${conversationId}`
        )
      } else {
        // Create new conversation for unlinked continuation
        conversationId = request.conversation_id || randomUUID()
        needsUpdate = !request.conversation_id || request.branch_id !== branchId
      }
    }
    // Handle summarization requests
    else if (specialLinking.isSummarization && request.parent_message_hash) {
      const parentContext = this.hashToContext.get(request.parent_message_hash)

      if (parentContext) {
        conversationId = parentContext.conversationId
        branchId = parentContext.branchId
        needsUpdate = request.conversation_id !== conversationId || request.branch_id !== branchId

        console.log(
          `      Linked summarization request ${request.request_id} to conversation ${conversationId}`
        )
      } else {
        // Parent not in current window, check database
        const dbParentContext = await this.findParentInDatabase(
          request.parent_message_hash,
          request
        )
        if (dbParentContext) {
          conversationId = dbParentContext.conversationId
          branchId = dbParentContext.branchId
          needsUpdate = request.conversation_id !== conversationId || request.branch_id !== branchId
        } else {
          conversationId = request.conversation_id || randomUUID()
          needsUpdate = !request.conversation_id || request.branch_id !== branchId
        }
      }
    }
    // Normal parent-child linking
    else if (request.parent_message_hash) {
      const parentContext = this.hashToContext.get(request.parent_message_hash)

      if (parentContext) {
        conversationId = parentContext.conversationId

        // Check if this creates a branch point
        const existingChildren = await this.countExistingChildren(request.parent_message_hash)
        if (existingChildren > 0) {
          branchId = `branch_${new Date(request.timestamp).getTime()}`
        } else {
          branchId = parentContext.branchId
        }

        needsUpdate = request.conversation_id !== conversationId || request.branch_id !== branchId
      } else {
        // Parent not in current window, check database
        const dbParentContext = await this.findParentInDatabase(
          request.parent_message_hash,
          request
        )
        if (dbParentContext) {
          conversationId = dbParentContext.conversationId

          // Check for branching
          const existingChildren = await this.countExistingChildren(request.parent_message_hash)
          if (existingChildren > 0) {
            branchId = `branch_${new Date(request.timestamp).getTime()}`
          } else {
            branchId = dbParentContext.branchId
          }

          needsUpdate = request.conversation_id !== conversationId || request.branch_id !== branchId
        } else {
          // No parent found, start new conversation
          conversationId = request.conversation_id || randomUUID()
          needsUpdate = !request.conversation_id || request.branch_id !== branchId
        }
      }
    } else {
      // No parent, this is a conversation root
      conversationId = request.conversation_id || randomUUID()
      needsUpdate = !request.conversation_id || request.branch_id !== branchId
    }

    // Track statistics
    if (needsUpdate) {
      if (!request.conversation_id) {
        this.conversationStats.created.add(conversationId)
      } else if (request.conversation_id !== conversationId) {
        this.conversationStats.changed.add(request.conversation_id)
      }
    } else if (request.conversation_id) {
      this.conversationStats.preserved.add(request.conversation_id)
    }

    // Store context for future requests
    this.hashToContext.set(request.current_message_hash, {
      conversationId,
      branchId,
      lastMessageHash: request.current_message_hash,
    })

    // Track new conversation counts
    this.newConversationCounts.set(
      conversationId,
      (this.newConversationCounts.get(conversationId) || 0) + 1
    )

    // Add update if needed
    if (needsUpdate) {
      this.pendingUpdates.push({
        request_id: request.request_id,
        conversation_id: conversationId,
        branch_id: branchId,
        current_message_hash: request.current_message_hash,
        parent_message_hash: request.parent_message_hash,
        system_hash: request.system_hash,
        message_count: request.message_count,
        // For debugging
        old_conversation_id: request.conversation_id,
        old_branch_id: request.branch_id,
        timestamp: request.timestamp,
        domain: request.domain,
      })
    }

    // Maintain sliding window of contexts (keep last 50k hashes)
    if (this.hashToContext.size > 50000) {
      // Remove oldest entries
      const entriesToRemove = this.hashToContext.size - 50000
      const iterator = this.hashToContext.keys()
      for (let i = 0; i < entriesToRemove; i++) {
        const key = iterator.next().value
        if (key) {
          this.hashToContext.delete(key)
        }
      }
    }
  }

  private async findParentInDatabase(
    parentHash: string,
    childRequest: Request
  ): Promise<ConversationContext | null> {
    const query = `
      SELECT conversation_id, branch_id, current_message_hash
      FROM api_requests
      WHERE current_message_hash = $1
        AND domain = $2
        AND timestamp < $3
      ORDER BY timestamp DESC
      LIMIT 1
    `

    const result = await this.pool.query(query, [
      parentHash,
      childRequest.domain,
      childRequest.timestamp,
    ])

    if (result.rows.length > 0) {
      const parent = result.rows[0]
      return {
        conversationId: parent.conversation_id,
        branchId: parent.branch_id,
        lastMessageHash: parent.current_message_hash,
      }
    }

    return null
  }

  private async countExistingChildren(parentHash: string): Promise<number> {
    const query = `
      SELECT COUNT(*) as count
      FROM api_requests
      WHERE parent_message_hash = $1
    `

    const result = await this.pool.query(query, [parentHash])
    return parseInt(result.rows[0].count)
  }

  private async findContinuationContext(
    targetText: string,
    beforeTimestamp: Date,
    domain: string
  ): Promise<ConversationContext | null> {
    // Clean up the target text for better matching
    const cleanTarget = targetText
      .replace(/^(Analysis|Summary):\s*/i, '')
      .trim()
      .substring(0, 200)

    const query = `
      SELECT request_id, conversation_id, branch_id, current_message_hash
      FROM api_requests
      WHERE request_type = 'inference'
        AND domain = $1
        AND timestamp < $2
        AND response_body IS NOT NULL
        AND (
          response_body::text LIKE $3
          OR response_body::text LIKE $4
        )
      ORDER BY timestamp DESC
      LIMIT 10
    `

    const result = await this.pool.query(query, [
      domain,
      beforeTimestamp,
      '%' + cleanTarget.substring(0, 50) + '%',
      '%' + cleanTarget.replace(/\s+/g, '%') + '%',
    ])

    // Check each candidate for a good match
    for (const row of result.rows) {
      // Simplified check - in production you'd parse response_body properly
      return {
        conversationId: row.conversation_id,
        branchId: row.branch_id,
        lastMessageHash: row.current_message_hash,
      }
    }

    return null
  }

  private detectSpecialLinking(request: Request): {
    isSummarization: boolean
    isContinuation: boolean
    continuationTarget?: string
  } {
    let isSummarization = false
    let isContinuation = false
    let continuationTarget: string | undefined

    // Check for summarization system prompt
    if (request.body?.system) {
      const systemContent =
        typeof request.body.system === 'string'
          ? request.body.system
          : request.body.system.map((item: any) => item.text || '').join(' ')

      if (
        systemContent.includes(
          'You are a helpful AI assistant tasked with summarizing conversations'
        )
      ) {
        isSummarization = true
      }
    }

    // Check for continuation message
    if (request.body?.messages?.[0]) {
      const firstMessage = request.body.messages[0]
      if (firstMessage.role === 'user' && firstMessage.content) {
        let messageContent = ''

        if (typeof firstMessage.content === 'string') {
          messageContent = firstMessage.content
        } else if (Array.isArray(firstMessage.content)) {
          for (const item of firstMessage.content) {
            if (item.type === 'text' && item.text) {
              messageContent += item.text + ' '
            }
          }
        }

        // Check for continuation pattern
        const continuationMatch = messageContent.match(
          /This session is being continued from a previous conversation that ran out of context.*?The conversation is summarized below:\s*(.+?)\s*(?:Please continue|Summary:|Analysis:|$)/s
        )

        if (continuationMatch) {
          isContinuation = true
          continuationTarget = continuationMatch[1].trim()
        }
      }
    }

    return { isSummarization, isContinuation, continuationTarget }
  }

  private async flushUpdates() {
    if (this.pendingUpdates.length === 0) return

    console.log(`   Flushing ${this.pendingUpdates.length} updates to database...`)

    if (this.dryRun) {
      console.log('   🔍 DRY RUN MODE - Showing what would be updated:')

      // Show sample updates
      console.log('   Sample of changes (first 5):')
      this.pendingUpdates.slice(0, 5).forEach(update => {
        console.log(`     Request ${update.request_id}:`)
        console.log(
          `       - conversation_id: ${update.conversation_id} ${update.old_conversation_id ? `(was: ${update.old_conversation_id})` : '(new)'}`
        )
        console.log(`       - branch_id: ${update.branch_id}`)
      })

      if (this.pendingUpdates.length > 5) {
        console.log(`     ... and ${this.pendingUpdates.length - 5} more updates`)
      }
    } else {
      // Debug logging if enabled
      if (this.debugConversationChanges) {
        console.log('   🔍 DEBUG: Conversation ID changes in this batch:')
        let changeCount = 0

        this.pendingUpdates.forEach(update => {
          if (update.old_conversation_id && update.old_conversation_id !== update.conversation_id) {
            changeCount++
            console.log(`     [${changeCount}] Request ${update.request_id}:`)
            console.log(`       - Old conversation_id: ${update.old_conversation_id}`)
            console.log(`       - New conversation_id: ${update.conversation_id}`)
            console.log(`       - Branch: ${update.branch_id}`)
            console.log(`       - Timestamp: ${update.timestamp}`)
            console.log(`       - Domain: ${update.domain}`)
          }
        })

        if (changeCount === 0) {
          console.log('     No conversation ID changes in this batch')
        }
      }

      // Perform actual database update
      const client = await this.pool.connect()

      try {
        await client.query('BEGIN')

        // Build batch update query
        const updates = this.pendingUpdates
        const caseConversationId = updates
          .map(u => `WHEN '${u.request_id}' THEN '${u.conversation_id}'::uuid`)
          .join(' ')

        const caseBranchId = updates
          .map(u => `WHEN '${u.request_id}' THEN '${u.branch_id}'`)
          .join(' ')

        const caseCurrentHash = updates
          .map(u => `WHEN '${u.request_id}' THEN '${u.current_message_hash}'`)
          .join(' ')

        const caseParentHash = updates
          .map(
            u =>
              `WHEN '${u.request_id}' THEN ${u.parent_message_hash ? `'${u.parent_message_hash}'` : 'NULL'}`
          )
          .join(' ')

        const caseSystemHash = updates
          .map(u => `WHEN '${u.request_id}' THEN ${u.system_hash ? `'${u.system_hash}'` : 'NULL'}`)
          .join(' ')

        const caseMessageCount = updates
          .map(u => `WHEN '${u.request_id}' THEN ${u.message_count || 'NULL'}`)
          .join(' ')

        const requestIds = updates.map(u => `'${u.request_id}'`).join(',')

        const query = `
          UPDATE api_requests
          SET 
            conversation_id = CASE request_id ${caseConversationId} END,
            branch_id = CASE request_id ${caseBranchId} END,
            current_message_hash = CASE request_id ${caseCurrentHash} END,
            parent_message_hash = CASE request_id ${caseParentHash} END,
            system_hash = CASE request_id ${caseSystemHash} END,
            message_count = CASE request_id ${caseMessageCount} END
          WHERE request_id IN (${requestIds})
        `

        await client.query(query)
        await client.query('COMMIT')

        this.totalUpdated += this.pendingUpdates.length
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    }

    // Clear pending updates
    this.pendingUpdates = []
  }

  private async showDatabaseStatistics() {
    console.log('\n   Database statistics:')

    if (this.dryRun) {
      console.log('   (Statistics show current database state, not dry-run changes)')
    }

    let statsQuery = `
      SELECT 
        COUNT(DISTINCT conversation_id) as total_conversations,
        COUNT(DISTINCT branch_id) as total_branches,
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE branch_id != 'main') as branched_requests
      FROM api_requests
      WHERE conversation_id IS NOT NULL
    `
    const statsParams: any[] = []

    if (this.domainFilter) {
      statsParams.push(this.domainFilter)
      statsQuery += ` AND domain = $${statsParams.length}`
    }

    const stats = await this.pool.query(statsQuery, statsParams)

    console.log(`   Total conversations: ${stats.rows[0].total_conversations}`)
    console.log(`   Total branches: ${stats.rows[0].total_branches}`)
    console.log(`   Total requests with conversations: ${stats.rows[0].total_requests}`)
    console.log(`   Requests on non-main branches: ${stats.rows[0].branched_requests}`)
  }

  private async verifyConversationIntegrity() {
    const warnings: string[] = []
    let conversationsWithFewerRequests = 0
    let conversationsWithMoreRequests = 0
    let conversationsUnchanged = 0

    // Check all conversations that existed before
    for (const [convId, originalCount] of this.originalConversationCounts) {
      const newCount = this.newConversationCounts.get(convId) || 0

      if (newCount < originalCount) {
        conversationsWithFewerRequests++
        warnings.push(
          `   ⚠️  Conversation ${convId}: ${originalCount} → ${newCount} requests (lost ${originalCount - newCount})`
        )
      } else if (newCount > originalCount) {
        conversationsWithMoreRequests++
      } else {
        conversationsUnchanged++
      }
    }

    // Check for new conversations that might have stolen requests
    const newConversations = [...this.newConversationCounts.keys()].filter(
      convId => !this.originalConversationCounts.has(convId)
    )

    console.log('\n   Conversation integrity check:')
    console.log(`   - Conversations unchanged: ${conversationsUnchanged}`)
    console.log(`   - Conversations with more requests: ${conversationsWithMoreRequests}`)
    console.log(`   - Conversations with fewer requests: ${conversationsWithFewerRequests}`)
    console.log(`   - New conversations created: ${newConversations.length}`)

    if (warnings.length > 0) {
      console.log('\n   ⚠️  WARNING: Some conversations lost requests!')
      console.log('   This may indicate an issue with the rebuild logic.')
      console.log('   Affected conversations (showing first 10):')
      warnings.slice(0, 10).forEach(warning => console.log(warning))
      if (warnings.length > 10) {
        console.log(`   ... and ${warnings.length - 10} more`)
      }

      if (!this.dryRun) {
        console.log('\n   ⚠️  These changes have been applied to the database!')
        console.log('   Consider reviewing the rebuild logic or restoring from backup.')
      }
    } else {
      console.log('\n   ✅ All conversations maintained or gained requests - integrity verified!')
    }
  }
}

// Parse command line arguments
function parseArgs(): {
  dryRun: boolean
  onlyOrphanConversations: boolean
  domain: string | null
  limit: number | null
  debugConversationChanges: boolean
  batchSize: number
  help: boolean
} {
  const args = process.argv.slice(2)
  const domainIndex = args.findIndex(arg => arg === '--domain')
  const domain = domainIndex !== -1 && args[domainIndex + 1] ? args[domainIndex + 1] : null

  const limitIndex = args.findIndex(arg => arg === '--limit')
  const limit =
    limitIndex !== -1 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1], 10) : null

  const batchSizeIndex = args.findIndex(arg => arg === '--batch-size')
  const batchSize =
    batchSizeIndex !== -1 && args[batchSizeIndex + 1]
      ? parseInt(args[batchSizeIndex + 1], 10)
      : 10000

  return {
    dryRun: args.includes('--dry-run'),
    onlyOrphanConversations: args.includes('--only-orphan-conversations'),
    domain,
    limit: limit && !isNaN(limit) ? limit : null,
    debugConversationChanges: args.includes('--debug-conversation-changes'),
    batchSize: batchSize && !isNaN(batchSize) ? batchSize : 10000,
    help: args.includes('--help') || args.includes('-h'),
  }
}

// Display help message
function showHelp() {
  console.log(`
Usage: bun run scripts/db/rebuild-conversations-batched.ts [options]

Options:
  --dry-run                   Run in dry-run mode (no database changes)
  --only-orphan-conversations Only process orphan conversations
  --domain <domain>           Filter by specific domain
  --limit <number>            Limit the number of requests to process
  --batch-size <number>       Number of requests to process per batch (default: 10000)
  --debug-conversation-changes Debug log all conversation ID changes
  --help, -h                  Show this help message

Examples:
  # Rebuild all conversations with default batch size
  bun run scripts/db/rebuild-conversations-batched.ts

  # Process with custom batch size
  bun run scripts/db/rebuild-conversations-batched.ts --batch-size 5000

  # Dry run for a specific domain with debugging
  bun run scripts/db/rebuild-conversations-batched.ts --dry-run --domain example.com --debug-conversation-changes

  # Process limited requests in small batches
  bun run scripts/db/rebuild-conversations-batched.ts --limit 100000 --batch-size 1000
`)
}

// Main execution
async function main() {
  const {
    dryRun,
    onlyOrphanConversations,
    domain,
    limit,
    debugConversationChanges,
    batchSize,
    help,
  } = parseArgs()

  if (help) {
    showHelp()
    process.exit(0)
  }

  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required')
    process.exit(1)
  }

  console.log('===========================================')
  console.log('Batched Conversation Rebuild Script')
  console.log('===========================================')
  console.log('This script will retroactively compute conversation IDs and branches')
  console.log('from existing requests in the database based on message hashes.')
  console.log('Requests are processed in batches to minimize memory usage.')
  console.log('')

  if (dryRun) {
    console.log('🔍 Running in DRY RUN mode - no changes will be made to the database')
  } else {
    console.log('WARNING: This will update existing records in the database.')
    console.log('It is recommended to backup your database before proceeding.')
  }

  if (onlyOrphanConversations) {
    console.log(
      '🎯 Only processing orphan conversations (conversations without any single-message requests)'
    )
  }

  if (domain) {
    console.log(`🌐 Filtering by domain: ${domain}`)
  }

  if (limit) {
    console.log(`📊 Limiting to ${limit} requests`)
  }

  console.log(`📦 Batch size: ${batchSize} requests per batch`)

  if (debugConversationChanges) {
    console.log(`🐛 Debug mode: Will log all conversation ID changes`)
  }

  console.log('')

  // Add a confirmation prompt unless in dry run mode
  if (!dryRun) {
    const response = prompt('Do you want to continue? (yes/no): ')

    if (response?.toLowerCase() !== 'yes') {
      console.log('Operation cancelled.')
      process.exit(0)
    }
  }

  const rebuilder = new BatchedConversationRebuilder(
    databaseUrl,
    dryRun,
    onlyOrphanConversations,
    domain,
    limit,
    debugConversationChanges,
    batchSize
  )

  try {
    await rebuilder.rebuild()
    if (dryRun) {
      console.log('\n✅ Dry run completed successfully! No changes were made.')
    } else {
      console.log('\n✅ Conversation rebuild completed successfully!')
    }
  } catch (error) {
    console.error('\n❌ Conversation rebuild failed:', error)
    process.exit(1)
  }
}

// Run the script
main()
