#!/usr/bin/env bun
/**
 * Script to retroactively compute conversation IDs and branches from existing requests
 * This uses the conversation-linker library to analyze message hashes and rebuild conversation relationships
 */

import { Pool, PoolClient } from 'pg'
import { randomUUID } from 'crypto'
import { config } from 'dotenv'
import {
  ConversationLinker,
  type LinkingRequest,
  type ParentQueryCriteria,
  type QueryExecutor,
  type CompactSearchExecutor,
} from '../../packages/shared/src/utils/conversation-linker.js'

// Load environment variables
config()

interface Request {
  request_id: string
  domain: string
  timestamp: Date
  body: any
  response_body?: any
  request_type: string | null
  conversation_id: string | null
  branch_id: string | null
  current_message_hash: string | null
  parent_message_hash: string | null
  system_hash: string | null
  message_count: number | null
}

interface DatabaseUpdate {
  request_id: string
  conversation_id: string
  branch_id: string
  current_message_hash: string
  parent_message_hash: string | null
  system_hash: string | null
  parent_request_id: string | null
}

class ConversationRebuilder {
  private pool: Pool
  private linker: ConversationLinker
  private dryRun: boolean
  private batchSize: number
  private domainFilter: string | null
  private limit: number | null
  private debugChanges: boolean
  // Stats
  private totalProcessed = 0
  private conversationsCreated = 0
  private conversationsPreserved = 0
  private conversationsChanged = 0

  constructor(
    databaseUrl: string,
    dryRun: boolean = false,
    batchSize: number = 1000,
    domainFilter: string | null = null,
    limit: number | null = null,
    debugChanges: boolean = false
  ) {
    this.pool = new Pool({ connectionString: databaseUrl })
    this.dryRun = dryRun
    this.batchSize = batchSize
    this.domainFilter = domainFilter
    this.limit = limit
    this.debugChanges = debugChanges

    // Create query executors for the conversation linker
    const queryExecutor: QueryExecutor = async criteria => {
      return this.queryParentRequests(criteria)
    }

    const compactSearchExecutor: CompactSearchExecutor = async (
      domain,
      summaryContent,
      afterTimestamp,
      beforeTimestamp
    ) => {
      return this.searchCompactParent(domain, summaryContent, afterTimestamp, beforeTimestamp)
    }

    this.linker = new ConversationLinker(queryExecutor, compactSearchExecutor)
  }

  async rebuild() {
    console.log('Starting conversation rebuild...')
    console.log(`Using batch size: ${this.batchSize}`)
    if (this.domainFilter) console.log(`Filtering by domain: ${this.domainFilter}`)
    if (this.limit) console.log(`Limiting to ${this.limit} requests`)
    console.log('')

    try {
      // Get total count
      const totalCount = await this.getTotalCount()
      console.log(`Total requests to process: ${totalCount}`)

      let offset = 0
      let batchNumber = 1

      // Process in batches, loading with timestamp DESC
      while (offset < totalCount && (!this.limit || offset < this.limit)) {
        const effectiveLimit = this.limit
          ? Math.min(this.batchSize, this.limit - offset)
          : this.batchSize

        console.log(`\nProcessing batch ${batchNumber} (${offset} - ${offset + effectiveLimit})...`)

        const requests = await this.loadBatch(offset, effectiveLimit)
        if (requests.length === 0) break

        // Process each request sequentially (due to dependencies)
        const updates: DatabaseUpdate[] = []
        for (const request of requests) {
          const update = await this.processRequest(request)
          if (update) {
            updates.push(update)
          }
        }

        // Apply updates to database
        if (updates.length > 0) {
          await this.applyUpdates(updates)
        }

        offset += requests.length
        batchNumber++
        this.totalProcessed += requests.length

        // Log progress
        const progress = Math.round(
          (this.totalProcessed / Math.min(totalCount, this.limit || totalCount)) * 100
        )
        console.log(`  Progress: ${progress}% (${this.totalProcessed} requests processed)`)

        // Log memory usage
        const memUsage = process.memoryUsage()
        console.log(
          `  Memory: RSS ${Math.round(memUsage.rss / 1024 / 1024)}MB, Heap ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`
        )
      }

      // Show final statistics
      await this.showStatistics()
    } catch (error) {
      console.error('Error during rebuild:', error)
      throw error
    } finally {
      await this.pool.end()
    }
  }

