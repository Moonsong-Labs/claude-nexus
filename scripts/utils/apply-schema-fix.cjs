const { Pool } = require('pg');
require('dotenv').config();

async function applySchemaFix() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    console.log('Applying schema fixes...');
    
    // Add missing columns
    await pool.query(`
      ALTER TABLE api_requests 
      ADD COLUMN IF NOT EXISTS api_key_hash VARCHAR(50)
    `);
    console.log('✓ Added api_key_hash column');
    
    await pool.query(`
      ALTER TABLE api_requests 
      ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0
    `);
    console.log('✓ Added total_tokens column');
    
    await pool.query(`
      ALTER TABLE api_requests 
      ADD COLUMN IF NOT EXISTS first_token_ms INTEGER
    `);
    console.log('✓ Added first_token_ms column');
    
    await pool.query(`
      ALTER TABLE api_requests 
      ADD COLUMN IF NOT EXISTS tool_call_count INTEGER DEFAULT 0
    `);
    console.log('✓ Added tool_call_count column');
    
    // Update existing rows
    const updateResult = await pool.query(`
      UPDATE api_requests 
      SET api_key_hash = api_key_id 
      WHERE api_key_hash IS NULL AND api_key_id IS NOT NULL
    `);
    console.log(`✓ Updated ${updateResult.rowCount} rows to copy api_key_id to api_key_hash`);
    
    const tokenResult = await pool.query(`
      UPDATE api_requests 
      SET total_tokens = COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)
      WHERE total_tokens IS NULL
    `);
    console.log(`✓ Updated ${tokenResult.rowCount} rows to calculate total_tokens`);
    
    console.log('\nSchema fixes applied successfully!');
    
  } catch (error) {
    console.error('Error applying schema fixes:', error.message);
  } finally {
    await pool.end();
  }
}

applySchemaFix();