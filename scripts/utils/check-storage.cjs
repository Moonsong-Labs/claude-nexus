const { Pool } = require('pg');
require('dotenv').config();

async function checkStorage() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    // Check recent records
    const result = await pool.query(`
      SELECT request_id, domain, timestamp, method, model, api_key_hash
      FROM api_requests 
      ORDER BY timestamp DESC 
      LIMIT 10
    `);
    
    console.log('Recent storage records:');
    console.log('======================');
    if (result.rows.length === 0) {
      console.log('No records found');
    } else {
      result.rows.forEach(row => {
        console.log(`${row.timestamp.toISOString()} - ${row.domain} - ${row.method} - ${row.model}`);
        console.log(`  Request ID: ${row.request_id}`);
        console.log(`  API Key Hash: ${row.api_key_hash || 'N/A'}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkStorage();