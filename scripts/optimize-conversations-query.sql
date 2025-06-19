-- Optimization script for the slow conversations query

-- 1. Create a composite index for the conversation query
CREATE INDEX IF NOT EXISTS idx_requests_conversation_timestamp 
ON api_requests(conversation_id, timestamp) 
WHERE conversation_id IS NOT NULL;

-- 2. Create covering index with commonly needed fields
CREATE INDEX IF NOT EXISTS idx_requests_conversation_detail
ON api_requests(conversation_id, timestamp, request_id, domain, model, total_tokens, branch_id) 
WHERE conversation_id IS NOT NULL;

-- 3. Analyze the table to update statistics
ANALYZE api_requests;

-- 4. Check current indexes
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'api_requests'
ORDER BY indexname;

-- 5. Check table statistics
SELECT 
    schemaname,
    tablename,
    n_live_tup as row_count,
    n_dead_tup as dead_rows,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE tablename = 'api_requests';