/**
 * SQL Queries for API routes
 */

export const API_QUERIES = {
  // Stats queries
  STATS_BASE: `
    SELECT
      COUNT(*) as total_requests,
      COALESCE(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)), 0) as total_tokens,
      COALESCE(SUM(input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(output_tokens), 0) as total_output_tokens,
      COALESCE(SUM(cache_creation_input_tokens), 0) as total_cache_creation_tokens,
      COALESCE(SUM(cache_read_input_tokens), 0) as total_cache_read_tokens,
      COALESCE(AVG(duration_ms), 0) as avg_response_time,
      COUNT(*) FILTER (WHERE error IS NOT NULL) as error_count,
      COUNT(DISTINCT domain) as active_domains
    FROM api_requests
  `,

  STATS_BY_MODEL: `
    SELECT model, COUNT(*) as count
    FROM api_requests
    GROUP BY model
    ORDER BY count DESC
  `,

  STATS_BY_TYPE: `
    SELECT request_type, COUNT(*) as count
    FROM api_requests
    AND request_type IS NOT NULL
    GROUP BY request_type
    ORDER BY count DESC
  `,

  // Request queries
  REQUESTS_LIST: `
    SELECT 
      request_id,
      domain,
      model,
      timestamp,
      COALESCE(input_tokens, 0) as input_tokens,
      COALESCE(output_tokens, 0) as output_tokens,
      COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) as total_tokens,
      COALESCE(duration_ms, 0) as duration_ms,
      COALESCE(response_status, 0) as response_status,
      error,
      request_type
    FROM api_requests
    ORDER BY timestamp DESC
  `,

  REQUEST_DETAILS: `
    SELECT 
      request_id,
      domain,
      model,
      timestamp,
      COALESCE(input_tokens, 0) as input_tokens,
      COALESCE(output_tokens, 0) as output_tokens,
      COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) as total_tokens,
      COALESCE(duration_ms, 0) as duration_ms,
      COALESCE(response_status, 0) as response_status,
      error,
      request_type,
      conversation_id,
      branch_id,
      parent_request_id,
      body as request_body,
      response_body,
      usage_data
    FROM api_requests 
    WHERE request_id = $1
  `,

  STREAMING_CHUNKS: `
    SELECT chunk_index, timestamp, data
    FROM streaming_chunks 
    WHERE request_id = $1 
    ORDER BY chunk_index
  `,

  // Domain queries
  ACTIVE_DOMAINS: (days: number) => `
    SELECT DISTINCT domain, COUNT(*) as request_count
    FROM api_requests
    WHERE timestamp > NOW() - INTERVAL '${days} days'
    GROUP BY domain
    ORDER BY request_count DESC
  `,

  // Conversation queries
  CONVERSATIONS_WITH_STATS: `
    WITH ranked_requests AS (
      -- Get all requests with ranking for latest request and first subtask per conversation
      SELECT 
        request_id,
        conversation_id,
        domain,
        account_id,
        timestamp,
        input_tokens,
        output_tokens,
        branch_id,
        model,
        is_subtask,
        parent_task_request_id,
        response_body,
        ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY timestamp DESC, request_id DESC) as rn,
        ROW_NUMBER() OVER (PARTITION BY conversation_id, is_subtask ORDER BY timestamp ASC, request_id ASC) as subtask_rn
      FROM api_requests
      WHERE conversation_id IS NOT NULL
    ),
    conversation_summary AS (
      -- Aggregate conversation data including latest request info
      SELECT 
        conversation_id,
        domain,
        account_id,
        MIN(timestamp) as first_message_time,
        MAX(timestamp) as last_message_time,
        COUNT(*) as message_count,
        SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) as total_tokens,
        COUNT(DISTINCT branch_id) as branch_count,
        -- Add branch type counts for the new feature
        COUNT(DISTINCT branch_id) FILTER (WHERE branch_id LIKE 'subtask_%') as subtask_branch_count,
        COUNT(DISTINCT branch_id) FILTER (WHERE branch_id LIKE 'compact_%') as compact_branch_count,
        COUNT(DISTINCT branch_id) FILTER (WHERE branch_id IS NOT NULL AND branch_id NOT LIKE 'subtask_%' AND branch_id NOT LIKE 'compact_%' AND branch_id != 'main') as user_branch_count,
        ARRAY_AGG(DISTINCT model) FILTER (WHERE model IS NOT NULL) as models_used,
        (array_agg(request_id ORDER BY rn) FILTER (WHERE rn = 1))[1] as latest_request_id,
        (array_agg(model ORDER BY rn) FILTER (WHERE rn = 1))[1] as latest_model,
        (array_agg(response_body ORDER BY rn) FILTER (WHERE rn = 1))[1] as latest_response_body,
        BOOL_OR(is_subtask) as is_subtask,
        -- Get the parent_task_request_id from the first subtask in the conversation
        (array_agg(parent_task_request_id ORDER BY subtask_rn) FILTER (WHERE is_subtask = true AND subtask_rn = 1))[1] as parent_task_request_id,
        COUNT(CASE WHEN is_subtask THEN 1 END) as subtask_message_count
      FROM ranked_requests
      GROUP BY conversation_id, domain, account_id
    )
    SELECT 
      cs.*,
      parent_req.conversation_id as parent_conversation_id
    FROM conversation_summary cs
    LEFT JOIN api_requests parent_req ON cs.parent_task_request_id = parent_req.request_id
    ORDER BY last_message_time DESC
  `,

  // Token usage queries
  TOKEN_USAGE_TIME_SERIES: `
    WITH time_buckets AS (
      SELECT 
        generate_series(
          NOW() - ($2 * INTERVAL '1 hour'),
          NOW(),
          $3 * INTERVAL '1 minute'
        ) AS bucket_time
    )
    SELECT 
      tb.bucket_time,
      (
        SELECT COALESCE(SUM(output_tokens), 0)
        FROM api_requests
        WHERE account_id = $1
          AND timestamp > tb.bucket_time - ($2 * INTERVAL '1 hour')
          AND timestamp <= tb.bucket_time
      ) AS cumulative_output_tokens
    FROM time_buckets tb
    ORDER BY tb.bucket_time ASC
  `,

  TOKEN_USAGE_ACCOUNTS: `
    WITH account_usage AS (
      SELECT 
        account_id,
        SUM(output_tokens) as total_output_tokens,
        SUM(input_tokens) as total_input_tokens,
        COUNT(*) as request_count,
        MAX(timestamp) as last_request_time
      FROM api_requests
      WHERE account_id IS NOT NULL
        AND timestamp >= NOW() - INTERVAL '5 hours'
      GROUP BY account_id
    ),
    domain_usage AS (
      SELECT 
        account_id,
        domain,
        SUM(output_tokens) as domain_output_tokens,
        COUNT(*) as domain_requests
      FROM api_requests
      WHERE account_id IS NOT NULL
        AND timestamp >= NOW() - INTERVAL '5 hours'
      GROUP BY account_id, domain
    )
    SELECT 
      au.account_id,
      au.total_output_tokens,
      au.total_input_tokens,
      au.request_count,
      au.last_request_time,
      COALESCE(
        json_agg(
          json_build_object(
            'domain', du.domain,
            'outputTokens', du.domain_output_tokens,
            'requests', du.domain_requests
          ) ORDER BY du.domain_output_tokens DESC
        ) FILTER (WHERE du.domain IS NOT NULL),
        '[]'::json
      ) as domains
    FROM account_usage au
    LEFT JOIN domain_usage du ON au.account_id = du.account_id
    GROUP BY au.account_id, au.total_output_tokens, au.total_input_tokens, 
             au.request_count, au.last_request_time
    ORDER BY au.total_output_tokens DESC
  `,

  TOKEN_USAGE_ACCOUNTS_TIME_SERIES: (intervalMinutes: number) => `
    WITH time_buckets AS (
      SELECT 
        generate_series(
          NOW() - INTERVAL '5 hours',
          NOW(),
          INTERVAL '${intervalMinutes} minutes'
        ) AS bucket_time
    ),
    account_cumulative AS (
      SELECT 
        au.account_id,
        tb.bucket_time,
        COALESCE(
          SUM(ar.output_tokens) FILTER (
            WHERE ar.timestamp > tb.bucket_time - INTERVAL '5 hours' 
            AND ar.timestamp <= tb.bucket_time
          ),
          0
        ) AS cumulative_output_tokens
      FROM (SELECT unnest($1::text[]) AS account_id) au
      CROSS JOIN time_buckets tb
      LEFT JOIN api_requests ar ON ar.account_id = au.account_id
      GROUP BY au.account_id, tb.bucket_time
    )
    SELECT 
      account_id,
      bucket_time,
      cumulative_output_tokens
    FROM account_cumulative
    ORDER BY account_id, bucket_time ASC
  `,

  // Usage analytics queries
  HOURLY_REQUESTS: `
    SELECT
      domain,
      DATE_TRUNC('hour', timestamp AT TIME ZONE 'UTC') as hour,
      COUNT(*) as request_count
    FROM
      api_requests
    GROUP BY
      domain,
      hour
    ORDER BY
      domain,
      hour
  `,

  HOURLY_TOKENS: `
    SELECT
      domain,
      DATE_TRUNC('hour', timestamp AT TIME ZONE 'UTC') as hour,
      COALESCE(SUM(output_tokens), 0) as token_count
    FROM
      api_requests
    GROUP BY
      domain,
      hour
    ORDER BY
      domain,
      hour
  `,
} as const