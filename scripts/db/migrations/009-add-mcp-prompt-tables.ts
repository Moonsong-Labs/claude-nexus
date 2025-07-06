#!/usr/bin/env bun
/**
 * Migration 009: Add MCP Prompt Tables
 *
 * This migration adds tables for the Model Context Protocol (MCP) server implementation:
 * - mcp_prompts: Stores prompt templates from GitHub
 * - mcp_sync_status: Tracks GitHub repository sync status
 * - mcp_prompt_usage: Tracks prompt usage for analytics
 */

import { Pool } from 'pg'

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })

  try {
    console.log('Running migration 009: Add MCP prompt tables...')

    await pool.query('BEGIN')

    // Create mcp_prompts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mcp_prompts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        prompt_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        content TEXT NOT NULL,
        arguments JSONB,
        metadata JSONB,
        github_path VARCHAR(500) NOT NULL,
        github_sha VARCHAR(40),
        github_url TEXT,
        version INTEGER DEFAULT 1,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        synced_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    console.log('✓ Created mcp_prompts table')

    // Create mcp_sync_status table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mcp_sync_status (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        repository VARCHAR(255) NOT NULL,
        branch VARCHAR(100) DEFAULT 'main',
        last_sync_at TIMESTAMPTZ,
        last_commit_sha VARCHAR(40),
        last_error TEXT,
        sync_status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(repository, branch)
      )
    `)
    console.log('✓ Created mcp_sync_status table')

    // Create mcp_prompt_usage table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mcp_prompt_usage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        prompt_id VARCHAR(255) NOT NULL,
        domain VARCHAR(255),
        account_id VARCHAR(255),
        request_id UUID REFERENCES api_requests(request_id),
        used_at TIMESTAMPTZ DEFAULT NOW(),
        arguments JSONB,
        FOREIGN KEY (prompt_id) REFERENCES mcp_prompts(prompt_id)
      )
    `)
    console.log('✓ Created mcp_prompt_usage table')

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mcp_prompts_prompt_id ON mcp_prompts(prompt_id);
      CREATE INDEX IF NOT EXISTS idx_mcp_prompts_active ON mcp_prompts(is_active);
      CREATE INDEX IF NOT EXISTS idx_mcp_prompts_github_path ON mcp_prompts(github_path);
      CREATE INDEX IF NOT EXISTS idx_mcp_prompts_updated_at ON mcp_prompts(updated_at);
    `)
    console.log('✓ Created indexes for mcp_prompts')

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mcp_sync_status_repository ON mcp_sync_status(repository);
      CREATE INDEX IF NOT EXISTS idx_mcp_sync_status_sync_status ON mcp_sync_status(sync_status);
    `)
    console.log('✓ Created indexes for mcp_sync_status')

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_mcp_prompt_usage_prompt_id ON mcp_prompt_usage(prompt_id);
      CREATE INDEX IF NOT EXISTS idx_mcp_prompt_usage_used_at ON mcp_prompt_usage(used_at);
      CREATE INDEX IF NOT EXISTS idx_mcp_prompt_usage_domain ON mcp_prompt_usage(domain);
      CREATE INDEX IF NOT EXISTS idx_mcp_prompt_usage_account_id ON mcp_prompt_usage(account_id);
    `)
    console.log('✓ Created indexes for mcp_prompt_usage')

    // Add column comments
    await pool.query(`
      COMMENT ON TABLE mcp_prompts IS 'Stores MCP prompt templates synced from GitHub repository';
      COMMENT ON COLUMN mcp_prompts.prompt_id IS 'Unique identifier for the prompt, typically the file path in GitHub';
      COMMENT ON COLUMN mcp_prompts.arguments IS 'JSON schema defining the prompt arguments/parameters';
      COMMENT ON COLUMN mcp_prompts.metadata IS 'Additional metadata from the prompt file (tags, categories, etc)';
      COMMENT ON COLUMN mcp_prompts.github_sha IS 'Git commit SHA when this prompt was last synced';
      COMMENT ON COLUMN mcp_prompts.version IS 'Version number, incremented on each update';
      
      COMMENT ON TABLE mcp_sync_status IS 'Tracks the synchronization status with GitHub repository';
      COMMENT ON COLUMN mcp_sync_status.sync_status IS 'Status: pending, syncing, success, error';
      
      COMMENT ON TABLE mcp_prompt_usage IS 'Tracks usage of MCP prompts for analytics and auditing';
      COMMENT ON COLUMN mcp_prompt_usage.arguments IS 'The actual argument values used when the prompt was invoked';
    `)
    console.log('✓ Added table and column comments')

    await pool.query('COMMIT')
    console.log('✅ Migration 009 completed successfully')
  } catch (error) {
    await pool.query('ROLLBACK')
    console.error('❌ Migration 009 failed:', error)
    throw error
  } finally {
    await pool.end()
  }
}

// Run the migration
migrate().catch(error => {
  console.error('Migration error:', error)
  process.exit(1)
})