  private async getTotalCount(): Promise<number> {
    let query = `
      SELECT COUNT(*) as count
      FROM api_requests
      WHERE request_type = 'inference'
    `
    const params: any[] = []

    if (this.domainFilter) {
      params.push(this.domainFilter)
      query += ` AND domain = $${params.length}`
    }

    const result = await this.pool.query(query, params)
    return parseInt(result.rows[0].count)
  }

  private async loadBatch(offset: number, limit: number): Promise<Request[]> {
    let query = `
      SELECT 
        request_id,
        domain,
        timestamp,
        body,
        response_body,
        request_type,
        conversation_id,
        branch_id,
        current_message_hash,
        parent_message_hash,
        system_hash,
        message_count
      FROM api_requests
      WHERE request_type = 'inference'
    `
    const params: any[] = []

    if (this.domainFilter) {
      params.push(this.domainFilter)
      query += ` AND domain = $${params.length}`
    }

    // Order by timestamp DESC to process newest first
    query += ` ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`

    const result = await this.pool.query(query, params)
    return result.rows
  }

  private async processRequest(request: Request): Promise<DatabaseUpdate | null> {
    try {
      // Skip if no messages
      if (!request.body?.messages || request.body.messages.length === 0) {
        console.warn(`Skipping request ${request.request_id} - no messages`)
        return null
      }

      // Create linking request
      const linkingRequest: LinkingRequest = {
        domain: request.domain,
        messages: request.body.messages,
        systemPrompt: request.body.system,
        requestId: request.request_id,
        messageCount: request.body.messages.length,
        timestamp: request.timestamp,
      }

      // Use the conversation linker to determine linkage
      const linkingResult = await this.linker.linkConversation(linkingRequest)

      // Determine conversation ID
      let conversationId: string
      if (linkingResult.conversationId) {
        conversationId = linkingResult.conversationId
      } else {
        // New conversation - generate ID
        conversationId = randomUUID()
        this.conversationsCreated++
      }

      // Check if anything changed
      const hasChanges =
        request.conversation_id !== conversationId ||
        request.branch_id !== linkingResult.branchId ||
        request.current_message_hash !== linkingResult.currentMessageHash ||
        request.parent_message_hash !== linkingResult.parentMessageHash ||
        request.system_hash !== linkingResult.systemHash

      if (!hasChanges) {
        this.conversationsPreserved++
        return null // No update needed
      }

      // Track changes
      if (request.conversation_id && request.conversation_id !== conversationId) {
        this.conversationsChanged++
        if (this.debugChanges) {
          console.log(`  Changed conversation for ${request.request_id}:`)
          console.log(`    Old: ${request.conversation_id}`)
          console.log(`    New: ${conversationId}`)
        }
      }

      return {
        request_id: request.request_id,
        conversation_id: conversationId,
        branch_id: linkingResult.branchId,
        current_message_hash: linkingResult.currentMessageHash,
        parent_message_hash: linkingResult.parentMessageHash,
        system_hash: linkingResult.systemHash,
        parent_request_id: linkingResult.parentRequestId,
      }
    } catch (error) {
      console.error(`Error processing request ${request.request_id}:`, error)
      return null
    }
  }

  private async queryParentRequests(criteria: ParentQueryCriteria): Promise<any[]> {
    let query = `
      SELECT 
        request_id,
        conversation_id,
        branch_id,
        current_message_hash,
        system_hash
      FROM api_requests
      WHERE domain = $1
        AND request_type = 'inference'
    `
    const params: any[] = [criteria.domain]

    if (criteria.currentMessageHash) {
      params.push(criteria.currentMessageHash)
      query += ` AND current_message_hash = $${params.length}`
    }

    if (criteria.parentMessageHash) {
      params.push(criteria.parentMessageHash)
      query += ` AND parent_message_hash = $${params.length}`
    }

    if (criteria.systemHash !== undefined) {
      if (criteria.systemHash === null) {
        query += ` AND system_hash IS NULL`
      } else {
        params.push(criteria.systemHash)
        query += ` AND system_hash = $${params.length}`
      }
    }

    if (criteria.excludeRequestId) {
      params.push(criteria.excludeRequestId)
      query += ` AND request_id != $${params.length}`
    }

    if (criteria.beforeTimestamp) {
      params.push(criteria.beforeTimestamp)
      query += ` AND timestamp < $${params.length}`
    }

    query += ` ORDER BY timestamp DESC LIMIT 10`

    const result = await this.pool.query(query, params)
    return result.rows
  }

