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
}

interface ConversationUpdate {
  request_id: string
  conversation_id: string
  branch_id: string
  parent_request_id: string | null
  current_message_hash: string
  parent_message_hash: string | null
  system_hash: string | null
}

class ConversationRebuilderV2 {
  private pool: Pool
  private conversationLinker: ConversationLinker
  private dryRun: boolean
  private domainFilter: string | null
  private limit: number | null
  private debugMode: boolean

  constructor(
    databaseUrl: string,
    dryRun: boolean = false,
    domainFilter: string | null = null,
    limit: number | null = null,
    debugMode: boolean = false
  ) {
    this.pool = createLoggingPool(databaseUrl)
    this.dryRun = dryRun
    this.domainFilter = domainFilter
    this.limit = limit
    this.debugMode = debugMode

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
    console.log('')

    try {
      // Step 1: Load requests that need processing
      console.log('1. Loading requests from database...')
      const requests = await this.loadRequests()
      console.log(`   Found ${requests.length} requests to process`)

      // Step 2: Process requests sequentially using ConversationLinker
      console.log('\n2. Processing requests sequentially...')

      const updates: ConversationUpdate[] = []
      let processed = 0
      let skipped = 0
      let preservedOrphans = 0
      let preservedConversations = 0
      let changedConversations = 0
      let branchesDetected = 0

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
              console.log(`   Preserving conversation ID for orphan request ${request.request_id}`)
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
          if (linkingResult.branchId !== 'main' && !linkingResult.branchId.startsWith('compact_')) {
            branchesDetected++
            if (this.debugMode) {
              console.log(
                `   Branch detected for request ${request.request_id}: ${linkingResult.branchId}`
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
            request.system_hash !== linkingResult.systemHash

          if (needsUpdate) {
            updates.push({
              request_id: request.request_id,
              conversation_id: conversationId,
              branch_id: linkingResult.branchId,
              parent_request_id: linkingResult.parentRequestId,
              current_message_hash: linkingResult.currentMessageHash,
              parent_message_hash: linkingResult.parentMessageHash,
              system_hash: linkingResult.systemHash,
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
              })
            }
          }

          processed++
          if (processed % 100 === 0) {
            console.log(`   Processed ${processed}/${requests.length} requests...`)
          }
        } catch (error) {
          console.warn(`Failed to process request ${request.request_id}:`, error)
        }
      }

      console.log(`   Processing complete: processed ${processed} requests`)
      if (skipped > 0) {
        console.log(`   Skipped ${skipped} requests without messages`)
      }
      console.log(`   Found ${updates.length} requests that need updates`)
      console.log(`   Detected ${branchesDetected} branches`)
      console.log(`   Preserved ${preservedConversations} existing conversation IDs`)
      console.log(`   Changed ${changedConversations} conversation IDs`)
      if (preservedOrphans > 0) {
        console.log(`   Preserved ${preservedOrphans} orphan conversation IDs`)
      }

      // Step 3: Show statistics
      await this.showStatistics()
    } catch (error) {
      console.error('Error during rebuild:', error)
      throw error
    } finally {
      await this.pool.end()
    }
  }

  private async loadRequests(): Promise<DbRequest[]> {
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
        r.created_at
      FROM api_requests r
      WHERE r.request_type = 'inference'
    `
    const params: any[] = []

    if (this.domainFilter) {
      params.push(this.domainFilter)
      query += ` AND r.domain = $${params.length}`
    }

    query += ' ORDER BY r.timestamp ASC'

    if (this.limit && this.limit > 0) {
      query += ` LIMIT ${this.limit}`
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
        system_hash = $7
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
        COUNT(*) FILTER (WHERE parent_request_id IS NOT NULL) as linked_requests
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
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  const domainIndex = args.findIndex(arg => arg === '--domain')
  const limitIndex = args.findIndex(arg => arg === '--limit')

  return {
    dryRun: args.includes('--dry-run'),
    domain: domainIndex !== -1 && args[domainIndex + 1] ? args[domainIndex + 1] : null,
    limit: limitIndex !== -1 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1], 10) : null,
    debug: args.includes('--debug'),
    help: args.includes('--help') || args.includes('-h'),
  }
}

// Main execution
async function main() {
  const { dryRun, domain, limit, debug, help } = parseArgs()

  if (help) {
    console.log(`
Usage: bun run scripts/db/rebuild-conversations-v2.ts [options]

This version uses the ConversationLinker class for all linking logic.

Options:
  --dry-run    Run in dry-run mode (no database changes)
  --domain     Filter by specific domain
  --limit      Limit the number of requests to process
  --debug      Show detailed debug information
  --help, -h   Show this help message

Examples:
  # Rebuild all conversations
  bun run scripts/db/rebuild-conversations-v2.ts

  # Dry run for a specific domain
  bun run scripts/db/rebuild-conversations-v2.ts --dry-run --domain example.com

  # Process first 100 requests with debug info
  bun run scripts/db/rebuild-conversations-v2.ts --limit 100 --debug
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

  if (debug) {
    console.log('🐛 Debug mode enabled')
  }

  // Extract and display database name
  const dbName = ConversationRebuilderV2.extractDatabaseName(databaseUrl)
  if (dbName) {
    console.log(`🗄️  Database: ${dbName}`)
  }

  console.log('')

  if (!dryRun) {
    const response = prompt('Do you want to continue? (yes/no): ')
    if (response?.toLowerCase() !== 'yes') {
      console.log('Operation cancelled.')
      process.exit(0)
    }
  }

  const rebuilder = new ConversationRebuilderV2(databaseUrl, dryRun, domain, limit, debug)

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
