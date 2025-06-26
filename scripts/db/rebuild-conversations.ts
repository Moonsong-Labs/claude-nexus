#!/usr/bin/env bun
/**
 * Script to retroactively compute conversation IDs and branches from existing requests
 * This analyzes message hashes to rebuild conversation relationships
 *
 * Important: This script now preserves existing conversation IDs when the linkage
 * hasn't changed. Only requests whose parent-child relationships have changed will
 * receive new conversation IDs.
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
  conversation_id: string | null
  branch_id: string | null
  body: any
  request_type: string | null
  message_count: number | null
}

interface ConversationNode {
  request_id: string
  timestamp: Date
  parent_message_hash: string | null
  current_message_hash: string | null
  conversation_id?: string
  branch_id?: string
  message_count?: number | null
  children: ConversationNode[]
}

class ConversationRebuilder {
  private pool: Pool
  private requestsByHash: Map<string, Request[]> = new Map()
  private processedRequests: Set<string> = new Set()
  private conversationRoots: ConversationNode[] = []
  private dryRun: boolean
  private onlyOrphanConversations: boolean
  private existingRequests: Map<string, Request> = new Map()
  private existingConversationRequests: Map<string, Request[]> = new Map()

  constructor(
    databaseUrl: string,
    dryRun: boolean = false,
    onlyOrphanConversations: boolean = false
  ) {
    this.pool = new Pool({ connectionString: databaseUrl })
    this.dryRun = dryRun
    this.onlyOrphanConversations = onlyOrphanConversations
  }

  async rebuild() {
    console.log('Starting conversation rebuild...')

    try {
      // Step 1: Load all requests
      console.log('\n1. Loading all requests from database...')
      const requests = await this.loadRequests()
      console.log(`   Found ${requests.length} requests`)

      // Count how many needed hash computation
      const requestsWithHashes = requests.filter(r => r.current_message_hash).length
      const requestsNeedingHashes = requests.length - requestsWithHashes
      if (requestsNeedingHashes > 0) {
        console.log(
          `   Computed hashes for ${requestsNeedingHashes} requests that were missing them`
        )
      }

      // Step 2: Build hash index
      console.log('\n2. Building message hash index...')
      this.buildHashIndex(requests)
      console.log(`   Indexed ${this.requestsByHash.size} unique message hashes`)

      // Step 3: Build conversation trees
      console.log('\n3. Building conversation trees...')
      const trees = this.buildConversationTrees(requests)
      console.log(`   Found ${trees.length} conversation roots`)

      // Step 4: Assign conversation IDs and detect branches
      console.log('\n4. Assigning conversation IDs and detecting branches...')
      const updates = this.assignConversationsAndBranches(trees)

      // Count how many conversation IDs were preserved
      const preservedConversations = new Set<string>()
      const changedConversations = new Set<string>()

      for (const update of updates) {
        const existing = this.existingRequests.get(update.request_id)
        if (existing?.conversation_id) {
          if (existing.conversation_id === update.conversation_id) {
            preservedConversations.add(update.conversation_id)
          } else {
            changedConversations.add(existing.conversation_id)
          }
        }
      }

      console.log(`   Prepared ${updates.length} updates`)
      console.log(`   Preserved ${preservedConversations.size} existing conversation IDs`)
      console.log(`   Changed ${changedConversations.size} conversation IDs due to linkage changes`)

      // Step 5: Update database
      console.log('\n5. Updating database...')
      await this.updateDatabase(updates)
      console.log('   Database updated successfully')

      // Step 6: Show statistics
      await this.showStatistics()
    } catch (error) {
      console.error('Error during rebuild:', error)
      throw error
    } finally {
      await this.pool.end()
    }
  }

  private async loadRequests(): Promise<Request[]> {
    let query = `
      SELECT 
        request_id,
        domain,
        timestamp,
        current_message_hash,
        parent_message_hash,
        conversation_id,
        branch_id,
        body,
        request_type,
        message_count
      FROM api_requests
      WHERE request_type IN ('inference')
    `

    // Add filter for orphan requests if requested
    if (this.onlyOrphanConversations) {
      // First, find all conversation IDs that have at least one request with only 1 message
      const conversationsWithSingleMessageQuery = `
        SELECT DISTINCT conversation_id 
        FROM api_requests 
        WHERE request_type IN ('inference')
          AND conversation_id IS NOT NULL
          AND (message_count = 1 OR (message_count IS NULL AND jsonb_array_length(body->'messages') = 1))
      `

      const conversationsWithSingleMessage = await this.pool.query(
        conversationsWithSingleMessageQuery
      )
      const conversationIds = conversationsWithSingleMessage.rows.map(row => row.conversation_id)

      if (conversationIds.length > 0) {
        // Exclude these conversations from our query
        query += `
          AND (conversation_id IS NULL OR conversation_id NOT IN (${conversationIds.map(id => `'${id}'`).join(',')}))
        `
      }

      console.log(
        `   Filtering for orphan conversations (excluding ${conversationIds.length} conversations with single-message requests)`
      )
    }

    query += ' ORDER BY timestamp ASC'

    const result = await this.pool.query(query)

    // Process requests to compute missing hashes and message counts
    let messageCountsComputed = 0
    const processedRequests = result.rows.map(row => {
      const request = { ...row }

      // Store original request data for comparison
      this.existingRequests.set(request.request_id, { ...request })

      // Build index of existing conversations
      if (request.conversation_id) {
        if (!this.existingConversationRequests.has(request.conversation_id)) {
          this.existingConversationRequests.set(request.conversation_id, [])
        }
        this.existingConversationRequests.get(request.conversation_id)!.push(request)
      }

      // If hashes are missing but we have a body with messages, compute them
      if (request.body?.messages) {
        try {
          const { currentMessageHash, parentMessageHash } = extractMessageHashes(
            request.body.messages,
            request.body.system
          )
          request.current_message_hash = currentMessageHash
          request.parent_message_hash = parentMessageHash
        } catch (error) {
          console.warn(`Failed to compute hashes for request ${request.request_id}:`, error)
        }
      }

      // Compute message count if missing
      if (request.body?.messages && Array.isArray(request.body.messages)) {
        request.message_count = request.body.messages.length
        messageCountsComputed++
      }

      return request
    })

    if (messageCountsComputed > 0) {
      console.log(
        `   Computed message counts for ${messageCountsComputed} requests that were missing them`
      )
    }

    return processedRequests
  }

  private buildHashIndex(requests: Request[]) {
    for (const request of requests) {
      if (request.current_message_hash) {
        if (!this.requestsByHash.has(request.current_message_hash)) {
          this.requestsByHash.set(request.current_message_hash, [])
        }
        this.requestsByHash.get(request.current_message_hash)!.push(request)
      }
    }
  }

  private buildConversationTrees(requests: Request[]): ConversationNode[] {
    const roots: ConversationNode[] = []
    const nodeMap = new Map<string, ConversationNode>()

    // Create nodes for all requests that have hashes
    for (const request of requests) {
      if (!request.current_message_hash) {
        console.warn(`Skipping request ${request.request_id} - no message hash`)
        continue
      }

      const node: ConversationNode = {
        request_id: request.request_id,
        timestamp: request.timestamp,
        parent_message_hash: request.parent_message_hash,
        current_message_hash: request.current_message_hash,
        message_count: request.message_count,
        children: [],
      }
      nodeMap.set(request.request_id, node)
    }

    // Build parent-child relationships
    for (const request of requests) {
      const node = nodeMap.get(request.request_id)!

      if (request.parent_message_hash) {
        // Find parent requests
        const parentRequests = this.requestsByHash.get(request.parent_message_hash) || []

        if (parentRequests.length > 0) {
          // When multiple parents exist, choose the one with the same domain and closest timestamp
          const parent = this.findBestParent(parentRequests, request)

          if (parent) {
            const parentNode = nodeMap.get(parent.request_id)
            if (parentNode) {
              parentNode.children.push(node)
            }
          } else {
            // No suitable parent found, this is a root
            roots.push(node)
          }
        } else {
          // No parent found, this is a root
          roots.push(node)
        }
      } else {
        // No parent hash, this is a root
        roots.push(node)
      }
    }

    return roots
  }

  private findBestParent(candidates: Request[], child: Request): Request | null {
    // Filter candidates by domain and timestamp (parent must be before child)
    const validCandidates = candidates.filter(
      c => c.domain === child.domain && new Date(c.timestamp) < new Date(child.timestamp)
    )

    if (validCandidates.length === 0) {
      return null
    }

    // Sort by timestamp (closest to child first)
    validCandidates.sort((a, b) => {
      const timeDiffA = Math.abs(
        new Date(child.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      const timeDiffB = Math.abs(
        new Date(child.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
      return timeDiffA - timeDiffB
    })

    return validCandidates[0]
  }

  private findExistingConversationId(root: ConversationNode): string | null {
    // Get the existing request data
    const existingRequest = this.existingRequests.get(root.request_id)
    if (!existingRequest?.conversation_id) {
      return null
    }

    // Get all requests in the existing conversation
    const existingConvRequests =
      this.existingConversationRequests.get(existingRequest.conversation_id) || []

    // Build a set of all request IDs in the current tree
    const currentTreeRequestIds = new Set<string>()
    this.collectTreeRequestIds(root, currentTreeRequestIds)

    // Check if the conversation has the same requests
    const existingConvRequestIds = new Set(existingConvRequests.map(r => r.request_id))

    // If the sets are identical, the conversation structure hasn't changed
    if (
      currentTreeRequestIds.size === existingConvRequestIds.size &&
      [...currentTreeRequestIds].every(id => existingConvRequestIds.has(id))
    ) {
      // Verify parent-child relationships are the same
      if (this.verifyConversationStructure(root, existingRequest.conversation_id)) {
        return existingRequest.conversation_id
      }
    }

    return null
  }

  private collectTreeRequestIds(node: ConversationNode, requestIds: Set<string>) {
    requestIds.add(node.request_id)
    for (const child of node.children) {
      this.collectTreeRequestIds(child, requestIds)
    }
  }

  private verifyConversationStructure(root: ConversationNode, conversationId: string): boolean {
    // Get all requests in the existing conversation
    const existingRequests = this.existingConversationRequests.get(conversationId) || []
    const existingByRequestId = new Map(existingRequests.map(r => [r.request_id, r]))

    // Verify each node has the same parent-child relationships
    return this.verifyNodeStructure(root, existingByRequestId)
  }

  private verifyNodeStructure(
    node: ConversationNode,
    existingByRequestId: Map<string, Request>
  ): boolean {
    const existing = existingByRequestId.get(node.request_id)
    if (!existing) {
      return false
    }

    // Check if parent hash matches
    if (node.parent_message_hash !== existing.parent_message_hash) {
      return false
    }

    // Recursively check all children
    for (const child of node.children) {
      if (!this.verifyNodeStructure(child, existingByRequestId)) {
        return false
      }
    }

    return true
  }

  private assignConversationsAndBranches(trees: ConversationNode[]): Array<{
    request_id: string
    conversation_id: string
    branch_id: string
    current_message_hash?: string
    parent_message_hash?: string
    message_count?: number
  }> {
    const updates: Array<{
      request_id: string
      conversation_id: string
      branch_id: string
      current_message_hash?: string
      parent_message_hash?: string
      message_count?: number
    }> = []

    for (const root of trees) {
      // Check if this conversation already exists and has the same structure
      const existingConvId = this.findExistingConversationId(root)
      const conversationId = existingConvId || randomUUID()

      this.traverseAndAssign(
        root,
        conversationId,
        'main',
        new Map(),
        updates,
        existingConvId !== null
      )
    }

    return updates
  }

  private traverseAndAssign(
    node: ConversationNode,
    conversationId: string,
    branchId: string,
    branchPoints: Map<string, number>,
    updates: Array<{
      request_id: string
      conversation_id: string
      branch_id: string
      current_message_hash?: string
      parent_message_hash?: string
      message_count?: number
    }>,
    isExistingConversation: boolean = false
  ) {
    // Get existing request data
    const existing = this.existingRequests.get(node.request_id)

    // Check if we need to update this request
    const needsUpdate =
      !existing ||
      existing.conversation_id !== conversationId ||
      existing.branch_id !== branchId ||
      existing.current_message_hash !== node.current_message_hash ||
      existing.parent_message_hash !== node.parent_message_hash ||
      existing.message_count !== node.message_count

    if (needsUpdate) {
      // Only create update if something has changed
      const update: any = {
        request_id: node.request_id,
        conversation_id: conversationId,
        branch_id: branchId,
      }

      // Include hashes if they exist
      if (node.current_message_hash) {
        update.current_message_hash = node.current_message_hash
      }
      if (node.parent_message_hash) {
        update.parent_message_hash = node.parent_message_hash
      }
      if (node.message_count !== null && node.message_count !== undefined) {
        update.message_count = node.message_count
      }

      updates.push(update)
    }

    // Check if this node creates a branch point
    if (node.children.length > 1) {
      // This is a branch point
      console.log(
        `   Branch point detected at ${node.request_id} with ${node.children.length} children`
      )

      // Sort children by timestamp to ensure consistent branch assignment
      const sortedChildren = [...node.children].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )

      // First child continues on the same branch
      this.traverseAndAssign(
        sortedChildren[0],
        conversationId,
        branchId,
        branchPoints,
        updates,
        isExistingConversation
      )

      // Other children get new branches
      for (let i = 1; i < sortedChildren.length; i++) {
        const newBranchId = `branch_${new Date(sortedChildren[i].timestamp).getTime()}`
        this.traverseAndAssign(
          sortedChildren[i],
          conversationId,
          newBranchId,
          branchPoints,
          updates,
          isExistingConversation
        )
      }
    } else if (node.children.length === 1) {
      // Single child continues on the same branch
      this.traverseAndAssign(
        node.children[0],
        conversationId,
        branchId,
        branchPoints,
        updates,
        isExistingConversation
      )
    }
    // If no children, traversal ends here
  }

  private async updateDatabase(
    updates: Array<{
      request_id: string
      conversation_id: string
      branch_id: string
      current_message_hash?: string
      parent_message_hash?: string
      message_count?: number
    }>
  ) {
    if (this.dryRun) {
      console.log('\n   🔍 DRY RUN MODE - Showing what would be updated:')

      // Group updates by type of change
      const conversationUpdates = updates.filter(u => u.conversation_id)
      const hashUpdates = updates.filter(u => u.current_message_hash || u.parent_message_hash)
      const messageCountUpdates = updates.filter(u => u.message_count !== undefined)

      console.log(`   Would update ${updates.length} total requests:`)
      console.log(`     - ${conversationUpdates.length} conversation assignments`)
      console.log(`     - ${hashUpdates.length} hash updates`)
      console.log(`     - ${messageCountUpdates.length} message count updates`)

      // Show sample of changes
      if (updates.length > 0) {
        console.log('\n   Sample of changes (first 5):')
        updates.slice(0, 5).forEach(update => {
          const existing = this.existingRequests.get(update.request_id)
          const isPreserved = existing?.conversation_id === update.conversation_id

          console.log(`     Request ${update.request_id}:`)
          console.log(
            `       - conversation_id: ${update.conversation_id} ${isPreserved ? '(preserved)' : existing?.conversation_id ? `(was: ${existing.conversation_id})` : '(new)'}`
          )
          console.log(`       - branch_id: ${update.branch_id}`)
          if (update.current_message_hash) {
            console.log(
              `       - current_message_hash: ${update.current_message_hash.substring(0, 16)}...`
            )
          }
          if (update.parent_message_hash !== undefined) {
            console.log(
              `       - parent_message_hash: ${update.parent_message_hash ? update.parent_message_hash.substring(0, 16) + '...' : 'NULL'}`
            )
          }
          if (update.message_count !== undefined) {
            console.log(`       - message_count: ${update.message_count}`)
          }
        })

        if (updates.length > 5) {
          console.log(`     ... and ${updates.length - 5} more requests`)
        }
      }

      return
    }

    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      // Update in batches of 1000
      const batchSize = 1000
      for (let i = 0; i < updates.length; i += batchSize) {
        const batch = updates.slice(i, i + batchSize)

        // Build the update query using CASE statements
        const caseConversationId = batch
          .map(u => `WHEN '${u.request_id}' THEN '${u.conversation_id}'::uuid`)
          .join(' ')

        const caseBranchId = batch
          .map(u => `WHEN '${u.request_id}' THEN '${u.branch_id}'`)
          .join(' ')

        const caseCurrentHash = batch
          .map(u =>
            u.current_message_hash
              ? `WHEN '${u.request_id}' THEN '${u.current_message_hash}'`
              : `WHEN '${u.request_id}' THEN current_message_hash`
          )
          .join(' ')

        const caseParentHash = batch
          .map(u =>
            u.parent_message_hash !== undefined
              ? `WHEN '${u.request_id}' THEN ${u.parent_message_hash ? `'${u.parent_message_hash}'` : 'NULL'}`
              : `WHEN '${u.request_id}' THEN parent_message_hash`
          )
          .join(' ')

        const caseMessageCount = batch
          .map(u =>
            u.message_count !== undefined
              ? `WHEN '${u.request_id}' THEN ${u.message_count}`
              : `WHEN '${u.request_id}' THEN message_count`
          )
          .join(' ')

        const requestIds = batch.map(u => `'${u.request_id}'`).join(',')

        const query = `
          UPDATE api_requests
          SET 
            conversation_id = CASE request_id ${caseConversationId} END,
            branch_id = CASE request_id ${caseBranchId} END,
            current_message_hash = CASE request_id ${caseCurrentHash} END,
            parent_message_hash = CASE request_id ${caseParentHash} END,
            message_count = CASE request_id ${caseMessageCount} END
          WHERE request_id IN (${requestIds})
        `

        await client.query(query)

        if ((i + batch.length) % 10000 === 0) {
          console.log(`   Updated ${i + batch.length} / ${updates.length} requests...`)
        }
      }

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  private async showStatistics() {
    console.log('\n6. Final statistics:')

    if (this.dryRun) {
      console.log('   (Statistics show current database state, not dry-run changes)')
    }

    const stats = await this.pool.query(`
      SELECT 
        COUNT(DISTINCT conversation_id) as total_conversations,
        COUNT(DISTINCT branch_id) as total_branches,
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE branch_id != 'main') as branched_requests
      FROM api_requests
      WHERE conversation_id IS NOT NULL
    `)

    const domainStats = await this.pool.query(`
      SELECT 
        domain,
        COUNT(DISTINCT conversation_id) as conversations,
        COUNT(DISTINCT branch_id) as branches,
        COUNT(*) as requests
      FROM api_requests
      WHERE conversation_id IS NOT NULL
      GROUP BY domain
      ORDER BY requests DESC
      LIMIT 10
    `)

    console.log(`   Total conversations: ${stats.rows[0].total_conversations}`)
    console.log(`   Total branches: ${stats.rows[0].total_branches}`)
    console.log(`   Total requests with conversations: ${stats.rows[0].total_requests}`)
    console.log(`   Requests on non-main branches: ${stats.rows[0].branched_requests}`)

    console.log('\n   Top domains by request count:')
    for (const row of domainStats.rows) {
      console.log(
        `     ${row.domain}: ${row.conversations} conversations, ${row.branches} branches, ${row.requests} requests`
      )
    }
  }
}

// Parse command line arguments
function parseArgs(): { dryRun: boolean; onlyOrphanConversations: boolean } {
  const args = process.argv.slice(2)
  return {
    dryRun: args.includes('--dry-run'),
    onlyOrphanConversations: args.includes('--only-orphan-conversations'),
  }
}

// Main execution
async function main() {
  const databaseUrl = process.env.DATABASE_URL
  const { dryRun, onlyOrphanConversations } = parseArgs()

  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required')
    process.exit(1)
  }

  console.log('===========================================')
  console.log('Conversation Rebuild Script')
  console.log('===========================================')
  console.log('This script will retroactively compute conversation IDs and branches')
  console.log('from existing requests in the database based on message hashes.')
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

  console.log('')

  // Add a confirmation prompt unless in dry run mode
  if (!dryRun) {
    const response = prompt('Do you want to continue? (yes/no): ')

    if (response?.toLowerCase() !== 'yes') {
      console.log('Operation cancelled.')
      process.exit(0)
    }
  }

  const rebuilder = new ConversationRebuilder(databaseUrl, dryRun, onlyOrphanConversations)

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
