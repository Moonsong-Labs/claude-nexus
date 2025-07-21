# Database Schema Documentation

## Overview

Claude Nexus Proxy uses PostgreSQL to store API request/response data, conversation tracking, token usage metrics, and AI-powered conversation analyses. The database schema is designed for efficient querying, real-time analytics, and scalable operations.

**Key Design Principles:**

- Optimized for time-series queries with comprehensive indexing
- Support for conversation branching and sub-task tracking
- Efficient token usage tracking per account and domain
- AI analysis infrastructure for automated insights
- Idempotent schema management for safe deployments

## Tables

### api_requests

The main table storing all API requests and responses with comprehensive tracking metadata.

| Column                      | Type         | Description                                  |
| --------------------------- | ------------ | -------------------------------------------- |
| request_id                  | UUID         | Primary key, unique request identifier       |
| domain                      | VARCHAR(255) | Domain name from Host header                 |
| account_id                  | VARCHAR(255) | Account identifier from credential file      |
| timestamp                   | TIMESTAMPTZ  | Request timestamp                            |
| method                      | VARCHAR(10)  | HTTP method (always POST for Claude)         |
| path                        | VARCHAR(255) | API path (e.g., /v1/messages)                |
| headers                     | JSONB        | Request headers (sanitized)                  |
| body                        | JSONB        | Request body                                 |
| api_key_hash                | VARCHAR(50)  | Hashed API key for security                  |
| model                       | VARCHAR(100) | Claude model name                            |
| request_type                | VARCHAR(50)  | Type: inference, query_evaluation, or quota  |
| response_status             | INTEGER      | HTTP response status code                    |
| response_headers            | JSONB        | Response headers                             |
| response_body               | JSONB        | Response body                                |
| response_streaming          | BOOLEAN      | Whether response was streamed                |
| input_tokens                | INTEGER      | Input token count                            |
| output_tokens               | INTEGER      | Output token count                           |
| total_tokens                | INTEGER      | Total tokens (input + output)                |
| cache_creation_input_tokens | INTEGER      | Cache creation tokens                        |
| cache_read_input_tokens     | INTEGER      | Cache read tokens                            |
| usage_data                  | JSONB        | Additional usage metadata                    |
| first_token_ms              | INTEGER      | Time to first token (streaming)              |
| duration_ms                 | INTEGER      | Total request duration                       |
| error                       | TEXT         | Error message if request failed              |
| tool_call_count             | INTEGER      | Number of tool calls in response             |
| current_message_hash        | CHAR(64)     | SHA-256 hash of last message                 |
| parent_message_hash         | CHAR(64)     | SHA-256 hash of previous message             |
| conversation_id             | UUID         | Groups messages into conversations           |
| branch_id                   | VARCHAR(255) | Branch within conversation (default: 'main') |
| message_count               | INTEGER      | Total messages in conversation               |
| parent_task_request_id      | UUID         | Links sub-task requests to parent task       |
| is_subtask                  | BOOLEAN      | Indicates if request is a sub-task           |
| task_tool_invocation        | JSONB        | Task tool invocation details                 |
| created_at                  | TIMESTAMPTZ  | Record creation timestamp                    |
| system_hash                 | VARCHAR(64)  | SHA-256 hash of system prompt only           |
| parent_request_id           | UUID         | Direct parent request reference              |

### streaming_chunks

Stores individual chunks from streaming responses.

| Column      | Type        | Description                 |
| ----------- | ----------- | --------------------------- |
| id          | SERIAL      | Primary key                 |
| request_id  | UUID        | Foreign key to api_requests |
| chunk_index | INTEGER     | Chunk sequence number       |
| timestamp   | TIMESTAMPTZ | Chunk timestamp             |
| data        | TEXT        | Chunk data                  |
| token_count | INTEGER     | Tokens in this chunk        |
| created_at  | TIMESTAMPTZ | Record creation timestamp   |

### conversation_analyses

Stores AI-generated analyses of conversations.

