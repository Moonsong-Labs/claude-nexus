#!/usr/bin/env bun
import { Pool } from 'pg'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config as dotenvConfig } from 'dotenv'

// Load environment variables
dotenvConfig()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function setupDatabase() {
  const databaseUrl = process.env.DATABASE_URL
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set')
    console.error('Please set it in your .env file or environment')
    process.exit(1)
  }
  
  console.log('🔗 Connecting to database...')
  
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('amazonaws.com') ? { rejectUnauthorized: false } : undefined
  })
  
  try {
    // Test connection
    await pool.query('SELECT NOW()')
    console.log('✅ Connected to database')
    
    // Read SQL file
    const sqlPath = join(__dirname, 'init-database.sql')
    const sql = readFileSync(sqlPath, 'utf-8')
    
    console.log('📝 Running database initialization...')
    
    // Execute SQL
    await pool.query(sql)
    
    console.log('✅ Database tables created successfully')
    
    // Check tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `)
    
    console.log('\n📊 Tables in database:')
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`)
    })
    
    // Check if requests table has data
    const countResult = await pool.query('SELECT COUNT(*) as count FROM requests')
    console.log(`\n📈 Requests table has ${countResult.rows[0].count} records`)
    
  } catch (error) {
    console.error('❌ Error setting up database:', error.message)
    if (error.detail) console.error('Detail:', error.detail)
    process.exit(1)
  } finally {
    await pool.end()
    console.log('\n✅ Database setup complete!')
  }
}

// Run the setup
setupDatabase()