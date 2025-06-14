-- Create requests table for storing API requests and responses
CREATE TABLE IF NOT EXISTS requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  domain VARCHAR(255),
  path VARCHAR(255),
  method VARCHAR(10),
  headers JSONB,
  request_body JSONB,
  response_status INTEGER,
  response_headers JSONB,
  response_body JSONB,
  response_time_ms INTEGER,
  error TEXT,
  api_key_masked VARCHAR(255),
  model VARCHAR(100),
  input_tokens INTEGER,
  output_tokens INTEGER,
  stream BOOLEAN DEFAULT FALSE,
  request_type VARCHAR(50),
  tool_call_count INTEGER DEFAULT 0
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_requests_domain_timestamp ON requests(domain, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_requests_request_id ON requests(request_id);
CREATE INDEX IF NOT EXISTS idx_requests_model ON requests(model);

-- Create streaming_chunks table for SSE responses
CREATE TABLE IF NOT EXISTS streaming_chunks (
  id BIGSERIAL PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES requests(request_id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_data TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_streaming_chunks_request_id ON streaming_chunks(request_id);

-- Create materialized view for dashboard stats (optional, for performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_stats AS
SELECT 
  DATE_TRUNC('hour', timestamp) as hour,
  domain,
  model,
  COUNT(*) as request_count,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  AVG(response_time_ms) as avg_response_time,
  SUM(tool_call_count) as total_tool_calls
FROM requests
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

-- Add comment
COMMENT ON TABLE requests IS 'Stores all API requests and responses for the Claude proxy';
COMMENT ON TABLE streaming_chunks IS 'Stores individual chunks from streaming responses';
COMMENT ON MATERIALIZED VIEW hourly_stats IS 'Pre-aggregated hourly statistics for dashboard performance';