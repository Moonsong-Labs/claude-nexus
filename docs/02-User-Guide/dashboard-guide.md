# Dashboard Guide

The Claude Nexus Proxy Dashboard provides real-time monitoring and analytics for your Claude API usage.

## Table of Contents

- [Accessing the Dashboard](#accessing-the-dashboard)
- [Dashboard Features](#dashboard-features)
- [Analytics & Monitoring](#analytics--monitoring)
- [Conversation Management](#conversation-management)
- [AI-Powered Features](#ai-powered-features)
- [API Integration](#api-integration)
- [Performance & Optimization](#performance--optimization)
- [Troubleshooting](#troubleshooting)
- [Configuration](#configuration)

## Accessing the Dashboard

### Default Access

The dashboard runs on port 3001 by default:

```bash
http://localhost:3001
```

### Authentication

The dashboard uses API key authentication. Enter your dashboard API key on the login page:

```bash
# Configure in .env file
DASHBOARD_API_KEY=your-secure-dashboard-key
```

**Authentication Methods:**

- **Browser**: Uses `X-Dashboard-Key` header and stores auth in `dashboard_auth` cookie
- **API**: Include `X-Dashboard-Key` header in requests
- **Session**: Cookie persists until browser is closed

## Dashboard Features

### Overview Page

The main dashboard provides at-a-glance metrics:

- **Total Requests**: Cumulative request count
- **Total Tokens**: Combined input/output token usage
- **Active Domains**: Number of domains using the proxy
- **Total Sub-tasks**: Count of Task tool invocations
- **Success Rate**: Percentage of successful requests
- **Average Latency**: Mean response time
- **AI Analyses**: Count of completed conversation analyses

### Real-time Updates

Live updates via Server-Sent Events (SSE):

- Current request activity
- Token usage trends
- Error rates and patterns
- Response time distribution
- Active conversation streams

## Analytics & Monitoring

### Token Usage Analytics

#### Current Window (5-hour)

Monitor Claude API rate limits in real-time:

- Token consumption by account
- Usage percentage of 5-hour limit
- Time until window reset
- Projected usage trends
- Rate limit warnings

**Access:** `/token-usage/current?accountId=acc_xxx`

#### Historical Usage

View daily token usage patterns:

- Daily breakdown by account/domain
- Cost estimation based on model
- Usage patterns and trends
- Peak usage identification
- Export data as CSV

**Access:** `/token-usage/daily?days=30`

## Conversation Management

### Conversation Tracking

#### Conversation List

- Grouped by conversation ID with branch support
- Message count and token usage per conversation
- Branch visualization with unique identifiers
- Sub-task indicators and counts
- AI analysis status badges

**Access:** `/conversations?domain=example.com&limit=50`

#### Conversation Timeline

Interactive visualization features:

- Message flow with timestamps
- Branch points (blue nodes) with labels
- Sub-tasks (gray boxes, 100x36px)
- Token usage per message
- Multiple tool invocations display
- System reminder filtering

#### Sub-task Visualization

- Spawned tasks appear as linked nodes
- Click to navigate to sub-task conversation
- Hover tooltips (250x130px) show task prompts
- Automatic conversation inheritance
- Sequential branch naming (subtask_1, subtask_2)

### Request History

Comprehensive request browser with:

- Full request/response details
- Token counts (input/output/total)
- Latency metrics and percentiles
- Error messages and stack traces
- Full JSON payloads with syntax highlighting
- Image display for tool_result content
- Spark recommendation display

**Supported Image Formats:**

- PNG, JPEG, GIF, WebP
- Maximum size: 10MB
- Automatic resizing and lazy loading
- Base64 data URI validation

**Filtering Options:**

- Domain selection
- Time range (last hour/day/week/custom)
- Request type (messages, completion, etc.)
- Status (success/error)
- Account ID
- Conversation ID

### Account Management

Per-account statistics and monitoring:

- Token usage by account ID
- Domain associations
- Authentication methods (API key, OAuth)
- Usage limits and quotas
- OAuth token status and refresh times
- Account-specific rate limiting

**Access:** `/accounts?accountId=acc_xxx`

## AI-Powered Features

### Conversation Analysis

AI-powered analysis using Gemini models provides:

- **Automatic Analysis**: Background processing of conversations
- **Custom Prompts**: Request specific analysis focus
- **Structured Insights**: Key findings and recommendations
- **Status Tracking**: pending, processing, completed, failed
- **Retry Logic**: Automatic retry with exponential backoff

**Analysis Panel Features:**

- View analysis status and results
- Regenerate with custom prompts
- Token usage tracking
- Error handling with graceful degradation

**API Endpoints:**

```bash
# Create analysis
POST /api/analyses
{"conversationId": "uuid", "branchId": "main", "customPrompt": "Focus on security"}

# Get analysis
GET /api/analyses/:conversationId/:branchId

# Regenerate
POST /api/analyses/:conversationId/:branchId/regenerate
```

### Spark Integration

Integration with Spark recommendation tool:

- Automatic detection of Spark tool usage
- Formatted recommendation display
- Inline feedback UI (rating 1-5 + comments)
- Batch feedback fetching
- Session-based tracking

**Configuration Required:**

```bash
SPARK_API_URL=http://spark-api.example.com
SPARK_API_KEY=your-spark-api-key
```

## Navigation & Shortcuts

### URL Parameters

Dashboard views support query parameters:

```bash
# Filter by domain
/requests?domain=example.com

# Filter by account
/token-usage?accountId=acc_12345

# View specific conversation
/conversations?id=conv_uuid&branch=main

# Time range selection
/token-usage/daily?days=7&aggregate=true

# Force refresh (bypass cache)
/stats?refresh=true
```

### Keyboard Shortcuts

- `r` - Refresh current view
- `f` - Toggle filters
- `esc` - Close modals
- `/` - Focus search
- `c` - Jump to conversations
- `t` - Jump to token usage

### Charts and Visualizations

#### Token Usage Chart

- Time-series visualization
- Stacked by domain or account
- Interactive zoom and pan
- Export as PNG/SVG
- Customizable time ranges

#### Latency Distribution

- Response time histogram
- P50, P95, P99 percentiles
- Outlier identification
- Model-specific breakdowns

#### Error Analytics

- Error frequency trends
- Error type categorization
- Correlation analysis
- Root cause indicators

## API Integration

### Dashboard API

Programmatic access to dashboard data:

```bash
# Get current stats
curl http://localhost:3001/api/stats \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"

# Get token usage (5-hour window)
curl "http://localhost:3001/api/token-usage/current?window=300&accountId=acc_xxx" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"

# Get daily usage
curl "http://localhost:3001/api/token-usage/daily?days=30&aggregate=true" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"

# Get conversations
curl "http://localhost:3001/api/conversations?limit=10&domain=example.com" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"

# Get specific request
curl "http://localhost:3001/api/requests/:id" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"
```

### Export Capabilities

- **Token Usage**: CSV format with daily/hourly breakdowns
- **Conversations**: JSON with full message history
- **Request Logs**: JSON with metadata
- **Analytics**: PDF reports (coming soon)

## Performance & Optimization

### Caching Strategy

```bash
# Configure cache TTL (seconds)
DASHBOARD_CACHE_TTL=30  # Default
DASHBOARD_CACHE_TTL=0   # Disable caching

# Force refresh
GET /endpoint?refresh=true
```

### Database Performance

#### Slow Query Detection

```bash
# Configure threshold
SLOW_QUERY_THRESHOLD_MS=5000
DEBUG_SQL=true  # Enable SQL logging
```

#### Monitoring Points

- Active connections and pool usage
- Query execution times
- Index effectiveness
- Table sizes and growth
- Vacuum statistics

### Optimization Tips

1. **Use Partial Indexes**: Conversations filtered by status
2. **Limit Result Sets**: Use pagination parameters
3. **Cache Static Data**: Leverage browser caching
4. **Monitor SSE Connections**: Limit concurrent streams

## Troubleshooting

### Dashboard Won't Load

1. **Check service health:**

   ```bash
   curl http://localhost:3001/health
   ```

2. **Verify database connection:**

   ```bash
   psql $DATABASE_URL -c "SELECT 1"
   ```

3. **Check logs:**

   ```bash
   # Docker
   docker compose logs dashboard

   # Local development
   bun run dev:dashboard
   ```

### Authentication Issues

1. **Verify API key:**

   ```bash
   grep DASHBOARD_API_KEY .env
   ```

2. **Clear authentication:**
   - Delete `dashboard_auth` cookie
   - Clear browser cache
   - Try incognito mode

3. **Test API access:**
   ```bash
   curl -I http://localhost:3001/api/stats \
     -H "X-Dashboard-Key: $DASHBOARD_API_KEY"
   ```

### Missing Data

1. **Verify storage is enabled:**

   ```bash
   grep STORAGE_ENABLED .env  # Should be true
   ```

2. **Check data ingestion:**

   ```sql
   -- Recent requests
   SELECT COUNT(*), MAX(created_at) FROM api_requests;

   -- Conversation linking
   SELECT COUNT(*) FROM api_requests WHERE conversation_id IS NOT NULL;

   -- Streaming data
   SELECT COUNT(*) FROM streaming_chunks;
   ```

3. **Verify writer service:**
   ```bash
   # Check for writer errors in proxy logs
   docker compose logs proxy | grep -i "writer\|error"
   ```

### Performance Issues

1. **Enable detailed logging:**

   ```bash
   DEBUG_SQL=true
   SLOW_QUERY_THRESHOLD_MS=1000
   ```

2. **Analyze database performance:**

   ```sql
   -- Check indexes
   SELECT schemaname, tablename, indexname, indexdef
   FROM pg_indexes
   WHERE tablename IN ('api_requests', 'streaming_chunks');

   -- Active queries
   SELECT pid, age(clock_timestamp(), query_start), query
   FROM pg_stat_activity
   WHERE state != 'idle'
   ORDER BY query_start;

   -- Table statistics
   SELECT relname, n_live_tup, n_dead_tup, last_vacuum
   FROM pg_stat_user_tables;
   ```

3. **Optimize queries:**
   - Add `LIMIT` to conversation queries
   - Use date ranges for historical data
   - Enable response caching

### Common Error Messages

- **"Unauthorized"**: Invalid or missing API key
- **"Database connection failed"**: Check DATABASE_URL
- **"No data available"**: Verify STORAGE_ENABLED=true
- **"SSE connection lost"**: Network or timeout issue
- **"Analysis failed"**: Check AI worker configuration

## Configuration

### Environment Variables

```bash
# Core Settings
DASHBOARD_PORT=3001
DASHBOARD_API_KEY=your-secure-key
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname

# Performance
DASHBOARD_CACHE_TTL=30         # Cache TTL in seconds
SLOW_QUERY_THRESHOLD_MS=5000   # Slow query threshold
DEBUG_SQL=false                # SQL query logging

# AI Analysis
AI_WORKER_ENABLED=false        # Enable AI analysis
GEMINI_API_KEY=your-key        # Gemini API key
GEMINI_MODEL_NAME=gemini-2.0-flash-exp
AI_ANALYSIS_MAX_RETRIES=3      # Retry attempts

# Spark Integration
SPARK_API_URL=http://spark-api.example.com
SPARK_API_KEY=your-spark-key

# Storage
STORAGE_ENABLED=true           # Enable request storage
API_KEY_SALT=your-salt         # API key hashing salt
```

For complete environment variable reference, see [Environment Variables Guide](../06-Reference/environment-vars.md).

## Best Practices

1. **Regular Monitoring**
   - Check dashboard daily for anomalies
   - Review error patterns weekly
   - Monitor token usage against budgets

2. **Performance Optimization**
   - Use URL parameters to limit data
   - Enable caching for static views
   - Archive old data monthly

3. **Security**
   - Rotate API keys regularly
   - Use HTTPS in production
   - Limit dashboard access by IP

4. **Data Management**
   - Export important conversations
   - Set up automated backups
   - Monitor database growth

## Related Documentation

- [Monitoring & Alerts](../03-Operations/monitoring.md)
- [Performance Optimization](../05-Troubleshooting/performance.md)
- [Backup & Recovery](../03-Operations/backup-recovery.md)
- [Security Best Practices](../03-Operations/security.md)
- [AI Analysis Security](../03-Operations/ai-analysis-security.md)
- [Database Management](../03-Operations/database.md)
- [Environment Variables](../06-Reference/environment-vars.md)
