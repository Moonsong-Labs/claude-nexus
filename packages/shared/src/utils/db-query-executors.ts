import { Pool } from 'pg'
import type { QueryExecutor, CompactSearchExecutor } from './conversation-linker.js'

/**
 * Create query executors for ConversationLinker using a database pool
 * This provides a consistent implementation across proxy and scripts
 */
export function createQueryExecutors(pool: Pool): {
  queryExecutor: QueryExecutor
  compactSearchExecutor: CompactSearchExecutor
} {
  const queryExecutor: QueryExecutor = async criteria => {
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

    if (criteria.systemHash) {
      params.push(criteria.systemHash)
      query += ` AND system_hash = $${params.length}`
    }

    if (criteria.excludeRequestId) {
      params.push(criteria.excludeRequestId)
      query += ` AND request_id != $${params.length}`
    }

    if (criteria.beforeTimestamp) {
      params.push(criteria.beforeTimestamp)
      query += ` AND timestamp < $${params.length}`
    }

    // Order by timestamp DESC to get most recent first, with id DESC as secondary sort
    query += ` ORDER BY timestamp DESC, request_id DESC`

    const result = await pool.query(query, params)
    return result.rows
  }

  const compactSearchExecutor: CompactSearchExecutor = async (
    domain: string,
    summaryContent: string,
    afterTimestamp: Date,
    beforeTimestamp?: Date
  ) => {
    // Clean up the summary content for better matching
    const cleanSummary = summaryContent
      .toLocaleLowerCase()
      .replace(/^Analysis:/i, '<analysis>')
      .replace(/\n\nSummary:/i, '\n</analysis>\n\n<summary>')
      .trim()

    const query = `
      SELECT 
        request_id,
        conversation_id,
        branch_id,
        current_message_hash,
        system_hash,
        response_body
      FROM api_requests
      WHERE domain = $1
        AND timestamp >= $2
        ${beforeTimestamp ? 'AND timestamp < $4' : ''}
        AND request_type = 'inference'
        AND response_body IS NOT NULL
        AND jsonb_typeof(response_body->'content') = 'array'
        AND (
          starts_with(LOWER(response_body->'content'->0->>'text'), $3)
        )
      ORDER BY timestamp DESC
      LIMIT 1
    `

    const params = [domain, afterTimestamp, `${cleanSummary.trim()}`]

    if (beforeTimestamp) {
      params.push(beforeTimestamp)
    }

    const result = await pool.query(query, params)

    if (result.rows.length === 0) {
      return null
    }

    return result.rows[0]
  }

  return { queryExecutor, compactSearchExecutor }
}