| Column                 | Type                         | Description                                             |
| ---------------------- | ---------------------------- | ------------------------------------------------------- |
| id                     | BIGSERIAL                    | Primary key                                             |
| conversation_id        | UUID                         | UUID of the conversation being analyzed                 |
| branch_id              | VARCHAR(255)                 | Branch within conversation (default: 'main')            |
| status                 | conversation_analysis_status | Processing status (pending/processing/completed/failed) |
| model_used             | VARCHAR(255)                 | AI model used (default: 'gemini-2.5-pro')               |
| analysis_content       | TEXT                         | Human-readable analysis text                            |
| analysis_data          | JSONB                        | Structured analysis data in JSON format                 |
| raw_response           | JSONB                        | Complete raw response from the AI model                 |
| error_message          | TEXT                         | Error details if analysis failed                        |
| retry_count            | INTEGER                      | Number of retry attempts (default: 0)                   |
| generated_at           | TIMESTAMPTZ                  | Timestamp when analysis was completed                   |
| processing_duration_ms | INTEGER                      | Time taken to generate analysis in milliseconds         |
| prompt_tokens          | INTEGER                      | Number of tokens used in the prompt                     |
| completion_tokens      | INTEGER                      | Number of tokens in the completion                      |
| created_at             | TIMESTAMPTZ                  | Record creation timestamp                               |
| updated_at             | TIMESTAMPTZ                  | Last update timestamp (auto-updated)                    |
| completed_at           | TIMESTAMPTZ                  | Timestamp when analysis was completed                   |
| custom_prompt          | TEXT                         | Optional custom prompt for targeted analysis            |

### analysis_audit_log

Audit log for AI analysis operations to track all events and changes.

| Column          | Type         | Description                                        |
| --------------- | ------------ | -------------------------------------------------- |
| id              | BIGSERIAL    | Primary key                                        |
| timestamp       | TIMESTAMPTZ  | Event timestamp                                    |
| conversation_id | UUID         | Related conversation UUID                          |
| branch_id       | VARCHAR(255) | Related branch identifier                          |
| action          | VARCHAR(50)  | Action performed (create, process, complete, fail) |
| actor           | VARCHAR(255) | System component or user performing action         |
| details         | JSONB        | Additional event details and metadata              |
| analysis_id     | BIGINT       | Reference to conversation_analyses.id              |

## Indexes

The database uses strategic indexing for optimal query performance. Indexes are grouped by their primary use case.

### Core Performance Indexes

**api_requests table:**

- `idx_api_requests_domain` - Filter by domain for multi-tenant queries
- `idx_api_requests_timestamp` - Time-based queries and sorting
- `idx_api_requests_model` - Filter by Claude model version
- `idx_api_requests_request_type` - Differentiate inference/evaluation/quota requests
- `idx_api_requests_account_id` - Per-account usage tracking
- `idx_api_requests_request_id` - Primary key lookups (implicit via PRIMARY KEY)
- `idx_api_requests_domain_timestamp_response` - Composite index for domain + time queries where response exists

### Conversation Tracking Indexes

**Message linking and branch management:**

- `idx_api_requests_conversation_id` - Group messages by conversation
- `idx_api_requests_branch_id` - Filter by conversation branch
- `idx_api_requests_conversation_branch` - Composite index for conversation + branch queries
- `idx_api_requests_current_hash` - Find messages by their content hash
- `idx_api_requests_parent_hash` - Trace message lineage
- `idx_api_requests_parent_request_id` - Direct parent-child request linking
- `idx_api_requests_system_hash` - Track system prompt changes

**Window function optimization:**

- `idx_api_requests_conversation_timestamp_id` - Optimizes ORDER BY in conversation queries
- `idx_api_requests_conversation_subtask` - Efficient sub-task ordering within conversations

### Sub-task Tracking Indexes

**Task tool integration:**

- `idx_api_requests_parent_task_request_id` - Find all sub-tasks of a parent
- `idx_api_requests_is_subtask` - Quick filtering of sub-task requests
- `idx_api_requests_response_body_gin` - GIN index for efficient JSONB containment queries

### Streaming Indexes

**streaming_chunks table:**

- `idx_streaming_chunks_request_id` - Retrieve chunks for a specific request
- Unique constraint on (request_id, chunk_index) ensures ordering

### AI Analysis Indexes

**conversation_analyses table:**

- `idx_conversation_analyses_status` - Partial index on 'pending' for queue processing
- `idx_conversation_analyses_conversation` - Composite (conversation_id, branch_id) for lookups
- Unique constraint on (conversation_id, branch_id) prevents duplicate analyses

**analysis_audit_log table:**

- `idx_analysis_audit_log_conversation` - Find all events for a conversation
- `idx_analysis_audit_log_timestamp` - Time-based audit queries
- `idx_analysis_audit_log_analysis_id` - Link audit events to analyses

## Key Features

### Account-Based Token Tracking

The `account_id` column enables tracking token usage per account rather than just per domain. This allows:

- Multiple domains to share the same Claude account
- Accurate tracking against Claude's 140,000 token per 5-hour window limit
- Per-account usage dashboards and alerts

### Conversation Tracking

Messages are automatically linked into conversations using:

- `current_message_hash` - SHA-256 hash of the last message in the request
- `parent_message_hash` - Hash of the previous message (null for first message)
- `conversation_id` - UUID grouping all related messages
- `branch_id` - Supports conversation branching when resuming from earlier points

### Sub-task Tracking

Sub-tasks spawned via Claude's Task tool are automatically detected and linked:

- `parent_task_request_id` - Links sub-tasks to their parent request
- `is_subtask` - Boolean flag for quick sub-task filtering
- `task_tool_invocation` - Stores Task tool details (prompt, description, linked conversation)
- Automatic linking based on prompt matching within 30-second window
- GIN index enables efficient queries on JSONB task data

### Request Types

The `request_type` column categorizes requests:

- `inference` - Normal Claude API calls (2+ system messages)
- `query_evaluation` - Special evaluation requests (0-1 system messages)
- `quota` - Quota check requests (user message = "quota")

### AI-Powered Conversation Analysis

The `conversation_analyses` table enables automated analysis of conversations using AI models:

- **Status Tracking**: ENUM type ensures only valid status values (pending, processing, completed, failed)
- **Automatic Timestamps**: `updated_at` field automatically updates via trigger
- **Unique Analyses**: UNIQUE constraint on (conversation_id, branch_id) prevents duplicates
- **Token Tracking**: Monitors API usage for cost management
- **Error Handling**: Tracks retry attempts and error messages for failed analyses
- **Model Flexibility**: Supports different AI models through the `model_used` field

## Common Queries

### Operational Monitoring

#### Check Current Token Usage Against Claude Limits

```sql
-- Monitor accounts approaching the 140,000 token/5-hour limit
WITH usage_window AS (
  SELECT
    account_id,
    SUM(output_tokens) as tokens_used,
    COUNT(*) as requests,
    MAX(timestamp) as last_request
  FROM api_requests
  WHERE timestamp > NOW() - INTERVAL '5 hours'
    AND request_type = 'inference'
  GROUP BY account_id
)
SELECT
  account_id,
  tokens_used,
  requests,
  ROUND(tokens_used::numeric / 140000 * 100, 2) as percent_of_limit,
  last_request
FROM usage_window
WHERE tokens_used > 100000  -- Alert when >71% of limit
ORDER BY percent_of_limit DESC;
```

#### Find Expensive Conversations

```sql
-- Identify conversations consuming excessive tokens
SELECT
  conversation_id,
  branch_id,
  COUNT(*) as message_count,
  SUM(total_tokens) as total_tokens,
  AVG(total_tokens) as avg_tokens_per_message,
  MAX(timestamp) - MIN(timestamp) as duration,
  STRING_AGG(DISTINCT model, ', ') as models_used
FROM api_requests
WHERE conversation_id IS NOT NULL
  AND timestamp > NOW() - INTERVAL '24 hours'
GROUP BY conversation_id, branch_id
HAVING SUM(total_tokens) > 50000
ORDER BY total_tokens DESC
LIMIT 20;
```

