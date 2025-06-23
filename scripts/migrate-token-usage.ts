#!/usr/bin/env bun

import { Pool } from 'pg'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })

  try {
    console.log('🚀 Starting token usage migration...')
    
    // Read migration SQL
    const migrationPath = join(__dirname, 'migrations', '001_add_account_tracking.sql')
    const migrationSql = readFileSync(migrationPath, 'utf-8')
    
    // Split by semicolons but be careful with function definitions
    const statements = migrationSql
      .split(/;\s*$(?=[\s\n]*(?:--|\z|ALTER|CREATE|INSERT|UPDATE|DELETE|DROP|SELECT))/gm)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))
    
    console.log(`📋 Found ${statements.length} SQL statements to execute`)
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      const firstLine = statement.split('\n')[0].substring(0, 50)
      
      try {
        console.log(`  [${i + 1}/${statements.length}] Executing: ${firstLine}...`)
        await pool.query(statement)
      } catch (error: any) {
        // Some errors are expected (e.g., "already exists")
        if (error.message.includes('already exists')) {
          console.log(`  ⚠️  Skipped (already exists): ${firstLine}`)
        } else {
          console.error(`  ❌ Failed: ${firstLine}`)
          console.error(`     Error: ${error.message}`)
          throw error
        }
      }
    }
    
    console.log('\n✅ Migration completed successfully!')
    
    // Verify the migration
    console.log('\n🔍 Verifying migration...')
    
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('token_usage', 'rate_limit_configs', 'rate_limit_events')
      ORDER BY table_name
    `)
    
    console.log(`  ✓ Created ${tables.rows.length} new tables:`)
    tables.rows.forEach(row => console.log(`    - ${row.table_name}`))
    
    const accountColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'api_requests' 
      AND column_name = 'account_id'
    `)
    
    if (accountColumn.rows.length > 0) {
      console.log('  ✓ Added account_id column to api_requests table')
    }
    
    const partitions = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename LIKE 'token_usage_%'
      ORDER BY tablename
    `)
    
    console.log(`  ✓ Created ${partitions.rows.length} token_usage partitions:`)
    partitions.rows.forEach(row => console.log(`    - ${row.tablename}`))
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Run the migration
runMigration().catch(console.error)