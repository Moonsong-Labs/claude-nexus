-- Migration to add full usage data fields to api_requests table

-- Add new columns for complete usage data
ALTER TABLE api_requests
  ADD COLUMN IF NOT EXISTS cache_creation_input_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS cache_read_input_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS usage_data JSONB;

-- Add comment for new columns
COMMENT ON COLUMN api_requests.cache_creation_input_tokens IS 'Number of tokens written to cache';
COMMENT ON COLUMN api_requests.cache_read_input_tokens IS 'Number of tokens read from cache';
COMMENT ON COLUMN api_requests.usage_data IS 'Complete usage object from Claude API response';

-- Update materialized view to include cache tokens
DROP MATERIALIZED VIEW IF EXISTS hourly_stats;

CREATE MATERIALIZED VIEW hourly_stats AS
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
  SUM(tool_calls) as total_tool_calls,
  -- Calculate effective input tokens (non-cached)
  SUM(COALESCE(input_tokens, 0) - COALESCE(cache_read_input_tokens, 0)) as total_non_cached_input_tokens
FROM api_requests
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', timestamp), domain, model;

-- Recreate index on materialized view
CREATE INDEX IF NOT EXISTS idx_hourly_stats_hour_domain ON hourly_stats(hour DESC, domain);

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_api_requests_cache_creation ON api_requests(cache_creation_input_tokens) WHERE cache_creation_input_tokens > 0;
CREATE INDEX IF NOT EXISTS idx_api_requests_cache_read ON api_requests(cache_read_input_tokens) WHERE cache_read_input_tokens > 0;