### Performance Analysis

#### Slowest Requests by Model

```sql
-- Identify performance bottlenecks
SELECT
  model,
  path,
  duration_ms,
  first_token_ms,
  total_tokens,
  timestamp,
  CASE
    WHEN response_streaming THEN 'streaming'
    ELSE 'non-streaming'
  END as response_type
FROM api_requests
WHERE duration_ms > 10000  -- Requests taking >10 seconds
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY duration_ms DESC
LIMIT 20;
```

### Conversation Analytics

#### Active Conversations with Sub-tasks

```sql
-- Find conversations with active sub-task spawning
WITH conversation_stats AS (
  SELECT
    conversation_id,
    COUNT(*) FILTER (WHERE is_subtask = false) as main_messages,
    COUNT(*) FILTER (WHERE is_subtask = true) as subtask_messages,
    COUNT(DISTINCT parent_task_request_id) as unique_subtasks
  FROM api_requests
  WHERE conversation_id IS NOT NULL
    AND timestamp > NOW() - INTERVAL '6 hours'
  GROUP BY conversation_id
)
SELECT
  c.*,
  ar.domain,
  ar.account_id,
  MAX(ar.timestamp) as last_activity
FROM conversation_stats c
JOIN api_requests ar ON ar.conversation_id = c.conversation_id
WHERE c.subtask_messages > 0
GROUP BY c.conversation_id, c.main_messages, c.subtask_messages,
         c.unique_subtasks, ar.domain, ar.account_id
ORDER BY last_activity DESC;
```

### Daily Operational Report

```sql
-- Comprehensive daily statistics for operations dashboard
WITH daily_stats AS (
  SELECT
    DATE(timestamp) as date,
    account_id,
    domain,
    model,
    request_type,
    COUNT(*) as requests,
    SUM(input_tokens) as input_tokens,
    SUM(output_tokens) as output_tokens,
    SUM(cache_read_input_tokens) as cache_hits,
    AVG(duration_ms) as avg_duration_ms,
    COUNT(*) FILTER (WHERE error IS NOT NULL) as errors
  FROM api_requests
  WHERE timestamp >= CURRENT_DATE - INTERVAL '7 days'
  GROUP BY DATE(timestamp), account_id, domain, model, request_type
)
SELECT
  date,
  account_id,
  domain,
  SUM(requests) as total_requests,
  SUM(input_tokens + output_tokens) as total_tokens,
  ROUND(SUM(cache_hits)::numeric / NULLIF(SUM(input_tokens), 0) * 100, 2) as cache_hit_rate,
  ROUND(AVG(avg_duration_ms)) as avg_response_time,
  SUM(errors) as total_errors,
  ROUND(SUM(errors)::numeric / SUM(requests) * 100, 2) as error_rate
FROM daily_stats
GROUP BY date, account_id, domain
ORDER BY date DESC, total_tokens DESC;
```

### Sub-task Analysis

#### Trace Sub-task Execution Tree

```sql
-- Visualize the complete sub-task hierarchy
WITH RECURSIVE task_tree AS (
  -- Base: Find root tasks that spawn sub-tasks
  SELECT
    request_id,
    conversation_id,
    timestamp,
    model,
    total_tokens,
    0 as depth,
    ARRAY[request_id] as path
  FROM api_requests
  WHERE task_tool_invocation IS NOT NULL
    AND is_subtask = false
    AND timestamp > NOW() - INTERVAL '24 hours'

  UNION ALL

  -- Recursive: Find sub-tasks
  SELECT
    ar.request_id,
    ar.conversation_id,
    ar.timestamp,
    ar.model,
    ar.total_tokens,
    tt.depth + 1,
    tt.path || ar.request_id
  FROM api_requests ar
  JOIN task_tree tt ON ar.parent_task_request_id = tt.request_id
)
SELECT
  depth,
  repeat('  ', depth) || conversation_id as visual_tree,
  model,
  total_tokens,
  timestamp
FROM task_tree
ORDER BY path;
```

