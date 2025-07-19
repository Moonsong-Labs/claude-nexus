import { Pool } from 'pg'
import { logger } from '../middleware/logger.js'

interface AuditLogData {
  event_type: string
  outcome: string
  conversation_id: string
  branch_id: string
  domain: string
  request_id: string
  user_context?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

/**
 * Writes an audit log entry to the database
 * @param pool - Database connection pool
 * @param data - Audit log data
 */
export async function auditLog(pool: Pool, data: AuditLogData): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO analysis_audit_log 
       (event_type, outcome, conversation_id, branch_id, domain, request_id, user_context, metadata, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        data.event_type,
        data.outcome,
        data.conversation_id,
        data.branch_id,
        data.domain,
        data.request_id,
        JSON.stringify(data.user_context || {}),
        JSON.stringify(data.metadata || {}),
      ]
    )
  } catch (error) {
    logger.error('Failed to write audit log', { error, data })
  }
}