  private async searchCompactParent(
    domain: string,
    summaryContent: string,
    afterTimestamp: Date,
    beforeTimestamp?: Date
  ): Promise<any | null> {
    // Search for requests whose response contains the summary
    const searchPattern = `%${summaryContent.substring(0, 100)}%`

    let query = `
      SELECT 
        request_id,
        conversation_id,
        branch_id,
        current_message_hash,
        system_hash
      FROM api_requests
      WHERE domain = $1
        AND request_type = 'inference'
        AND timestamp > $2
        AND response_body::text LIKE $3
    `
    const params: any[] = [domain, afterTimestamp, searchPattern]

    if (beforeTimestamp) {
      params.push(beforeTimestamp)
      query += ` AND timestamp < $${params.length}`
    }

    query += ` ORDER BY timestamp DESC LIMIT 1`

    const result = await this.pool.query(query, params)
    return result.rows[0] || null
  }

  private async applyUpdates(updates: DatabaseUpdate[]): Promise<void> {
    if (this.dryRun) {
      console.log(`  Would update ${updates.length} requests (dry run)`)
      return
    }

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      // Update in smaller sub-batches for performance
      const subBatchSize = 100
      for (let i = 0; i < updates.length; i += subBatchSize) {
        const batch = updates.slice(i, i + subBatchSize)
        await this.updateBatch(client, batch)
      }

      await client.query('COMMIT')
      console.log(`  Updated ${updates.length} requests`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  private async updateBatch(client: PoolClient, batch: DatabaseUpdate[]): Promise<void> {
    // Build bulk update query using CASE statements
    const requestIds = batch.map(u => `'${u.request_id}'`).join(',')

    const conversationIdCases = batch
      .map(u => `WHEN '${u.request_id}' THEN '${u.conversation_id}'::uuid`)
      .join(' ')

    const branchIdCases = batch.map(u => `WHEN '${u.request_id}' THEN '${u.branch_id}'`).join(' ')

    const currentHashCases = batch
      .map(u => `WHEN '${u.request_id}' THEN '${u.current_message_hash}'`)
      .join(' ')

    const parentHashCases = batch
      .map(
        u =>
          `WHEN '${u.request_id}' THEN ${u.parent_message_hash ? `'${u.parent_message_hash}'` : 'NULL'}`
      )
      .join(' ')

    const systemHashCases = batch
      .map(u => `WHEN '${u.request_id}' THEN ${u.system_hash ? `'${u.system_hash}'` : 'NULL'}`)
      .join(' ')

    const parentRequestIdCases = batch
      .map(
        u =>
          `WHEN '${u.request_id}' THEN ${u.parent_request_id ? `'${u.parent_request_id}'` : 'NULL'}`
      )
      .join(' ')

    const query = `
      UPDATE api_requests
      SET 
        conversation_id = CASE request_id ${conversationIdCases} END,
        branch_id = CASE request_id ${branchIdCases} END,
        current_message_hash = CASE request_id ${currentHashCases} END,
        parent_message_hash = CASE request_id ${parentHashCases} END,
        system_hash = CASE request_id ${systemHashCases} END,
        parent_request_id = CASE request_id ${parentRequestIdCases} END
      WHERE request_id IN (${requestIds})
    `

    await client.query(query)
  }

  private async showStatistics() {
    console.log('\n=== Final Statistics ===')
    console.log(`Total requests processed: ${this.totalProcessed}`)
    console.log(`Conversations created: ${this.conversationsCreated}`)
    console.log(`Conversations preserved: ${this.conversationsPreserved}`)
    console.log(`Conversations changed: ${this.conversationsChanged}`)

    if (!this.dryRun) {
      // Query final stats from database
      let query = `
        SELECT 
          COUNT(DISTINCT conversation_id) as total_conversations,
          COUNT(DISTINCT branch_id) as total_branches,
          COUNT(*) as total_requests,
          COUNT(*) FILTER (WHERE branch_id != 'main') as branched_requests
        FROM api_requests
        WHERE conversation_id IS NOT NULL
      `
      const params: any[] = []

      if (this.domainFilter) {
        params.push(this.domainFilter)
        query += ` AND domain = $${params.length}`
      }

      const result = await this.pool.query(query, params)
      const stats = result.rows[0]

      console.log('\nDatabase totals:')
      console.log(`  Total conversations: ${stats.total_conversations}`)
      console.log(`  Total branches: ${stats.total_branches}`)
      console.log(`  Total linked requests: ${stats.total_requests}`)
      console.log(`  Requests on non-main branches: ${stats.branched_requests}`)
    }
  }

  /**
   * Extract database name from connection string for display
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
    } catch (error) {
      console.warn('Failed to parse database name:', error)
      return null
    }
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2)

  const getValue = (flag: string): string | null => {
    const index = args.findIndex(arg => arg === flag)
    return index !== -1 && args[index + 1] ? args[index + 1] : null
  }

  const domain = getValue('--domain')
  const limit = getValue('--limit')
  const batchSize = getValue('--batch-size')

  return {
    dryRun: args.includes('--dry-run'),
    domain,
    limit: limit ? parseInt(limit, 10) : null,
    batchSize: batchSize ? parseInt(batchSize, 10) : 1000,
    debugChanges: args.includes('--debug-changes'),
    help: args.includes('--help') || args.includes('-h'),
  }
}

// Display help
function showHelp() {
  console.log(`
Usage: bun run scripts/db/rebuild-conversations.ts [options]

Rebuilds conversation linkages using the conversation-linker library.
Processes requests in batches to maintain low memory usage.

Options:
  --dry-run              Preview changes without updating database
  --domain <domain>      Filter by specific domain
  --limit <number>       Limit number of requests to process
  --batch-size <number>  Requests per batch (default: 1000)
  --debug-changes        Show detailed conversation ID changes
  --help, -h             Show this help message

Examples:
  # Rebuild all conversations
  bun run scripts/db/rebuild-conversations.ts

  # Preview changes for a domain
  bun run scripts/db/rebuild-conversations.ts --dry-run --domain example.com

  # Process with larger batches
  bun run scripts/db/rebuild-conversations.ts --batch-size 5000

  # Debug conversation changes
  bun run scripts/db/rebuild-conversations.ts --debug-changes --limit 100

Memory usage: ~100-200MB regardless of database size
`)
}

// Main execution
async function main() {
  const { dryRun, domain, limit, batchSize, debugChanges, help } = parseArgs()

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
  console.log('Conversation Rebuild Script')
  console.log('===========================================')
  console.log('This script rebuilds conversation linkages using the')
  console.log('conversation-linker library for all logic.')
  console.log('')

  if (dryRun) {
    console.log('🔍 Running in DRY RUN mode - no database changes')
  } else {
    console.log('⚠️  This will update existing records in the database.')
    console.log('It is recommended to backup your database before proceeding.')
  }

  // Show database name
  const dbName = ConversationRebuilder.extractDatabaseName(databaseUrl)
  if (dbName) {
    console.log(`\n📁 Database: ${dbName}`)
  }

  console.log('')

  // Confirmation prompt unless dry run
  if (!dryRun) {
    const response = prompt('Do you want to continue? (yes/no): ')
    if (response?.toLowerCase() !== 'yes') {
      console.log('Operation cancelled.')
      process.exit(0)
    }
  }

  const rebuilder = new ConversationRebuilder(
    databaseUrl,
    dryRun,
    batchSize,
    domain,
    limit,
    debugChanges
  )

  try {
    await rebuilder.rebuild()
    console.log('\n✅ Conversation rebuild completed successfully!')
  } catch (error) {
    console.error('\n❌ Conversation rebuild failed:', error)
    process.exit(1)
  }
}

// Run the script
main()