#### Find Task Tool Invocations

```sql
-- Use GIN index for efficient Task tool queries
SELECT
  request_id,
  timestamp,
  jsonb_path_query(response_body,
    '$.content[*] ? (@.type == "tool_use" && @.name == "Task").input.prompt'
  ) as task_prompt,
  total_tokens
FROM api_requests
WHERE response_body @> '{
  "content": [{
    "type": "tool_use",
    "name": "Task"
  }]
}'
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC;
```

### AI Analysis Monitoring

#### Worker Queue Management

```sql
-- Monitor analysis queue health
WITH queue_stats AS (
  SELECT
    status,
    COUNT(*) as count,
    MIN(created_at) as oldest,
    MAX(created_at) as newest
  FROM conversation_analyses
  GROUP BY status
)
SELECT
  status,
  count,
  CASE
    WHEN status = 'pending' THEN NOW() - oldest
    ELSE NULL
  END as oldest_pending_age,
  CASE
    WHEN status = 'processing' AND NOW() - newest > INTERVAL '5 minutes'
    THEN 'STUCK - check worker'
    ELSE 'OK'
  END as health_check
FROM queue_stats
ORDER BY
  CASE status
    WHEN 'processing' THEN 1
    WHEN 'pending' THEN 2
    WHEN 'failed' THEN 3
    WHEN 'completed' THEN 4
  END;
```

#### Analysis Cost Tracking

```sql
-- Track AI analysis costs by day
SELECT
  DATE(generated_at) as date,
  model_used,
  COUNT(*) as analyses,
  SUM(prompt_tokens) as total_prompt_tokens,
  SUM(completion_tokens) as total_completion_tokens,
  -- Gemini pricing estimates (adjust as needed)
  ROUND(SUM(prompt_tokens) * 0.000001 +
        SUM(completion_tokens) * 0.000003, 4) as estimated_cost_usd,
  ROUND(AVG(processing_duration_ms) / 1000.0, 2) as avg_duration_seconds
FROM conversation_analyses
WHERE status = 'completed'
  AND generated_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(generated_at), model_used
ORDER BY date DESC;
```

#### Failed Analysis Investigation

```sql
-- Investigate failed analyses for debugging
SELECT
  ca.conversation_id,
  ca.branch_id,
  ca.error_message,
  ca.retry_count,
  ca.created_at,
  ca.updated_at,
  ar.message_count,
  ar.total_tokens as conversation_tokens
FROM conversation_analyses ca
JOIN (
  SELECT
    conversation_id,
    branch_id,
    COUNT(*) as message_count,
    SUM(total_tokens) as total_tokens
  FROM api_requests
  GROUP BY conversation_id, branch_id
) ar ON ar.conversation_id = ca.conversation_id
     AND ar.branch_id = ca.branch_id
WHERE ca.status = 'failed'
  AND ca.created_at > NOW() - INTERVAL '24 hours'
ORDER BY ca.updated_at DESC;
```

## Schema Evolution

The database schema follows a hybrid approach documented in [ADR-012: Database Schema Evolution](../04-Architecture/ADRs/adr-012-database-schema-evolution.md):

### Installation Strategies

#### Fresh Installation (Recommended for new deployments)

```bash
# Create complete schema with all current features
psql $DATABASE_URL -f scripts/init-database.sql
```

#### Upgrade Existing Database

```bash
# Run all migrations in sequence
for file in scripts/db/migrations/*.ts; do
  bun run "$file"
done

# Or run specific migrations
bun run scripts/db/migrations/011-add-conversation-analyses.ts
```

### Migration Inventory

