-- Initialize Claude Nexus Proxy Database
-- This script creates the necessary tables for the proxy

-- Create api_requests table with all required columns including branch_id
CREATE TABLE IF NOT EXISTS api_requests (
    request_id UUID PRIMARY KEY,
    domain VARCHAR(255) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    method VARCHAR(10) NOT NULL,
    path VARCHAR(255) NOT NULL,
    headers JSONB,
    body JSONB,
    api_key_hash VARCHAR(50),
    model VARCHAR(100),
    request_type VARCHAR(50),
    response_status INTEGER,
    response_headers JSONB,
    response_body JSONB,
    response_streaming BOOLEAN DEFAULT false,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    cache_creation_input_tokens INTEGER DEFAULT 0,
    cache_read_input_tokens INTEGER DEFAULT 0,
    usage_data JSONB,
    first_token_ms INTEGER,
    duration_ms INTEGER,
    error TEXT,
    tool_call_count INTEGER DEFAULT 0,
    current_message_hash CHAR(64),
    parent_message_hash CHAR(64),
    conversation_id UUID,
    branch_id VARCHAR(255) DEFAULT 'main',
    message_count INTEGER DEFAULT 0,
    parent_task_request_id UUID REFERENCES api_requests(request_id),
    is_subtask BOOLEAN DEFAULT false,
    task_tool_invocation JSONB,
    account_id VARCHAR(255),
    parent_request_id UUID REFERENCES api_requests(request_id),
    system_hash VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_parent_request_not_self CHECK (parent_request_id != request_id)
);

-- Create streaming_chunks table
CREATE TABLE IF NOT EXISTS streaming_chunks (
    id SERIAL PRIMARY KEY,
    request_id UUID NOT NULL,
    chunk_index INTEGER NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    data TEXT NOT NULL,
    token_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (request_id) REFERENCES api_requests(request_id) ON DELETE CASCADE,
    UNIQUE(request_id, chunk_index)
);

-- Create indexes for api_requests
CREATE INDEX IF NOT EXISTS idx_requests_domain ON api_requests(domain);
CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON api_requests(timestamp);
CREATE INDEX IF NOT EXISTS idx_requests_model ON api_requests(model);
CREATE INDEX IF NOT EXISTS idx_requests_request_type ON api_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_requests_conversation_id ON api_requests(conversation_id);
CREATE INDEX IF NOT EXISTS idx_requests_branch_id ON api_requests(branch_id);
CREATE INDEX IF NOT EXISTS idx_requests_conversation_branch ON api_requests(conversation_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_requests_message_count ON api_requests(message_count);
CREATE INDEX IF NOT EXISTS idx_requests_parent_hash ON api_requests(parent_message_hash);
CREATE INDEX IF NOT EXISTS idx_requests_current_hash ON api_requests(current_message_hash);
CREATE INDEX IF NOT EXISTS idx_requests_account_id ON api_requests(account_id);

-- Performance indexes for window function queries (from migration 004)
CREATE INDEX IF NOT EXISTS idx_requests_conversation_timestamp_id 
ON api_requests(conversation_id, timestamp DESC, request_id DESC) 
WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_requests_conversation_subtask 
ON api_requests(conversation_id, is_subtask, timestamp ASC, request_id ASC) 
WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_requests_request_id 
ON api_requests(request_id);

-- Create index for parent_request_id
CREATE INDEX IF NOT EXISTS idx_api_requests_parent_request_id 
ON api_requests(parent_request_id);

-- Create index for system_hash
CREATE INDEX IF NOT EXISTS idx_api_requests_system_hash 
ON api_requests(system_hash);

-- Create indexes for Task invocation queries (from migration 008)
-- GIN index for faster JSONB searches on response_body
CREATE INDEX IF NOT EXISTS idx_api_requests_response_body_task
ON api_requests USING gin (response_body)
WHERE response_body IS NOT NULL;

-- Composite index for domain + timestamp queries
CREATE INDEX IF NOT EXISTS idx_api_requests_domain_timestamp_response
ON api_requests(domain, timestamp DESC)
WHERE response_body IS NOT NULL;

-- Functional index for faster text searches
CREATE INDEX IF NOT EXISTS idx_api_requests_task_name
ON api_requests ((response_body::text))
WHERE response_body IS NOT NULL 
  AND response_body::text LIKE '%"name":"Task"%';

-- Create indexes for streaming_chunks
CREATE INDEX IF NOT EXISTS idx_chunks_request_id ON streaming_chunks(request_id);

-- Add column comments
COMMENT ON COLUMN api_requests.current_message_hash IS 'SHA-256 hash of the last message in this request';
COMMENT ON COLUMN api_requests.parent_message_hash IS 'SHA-256 hash of the previous message (null for conversation start)';
COMMENT ON COLUMN api_requests.conversation_id IS 'UUID grouping related messages into conversations';
COMMENT ON COLUMN api_requests.branch_id IS 'Branch identifier within a conversation (defaults to main)';
COMMENT ON COLUMN api_requests.message_count IS 'Total number of messages in the conversation up to this request';
COMMENT ON COLUMN api_requests.parent_task_request_id IS 'Links sub-task requests to their parent task';
COMMENT ON COLUMN api_requests.is_subtask IS 'Boolean flag indicating if a request is a sub-task';
COMMENT ON COLUMN api_requests.task_tool_invocation IS 'JSONB array storing Task tool invocations';
COMMENT ON COLUMN api_requests.account_id IS 'Account identifier from credential file for per-account tracking';
COMMENT ON COLUMN api_requests.parent_request_id IS 'UUID of the parent request in the conversation chain, references the immediate parent';
COMMENT ON COLUMN api_requests.system_hash IS 'SHA-256 hash of the system prompt only, separate from message content hash';

-- Create conversation_analyses table for AI-generated analyses
CREATE TABLE IF NOT EXISTS conversation_analyses (
    id VARCHAR(255) PRIMARY KEY,
    conversation_id UUID NOT NULL,
    branch_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    content TEXT,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    
    -- Create a unique index to ensure only one active analysis per conversation branch
    -- (excluding failed analyses which can be retried)
    CONSTRAINT unique_active_analysis EXCLUDE USING btree (
      conversation_id WITH =,
      branch_id WITH =
    ) WHERE (status NOT IN ('failed'))
);

-- Create indexes for conversation_analyses
CREATE INDEX IF NOT EXISTS idx_conversation_analyses_lookup 
ON conversation_analyses(conversation_id, branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_analyses_status 
ON conversation_analyses(status) 
WHERE status IN ('pending', 'processing');