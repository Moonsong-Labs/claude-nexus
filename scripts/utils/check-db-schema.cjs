const { Pool } = require('pg')
require('dotenv').config()

async function checkSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })

  try {
    // List all columns in api_requests table
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'api_requests' 
      ORDER BY ordinal_position
    `)

    console.log('Current api_requests table schema:')
    console.log('=====================================')
    result.rows.forEach(row => {
      console.log(
        `${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : ''}`
      )
    })

    // Check if the table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'api_requests'
      )
    `)

    console.log('\nTable exists:', tableExists.rows[0].exists)
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await pool.end()
  }
}

checkSchema()
