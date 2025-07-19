import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { Pool } from 'pg'

describe('Database Schema Validation', () => {
  let pool: Pool

  beforeAll(() => {
    // Skip tests if DATABASE_URL is not set (e.g., in CI without DB)
    if (!process.env.DATABASE_URL) {
      return
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    })
  })

  afterAll(async () => {
    if (pool) {
      await pool.end()
    }
  })

  it('should use TIMESTAMPTZ for all timestamp columns', async () => {
    // Skip if no database connection
    if (!pool) {
      console.log('Skipping database schema test - DATABASE_URL not set')
      return
    }

    const query = `
      SELECT 
        table_name,
        column_name,
        data_type,
        udt_name,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (data_type LIKE '%timestamp%' OR udt_name LIKE '%timestamp%')
      ORDER BY table_name, column_name
    `

    const result = await pool.query(query)

    // Check that we have timestamp columns to validate
    expect(result.rows.length).toBeGreaterThan(0)

    // Verify all timestamp columns use TIMESTAMPTZ
    const nonTzColumns = result.rows.filter(row => row.data_type !== 'timestamp with time zone')

    if (nonTzColumns.length > 0) {
      const violations = nonTzColumns
        .map(col => `${col.table_name}.${col.column_name} (${col.data_type})`)
        .join('\n  ')

      throw new Error(
        `Found timestamp columns not using TIMESTAMPTZ:\n  ${violations}\n\n` +
          'All timestamp columns must use TIMESTAMPTZ to avoid timezone issues.'
      )
    }

    // Log summary for visibility
    const tableCount = new Set(result.rows.map(r => r.table_name)).size
    console.log(
      `✅ Validated ${result.rows.length} timestamp columns across ${tableCount} tables - all using TIMESTAMPTZ`
    )
  })

  it('should have proper timestamp columns in core tables', async () => {
    // Skip if no database connection
    if (!pool) {
      return
    }

    // Define expected timestamp columns for core tables
    const expectedColumns = {
      api_requests: ['timestamp', 'created_at'],
      streaming_chunks: ['timestamp', 'created_at'],
      conversation_analyses: ['created_at', 'updated_at', 'completed_at'],
    }

    for (const [table, columns] of Object.entries(expectedColumns)) {
      const query = `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = ANY($2::text[])
      `

      const result = await pool.query(query, [table, columns])

      // Check all expected columns exist
      const foundColumns = result.rows.map(r => r.column_name)
      const missingColumns = columns.filter(c => !foundColumns.includes(c))

      if (missingColumns.length > 0) {
        throw new Error(
          `Table ${table} is missing expected timestamp columns: ${missingColumns.join(', ')}`
        )
      }

      // Verify all are TIMESTAMPTZ
      const nonTzColumns = result.rows.filter(row => row.data_type !== 'timestamp with time zone')

      if (nonTzColumns.length > 0) {
        throw new Error(
          `Table ${table} has non-TIMESTAMPTZ columns: ${nonTzColumns.map(c => c.column_name).join(', ')}`
        )
      }
    }
  })
})
