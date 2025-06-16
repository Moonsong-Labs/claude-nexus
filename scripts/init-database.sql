-- Create api_requests table for storing API requests and responses
CREATE TABLE IF NOT EXISTS api_requests (
  request_id UUID PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  domain VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  path VARCHAR(1024) NOT NULL,
  headers JSONB NOT NULL,
  body JSONB,
  request_type VARCHAR(50),
  api_key_id VARCHAR(50),
  model VARCHAR(100),
  ip_address VARCHAR(45),
  response_status INTEGER,
  response_headers JSONB,
  response_body JSONB,
  response_streaming BOOLEAN DEFAULT FALSE,
  duration_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_creation_input_tokens INTEGER DEFAULT 0,
  cache_read_input_tokens INTEGER DEFAULT 0,
  usage_data JSONB,
  tool_call_count INTEGER DEFAULT 0,
  error TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_api_requests_domain ON api_requests(domain);
CREATE INDEX IF NOT EXISTS idx_api_requests_timestamp ON api_requests(timestamp);
CREATE INDEX IF NOT EXISTS idx_api_requests_model ON api_requests(model);
CREATE INDEX IF NOT EXISTS idx_api_requests_request_type ON api_requests(request_type);

-- Create streaming_chunks table for SSE responses
CREATE TABLE IF NOT EXISTS streaming_chunks (
  id SERIAL PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES api_requests(request_id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  data TEXT NOT NULL,
  token_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(request_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_streaming_chunks_request_id ON streaming_chunks(request_id, chunk_index);

-- Create materialized view for dashboard stats (optional, for performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_stats AS
SELECT 
  DATE_TRUNC('hour', timestamp) as hour,
  domain,
  model,
  COUNT(*) as request_count,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(cache_creation_input_tokens) as total_cache_creation_tokens,
  SUM(cache_read_input_tokens) as total_cache_read_tokens,
  AVG(duration_ms) as avg_response_time,
  SUM(tool_call_count) as total_tool_calls
FROM api_requests
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', timestamp), domain, model;

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_hourly_stats_hour_domain ON hourly_stats(hour DESC, domain);

-- Function to refresh stats (can be called periodically)
CREATE OR REPLACE FUNCTION refresh_hourly_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_stats;
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON TABLE api_requests IS 'Stores all API requests and responses for the Claude proxy';
COMMENT ON TABLE streaming_chunks IS 'Stores individual chunks from streaming responses';
COMMENT ON MATERIALIZED VIEW hourly_stats IS 'Pre-aggregated hourly statistics for dashboard performance';
COMMENT ON COLUMN api_requests.cache_creation_input_tokens IS 'Number of tokens written to cache';
COMMENT ON COLUMN api_requests.cache_read_input_tokens IS 'Number of tokens read from cache';
COMMENT ON COLUMN api_requests.usage_data IS 'Complete usage object from Claude API response';
COMMENT ON COLUMN api_requests.tool_call_count IS 'Number of tool calls in the response';