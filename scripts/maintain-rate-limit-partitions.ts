#!/usr/bin/env bun
import { Pool } from 'pg'
import { logger } from '../packages/shared/src/logger/index.js'

/**
 * Script to maintain rate_limit_events table partitions
 * - Creates future partitions for the next 3 months
 * - Drops partitions older than 90 days (configurable)
 *
 * This should be run periodically (e.g., weekly via cron)
 */

const RETENTION_DAYS = parseInt(process.env.RATE_LIMIT_RETENTION_DAYS || '90')
const FUTURE_MONTHS = 3 // How many months ahead to create partitions

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })
  const client = await pool.connect()

  try {
    // Create future partitions
    console.log(`Creating partitions for the next ${FUTURE_MONTHS} months...`)
    const currentDate = new Date()

    for (let i = 0; i <= FUTURE_MONTHS; i++) {
      const partitionDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1)
      const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + i + 1, 1)

      const startDate = partitionDate.toISOString().split('T')[0]
      const endDate = nextMonth.toISOString().split('T')[0]

      try {
        await client.query(`SELECT create_rate_limit_events_partition($1::date, $2::date)`, [
          startDate,
          endDate,
        ])
        console.log(
          `✓ Created/verified partition for ${partitionDate.toISOString().substring(0, 7)}`
        )
      } catch (error) {
        // Partition might already exist, which is fine
        if (error instanceof Error && error.message.includes('already exists')) {
          console.log(
            `✓ Partition for ${partitionDate.toISOString().substring(0, 7)} already exists`
          )
        } else {
          throw error
        }
      }
    }

    // Drop old partitions
    console.log(`\nDropping partitions older than ${RETENTION_DAYS} days...`)
    const droppedCount = await client.query(`SELECT drop_old_rate_limit_events_partitions($1)`, [
      RETENTION_DAYS,
    ])

    // List current partitions
    const partitionsResult = await client.query(`
      SELECT 
        schemaname,
        tablename as partition_name,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
      FROM pg_tables 
      WHERE tablename LIKE 'rate_limit_events_%'
        AND tablename ~ '^rate_limit_events_[0-9]{4}_[0-9]{2}$'
      ORDER BY tablename
    `)

    console.log('\nCurrent partitions:')
    console.table(partitionsResult.rows)

    // Show statistics
    const statsResult = await client.query(`
      SELECT 
        COUNT(*) as total_events,
        MIN(triggered_at) as oldest_event,
        MAX(triggered_at) as newest_event
      FROM rate_limit_events
    `)

    if (statsResult.rows[0].total_events > 0) {
      console.log('\nRate limit events statistics:')
      console.log(`Total events: ${statsResult.rows[0].total_events}`)
      console.log(`Oldest event: ${statsResult.rows[0].oldest_event}`)
      console.log(`Newest event: ${statsResult.rows[0].newest_event}`)
    } else {
      console.log('\nNo rate limit events recorded yet.')
    }

    logger.info('Partition maintenance completed', {
      metadata: {
        retentionDays: RETENTION_DAYS,
        futureMonths: FUTURE_MONTHS,
        partitionCount: partitionsResult.rowCount,
      },
    })
  } catch (error) {
    console.error('❌ Partition maintenance failed:', error)
    logger.error('Partition maintenance failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(error => {
  console.error('Unexpected error:', error)
  process.exit(1)
})
