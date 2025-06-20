#!/usr/bin/env bun
import { Pool } from 'pg'

/**
 * Script to recalculate message_count for existing records
 */
async function recalculateMessageCounts() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })

  try {
    console.log('Starting message count recalculation...')

    // Get all records that need updating
    const recordsQuery = `
      SELECT request_id, body
      FROM api_requests
      WHERE body IS NOT NULL
      AND body::jsonb ? 'messages'
      ORDER BY timestamp ASC
    `

    const records = await pool.query(recordsQuery)
    console.log(`Found ${records.rows.length} records to process`)

    let updated = 0
    let errors = 0

    // Process in batches
    const batchSize = 100
    for (let i = 0; i < records.rows.length; i += batchSize) {
      const batch = records.rows.slice(i, i + batchSize)

      await Promise.all(
        batch.map(async row => {
          try {
            // Calculate message count from request body
            const body = row.body
            let messageCount = 0

            if (body && body.messages && Array.isArray(body.messages)) {
              messageCount = body.messages.length
            }

            // Update the record
            await pool.query('UPDATE api_requests SET message_count = $1 WHERE request_id = $2', [
              messageCount,
              row.request_id,
            ])

            updated++
          } catch (error) {
            console.error(`Error processing request ${row.request_id}:`, error)
            errors++
          }
        })
      )

      console.log(
        `Processed ${Math.min(i + batchSize, records.rows.length)} / ${records.rows.length} records`
      )
    }

    console.log(`\nRecalculation completed!`)
    console.log(`Updated: ${updated} records`)
    console.log(`Errors: ${errors} records`)
  } catch (error) {
    console.error('Recalculation failed:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Run recalculation
recalculateMessageCounts().catch(console.error)
