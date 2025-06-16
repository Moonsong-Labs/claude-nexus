-- Fix column naming inconsistencies

-- Check if tool_calls exists and rename it to tool_call_count
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name='api_requests' 
    AND column_name='tool_calls'
  ) THEN
    ALTER TABLE api_requests RENAME COLUMN tool_calls TO tool_call_count;
  END IF;
END $$;

-- Add tool_call_count if it doesn't exist
ALTER TABLE api_requests
  ADD COLUMN IF NOT EXISTS tool_call_count INTEGER DEFAULT 0;

-- Add ip_address column if missing
ALTER TABLE api_requests
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);

-- Add api_key_id column if missing  
ALTER TABLE api_requests
  ADD COLUMN IF NOT EXISTS api_key_id VARCHAR(50);

-- Recreate the materialized view with correct column name
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
  SUM(tool_call_count) as total_tool_calls,
  -- Calculate effective input tokens (non-cached)
  SUM(COALESCE(input_tokens, 0) - COALESCE(cache_read_input_tokens, 0)) as total_non_cached_input_tokens
FROM api_requests
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', timestamp), domain, model;

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_hourly_stats_hour_domain ON hourly_stats(hour DESC, domain);

-- Add comments
COMMENT ON COLUMN api_requests.tool_call_count IS 'Number of tool calls in the response';