| Migration | Purpose                  | Key Changes                        |
| --------- | ------------------------ | ---------------------------------- |
| 000       | Initial setup            | Base tables and indexes            |
| 001       | Conversation tracking    | Message hashing and linking        |
| 002       | Performance optimization | Strategic index additions          |
| 003       | Sub-task tracking        | Task tool detection infrastructure |
| 004       | Window functions         | Optimized conversation queries     |
| 005       | Account population       | Backfill account_id from domains   |
| 006       | Hash separation          | Split system/message hashes        |
| 007       | Parent linking           | Direct request parent references   |
| 008       | Task optimization        | GIN indexes for JSONB queries      |
| 009       | Response body index      | Full JSONB indexing                |
| 010       | Temporal indexes         | Time-based query optimization      |
| 011       | AI analysis              | Analysis tables and audit log      |

### Migration Best Practices

1. **Always backup before migrations**

   ```bash
   pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Test migrations in staging first**
   - Use a copy of production data
   - Verify query performance after indexes
   - Check application compatibility

3. **Monitor during migration**
   - Watch for lock contention
   - Track migration duration
   - Verify data integrity

4. **Rollback capability**
   - Each migration includes rollback functions
   - Test rollbacks in staging
   - Document dependencies

## Operational Guidelines

### Performance Tuning

#### PostgreSQL Configuration

```sql
-- Recommended settings for production
-- Add to postgresql.conf or set per database

-- Memory settings (adjust based on available RAM)
shared_buffers = '4GB'
effective_cache_size = '12GB'
work_mem = '64MB'
maintenance_work_mem = '512MB'

-- Query planning
random_page_cost = 1.1  -- For SSD storage
effective_io_concurrency = 200

-- Monitoring
log_min_duration_statement = 1000  -- Log queries >1s
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
```

#### Regular Maintenance Tasks

```bash
# Daily maintenance script
#!/bin/bash

# Update table statistics
psql $DATABASE_URL -c "ANALYZE api_requests;"
psql $DATABASE_URL -c "ANALYZE conversation_analyses;"

# Clean up old streaming chunks (>30 days)
psql $DATABASE_URL -c "
  DELETE FROM streaming_chunks
  WHERE created_at < NOW() - INTERVAL '30 days';
"

# Archive completed analyses (>90 days)
psql $DATABASE_URL -c "
  INSERT INTO analysis_audit_log (timestamp, action, details)
  SELECT NOW(), 'archive', jsonb_build_object(
    'archived_count', COUNT(*),
    'date_range', jsonb_build_object(
      'from', MIN(created_at),
      'to', MAX(created_at)
    )
  )
  FROM conversation_analyses
  WHERE status = 'completed'
    AND created_at < NOW() - INTERVAL '90 days';
"
```

### Monitoring Queries

#### Database Health Check

```sql
-- Check table sizes and bloat
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
  n_live_tup as row_count,
  n_dead_tup as dead_rows,
  ROUND(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 2) as bloat_percent
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

#### Index Usage Analysis

```sql
-- Find unused indexes
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan < 100
  AND indexname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Scaling Considerations

1. **Partitioning Strategy** (for >100M rows)
   - Partition `api_requests` by month
   - Partition `streaming_chunks` by request timestamp
   - Keep recent partitions on fast storage

2. **Read Replicas**
   - Dashboard queries on read replica
   - Separate analytics workload
   - Real-time queries on primary

3. **Connection Pooling**
   - Use PgBouncer for connection multiplexing
   - Set appropriate pool sizes
   - Monitor connection usage

### Backup Strategy

```bash
# Continuous archiving with WAL-G
wal-g backup-push $PGDATA

# Point-in-time recovery
wal-g backup-fetch LATEST
```

### Troubleshooting

#### Common Issues

1. **Slow conversation queries**
   - Check `message_count` column is populated
   - Verify window function indexes exist
   - Consider increasing work_mem

2. **High storage usage**
   - Archive old streaming_chunks
   - Compress response_body with TOAST
   - Implement data retention policies

3. **Lock contention**
   - Use CONCURRENTLY for index creation
   - Schedule maintenance during low traffic
   - Monitor pg_locks during migrations
