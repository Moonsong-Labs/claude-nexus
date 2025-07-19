/**
 * Utility functions for API routes
 */

import { Context } from 'hono'
import { Pool } from 'pg'
import { z } from 'zod'
import { logger } from '../middleware/logger.js'
import { getErrorMessage } from '@claude-nexus/shared'

/**
 * Get database pool from context or container
 * @param c Hono context
 * @returns Database pool or throws appropriate HTTP response
 */
export async function getDatabasePool(c: Context): Promise<Pool> {
  let pool = c.get('pool')

  // Fallback: try to get pool from container if not in context
  if (!pool) {
    const { container } = await import('../container.js')
    pool = container.getDbPool()

    if (!pool) {
      logger.warn('API request but pool is not available', {
        metadata: {
          path: c.req.path,
        },
      })
      throw c.json({ error: 'Database not configured' }, 503)
    }
  }

  return pool
}

/**
 * Handle API errors consistently
 * @param c Hono context
 * @param error Error object
 * @param message User-facing error message
 * @param statusCode HTTP status code
 */
export function handleApiError(
  c: Context,
  error: unknown,
  message: string,
  statusCode = 500
): Response {
  if (error instanceof z.ZodError) {
    return c.json({ error: 'Invalid parameters', details: error.errors }, 400)
  }

  logger.error(message, { error: getErrorMessage(error) })
  return c.json({ error: message }, statusCode as any)
}

/**
 * Parse and validate query parameters with consistent error handling
 * @param c Hono context
 * @param schema Zod schema for validation
 * @returns Parsed and validated query parameters
 */
export function parseQueryParams<T extends z.ZodTypeAny>(
  c: Context,
  schema: T
): z.infer<T> {
  const query = c.req.query()
  const result = schema.safeParse(query)
  
  if (!result.success) {
    throw result.error
  }
  
  return result.data
}