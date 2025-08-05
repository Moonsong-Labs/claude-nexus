# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

Claude Nexus Proxy - A high-performance proxy for Claude API with monitoring dashboard. Built with Bun and Hono framework, deployed as separate Docker images for each service.

## Architectural Decision Records (ADRs)

Technical decisions are documented in `docs/ADRs/`. Key architectural decisions:

- **ADR-012**: Database Schema Evolution Strategy - TypeScript migrations with init SQL
- **ADR-013**: TypeScript Project References - Monorepo type checking solution
- **ADR-016**: MCP Server Implementation - Model Context Protocol server architecture (superseded)
- **ADR-017**: MCP Prompt Sharing - Current implementation for prompt sharing via MCP
- **ADR-018**: AI-Powered Conversation Analysis - Background job architecture for AI analysis

**AI Assistant Directive**: When discussing architecture or making technical decisions, always reference relevant ADRs. If a new architectural decision is made during development, create or update an ADR to document it. This ensures all technical decisions have clear rationale and can be revisited if needed.

## Architecture

### Monorepo Structure

```
claude-nexus-proxy/
├── packages/shared/      # Shared types and configurations
├── services/
│   ├── proxy/           # Proxy API service (Port 3000)
│   └── dashboard/       # Dashboard web service (Port 3001)
├── scripts/             # Utility scripts
├── docker/              # Docker configurations
│   ├── proxy/           # Proxy Dockerfile
│   └── dashboard/       # Dashboard Dockerfile
├── docker-compose.yml   # Container orchestration
├── .env                 # Proxy/Dashboard configuration
└── credentials/         # Domain credentials (Claude Auth, Slack, ...)


```

### Key Services

**Proxy Service** (`services/proxy/`)

- Direct API forwarding to Claude
- Multi-auth support (API keys, OAuth with auto-refresh)
- Token tracking and telemetry
- Request/response storage
- Slack notifications
- AI-powered conversation analysis (Phase 2 - Prompt Engineering with full env var support)

**Dashboard Service** (`services/dashboard/`)

- Monitoring UI
- Analytics and usage charts
- Request history browser
- SSE for live updates
- **⚠️ SECURITY WARNING**: Read-only mode (when `DASHBOARD_API_KEY` is not set) exposes all data without authentication. See [ADR-019](docs/04-Architecture/ADRs/adr-019-dashboard-read-only-mode-security.md)

## Development

```bash
# Install dependencies
bun install

# Run both services
bun run dev

# Run individually
bun run dev:proxy      # Port 3000
bun run dev:dashboard  # Port 3001

# Build
bun run build
```

### Git Pre-commit Hooks

The project uses Husky and lint-staged for automated code quality checks:

```bash
# Pre-commit hooks are automatically installed via postinstall script
bun install

# Manual hook installation (if needed)
bunx husky init
```

**Pre-commit checks:**

- ESLint fixes for TypeScript/JavaScript files
- Prettier formatting for all supported file types
- Automatic fixes are applied when possible

**Note:** TypeScript type checking is not included in pre-commit hooks for performance reasons. Type checking runs in CI/CD pipeline.

## Docker Deployment

The project uses **separate Docker images** for each service:

```bash
# Build images
./docker/build-images.sh

# Run proxy service
docker run -p 3000:3000 alanpurestake/claude-nexus-proxy:latest

# Run dashboard service
docker run -p 3001:3001 alanpurestake/claude-nexus-dashboard:latest
```

Docker configurations are in the `docker/` directory. Each service has its own optimized image for better security, scaling, and maintainability.

### Docker Compose Environment

docker/docker-compose.yml: Postgres + Proxy + Dashboard + Claude CLI (with ccusage and token monitoring). `./docker-up.sh` script is used instead of `docker compose -f ...` to ensure `.env` is loaded properly.

```bash
# Build the local images
./docker-up.sh build

# Run the full environment (requires real Claude account in )
./docker-up.sh up -d

# Run a claude query
./docker-up.sh exec claude-cli claude "hi"

# Run usage monitor for real-time tracking
./docker-up.sh exec claude-cli monitor

# Check daily usage stats
./docker-up.sh exec claude-cli ccusage daily
```

## Key Implementation Details

### Request Timeout Configuration

The proxy supports long-running Claude API requests with configurable timeouts:

- **Default timeout**: 10 minutes (600,000ms) for Claude API requests
- **Server timeout**: 11 minutes (660,000ms) to prevent premature connection closure
- **Retry timeout**: Slightly longer than request timeout to allow for retries
- Configure via `CLAUDE_API_TIMEOUT` and `PROXY_SERVER_TIMEOUT` environment variables

### Conversation Tracking & Branching

The proxy automatically tracks conversations and detects branches using message hashing:

**How it works:**

1. Each message in a request is hashed using SHA-256
2. The current message hash and parent message hash (previous message) are stored
3. Requests are linked into conversations by matching parent/child relationships
4. Conversations support branching (like git) when resumed from earlier points
5. Branches are automatically detected when multiple requests share the same parent
6. When multiple conversations have the same parent hash, the system picks the conversation with the fewest requests to continue
7. Messages continue on the same branch as their parent unless they create a new branch point

**Message Normalization:**

- String content and array content are normalized to produce consistent hashes
- Example: `"hello"` and `[{type: "text", text: "hello"}]` produce the same hash
- **System reminders are filtered out**: Content items starting with `<system-reminder>` are ignored during hashing
- **Duplicate messages are deduplicated**: When tool_use or tool_result messages have duplicate IDs, only the first occurrence is included in the hash
- This ensures conversations link correctly regardless of content format, system reminder presence, or duplicate messages from the Claude API

**Dual Hash System:**

- **Message Hash**: Used for conversation linking, contains only message content
- **System Hash**: Tracks system prompt separately, stored in `system_hash` column
- This allows conversations to maintain links even when system prompts change (e.g., git status updates, context compaction)
- Backward compatible: Old conversations continue to work without modification

**Special Conversation Handling:**

- **Conversation Summarization**: When Claude summarizes a conversation (detected by system prompt "You are a helpful AI assistant tasked with summarizing conversations"), the system links to the previous conversation ignoring system prompt differences
- **Compact Conversations**: When a conversation is continued from a previous one due to context overflow (first message starts with "This session is being continued from a previous conversation..."), it:
  - Links to the source conversation automatically
  - Creates a special branch ID format: `compact_HHMMSS`
  - Preserves the compact branch for all follow-up messages in that conversation
  - Prevents unnecessary branching when continuing compact conversations

**API Endpoints:**

- `/api/conversations` - Get conversations grouped by conversation_id with branch information
- Query parameters: `domain` (filter by domain), `limit` (max conversations)

**Database Schema:**

- `conversation_id` - UUID identifying the conversation
- `current_message_hash` - Hash of the last message in the request
- `parent_message_hash` - Hash of the previous message (null for first message)
- `system_hash` - Hash of the system prompt (for tracking context changes)
- `branch_id` - Branch identifier (defaults to 'main', auto-generated for new branches)
- `parent_request_id` - Direct link to the parent request in the conversation chain

**Dashboard Features:**

- **Conversations View** - Visual timeline showing message flow and branches
- **Branch Visualization** - Blue nodes indicate branch points
- **Branch Labels** - Non-main branches are labeled with their branch ID
- **Conversation Grouping** - All related requests grouped under one conversation
- **Multiple Tool Display** - Messages with multiple tool_use or tool_result blocks are properly displayed with visual separation (horizontal rules between each tool invocation)
- **Duplicate Filtering** - Duplicate tool_use and tool_result blocks (same ID) are automatically filtered out
- **System Reminder Filtering** - System reminder text blocks are hidden from display

### Authentication Flow

**Client Authentication (Proxy Level):**

1. Extract domain from Host header
2. Check for `client_api_key` in domain credential file
3. Verify Bearer token against stored key using timing-safe comparison
4. Return 401 Unauthorized if invalid

**Claude API Authentication:**

1. Check domain-specific credential files (`<domain>.credentials.json`)
2. Use Authorization header from request

### OAuth Support

- Auto-refresh tokens 1 minute before expiry
- Stores refreshed tokens back to credential files
- Adds `anthropic-beta: oauth-2025-04-20` header

### MCP (Model Context Protocol) Server

The proxy includes an MCP server for managing and serving prompts:

**Features:**

- File-based prompt storage using YAML files in `prompts/` directory
- Prompts are named after their file name (e.g., `feature.yaml` becomes `/feature`)
- Handlebars templating with `{{variable}}` syntax
- Hot-reloading when files change
- Optional GitHub repository synchronization

**Configuration:**

```bash
# Basic MCP setup (file-based)
MCP_ENABLED=true
MCP_PROMPTS_DIR=./prompts
MCP_WATCH_FILES=true

# Optional GitHub sync
MCP_GITHUB_OWNER=your-org
MCP_GITHUB_REPO=prompt-library
MCP_GITHUB_BRANCH=main
MCP_GITHUB_TOKEN=ghp_xxxx
MCP_GITHUB_PATH=prompts/
MCP_SYNC_INTERVAL=300
```

**How it works:**

- When only `MCP_ENABLED=true` is set, prompts are loaded from local YAML files
- When GitHub credentials are configured, the system syncs from the repository
- GitHub sync fetches prompts and writes them to the local filesystem
- **Important**: GitHub sync only replaces files that exist in the repository, preserving local-only prompts
- Files are validated to prevent path traversal security vulnerabilities
- The PromptRegistryService loads prompts from files into memory
- MCP protocol endpoints are available at `/mcp`

**Prompt format:**

```yaml
# Note: The prompt name in Claude will be the file name (without .yaml extension)
# For example, this file saved as 'my-feature.yaml' will be available as '/my-feature'
name: My Prompt # This field is ignored - file name is used instead
description: Description of the prompt
template: |
  You are {{role}}.
  {{#if context}}
  Context: {{context}}
  {{/if}}
```

**Using MCP with Claude Desktop:**

1. **Install the MCP server in Claude Desktop**:

   ```bash
   claude mcp add nexus-prompts --scope user -- bunx -y mcp-remote@latest http://localhost:3000/mcp --header "Authorization: Bearer YOUR_CLIENT_API_KEY"
   ```

2. **Replace YOUR_CLIENT_API_KEY** with the actual client API key from your domain's credential file (e.g., `cnp_live_...`)

3. **Restart Claude Desktop** to load the MCP server

4. **Available commands**:
   - Prompts will appear as slash commands in Claude (e.g., `/feature` for a prompt named `feature.yaml`)
   - Use tab completion to see available prompts

**MCP Implementation Details:**

- **Protocol Version**: Uses MCP protocol version `2024-11-05`
- **Authentication**: Bearer token authentication via client API keys
- **Endpoints**:
  - `POST /mcp` - Main MCP JSON-RPC endpoint
  - `GET /mcp` - Discovery endpoint
- **Supported Methods**:
  - `initialize` - Protocol handshake
  - `prompts/list` - List available prompts
  - `prompts/get` - Get and render a specific prompt with variables

### Token Tracking

**In-Memory Tracking (Legacy)**

- Per-domain statistics
- Request type classification (query evaluation vs inference)
- Tool call counting
- Available at `/token-stats` endpoint

**Comprehensive Token Usage Tracking (New)**

- Tracks ALL request types (including query_evaluation and quota)
- Persistent storage in partitioned `token_usage` table
- 5-hour rolling window support for monitoring Claude API limits
- Per-account AND per-domain tracking
- API endpoints:
  - `/api/token-usage/current` - Current window usage
  - `/api/token-usage/daily` - Historical daily usage data
  - `/api/conversations` - Conversations with account info
- **Note**: Rate limiting is handled by Claude API directly. The proxy only tracks and displays usage statistics.

### Rate Limit Event Tracking

The proxy tracks individual rate limit events from the Claude API:

**Features:**

- Event-based tracking in partitioned `rate_limit_events` table
- Automatic detection of rate limit types (5h_sliding, weekly)
- Stores request ID, account, domain, and timestamp for each event
- Monthly partitions with automatic maintenance
- Dashboard visualization with red coloring for affected time periods

**Dashboard Display:**

- Token usage charts show red line segments during hours with rate limit events
- Account overview shows rate limit status badges
- Detailed rate limit information panel when limits are active
- Visual markers on charts showing when rate limits occurred

**Database Schema:**

- `rate_limit_events` - Partitioned table storing individual events
- `account_rate_limit_summary` - Summary table for backward compatibility
- Automatic partition creation for future months
- Configurable retention period (default: 90 days)

**Maintenance:**

```bash
# Run partition maintenance script
bun run scripts/maintain-rate-limit-partitions.ts
```

### Storage

- PostgreSQL for request/response data
- Write-only access from proxy
- Read-only access from dashboard
- Automatic batch processing
- **Conversation Grouping**: Requests are automatically grouped by conversation using message hashing

### Debug Logging

When `DEBUG=true`:

- Logs full request/response (with sensitive data masked)
- Shows streaming chunks
- Masks patterns: `sk-ant-****`, `Bearer ****`
- Includes SQL query stack traces

### SQL Query Logging

Enable SQL query logging in debug mode:

```bash
# Option 1: Enable all debug logging (includes SQL)
DEBUG=true bun run dev

# Option 2: Enable only SQL query logging
DEBUG_SQL=true bun run dev

# Option 3: Set in .env file
DEBUG_SQL=true
```

SQL logging features:

- All queries with parameters
- Query execution time
- Row counts
- Slow query warnings (default: >5 seconds)
- Failed query errors with details

## Environment Variables

**Essential:**

- `DATABASE_URL` - PostgreSQL connection
- `DASHBOARD_API_KEY` - Dashboard authentication (⚠️ **CRITICAL**: Without this, dashboard runs in read-only mode with NO authentication)

**Optional:**

- `DEBUG` - Enable debug logging
- `DEBUG_SQL` - Enable SQL query logging (default: false)
- `STORAGE_ENABLED` - Enable storage (default: false)
- `SLACK_WEBHOOK_URL` - Slack notifications
- `CREDENTIALS_DIR` - Domain credential directory
- `COLLECT_TEST_SAMPLES` - Collect request samples for testing (default: false)
- `TEST_SAMPLES_DIR` - Directory for test samples (default: test-samples)
- `ENABLE_CLIENT_AUTH` - Enable client API key authentication (default: true). Set to false to allow anyone to use the proxy without authentication
- `DASHBOARD_CACHE_TTL` - Dashboard cache TTL in seconds (default: 30). Set to 0 to disable caching
- `SLOW_QUERY_THRESHOLD_MS` - Threshold in milliseconds for logging slow SQL queries (default: 5000)
- `CLAUDE_API_TIMEOUT` - Timeout for Claude API requests in milliseconds (default: 600000 / 10 minutes)
- `PROXY_SERVER_TIMEOUT` - Server-level timeout in milliseconds (default: 660000 / 11 minutes)
- `STORAGE_ADAPTER_CLEANUP_MS` - Interval for cleaning up orphaned request ID mappings in milliseconds (default: 300000 / 5 minutes)
- `STORAGE_ADAPTER_RETENTION_MS` - Retention time for request ID mappings in milliseconds (default: 3600000 / 1 hour)
- `API_KEY_SALT` - Salt for hashing API keys in database (default: 'claude-nexus-proxy-default-salt')
- `SPARK_API_URL` - Spark API base URL for recommendation feedback (default: 'http://localhost:8000')
- `SPARK_API_KEY` - API key for authenticating with Spark API

## Important Notes

### Request Metadata

- Query evaluation and quota are not part of the conversation, they serve as metadata queries

## Testing & Type Safety

**Type Checking:**

- Run `bun run typecheck` before committing
- Type checking is automatic during builds
- Fix all type errors before deploying
- **TypeScript Project References**: The monorepo uses TypeScript Project References for proper dependency management
  - Automatically handles build order between packages
  - Generates declaration files for cross-package imports
  - Run `tsc --build` at the root to type check all packages
  - See ADR-013 for details on this architectural decision

**Test Sample Collection:**
The proxy can collect real request samples for test development:

- Enable with `COLLECT_TEST_SAMPLES=true`
- Samples are stored in `test-samples/` directory
- Each request type gets its own file (e.g., `inference_streaming_opus.json`)
- Sensitive data is automatically masked
- Samples include headers, body, and metadata

**Tests:**

The project includes comprehensive tests for conversation and subtask linking:

- **Conversation Linking Tests**: `packages/shared/src/utils/__tests__/conversation-linker.test.ts`
  - Tests message hashing, branch detection, and conversation linking
  - Includes JSON fixture tests for real-world scenarios
  - Tests integrated subtask detection within ConversationLinker

- **Subtask Detection Tests**: `packages/shared/src/utils/__tests__/subtask-detection.test.ts`
  - Tests complete subtask detection logic in ConversationLinker
  - Validates TaskContext handling and invocation matching
  - Tests conversation inheritance and branch naming
  - Covers edge cases like multi-message conversations

- **Subtask Linking Simulation**: `packages/shared/src/utils/__tests__/subtask-linker.test.ts`
  - Simulates the old two-phase subtask detection (for reference)
  - Tests Task tool invocation matching
  - Validates time window enforcement
  - Includes JSON fixtures for various subtask scenarios

Run tests with:

```bash
# All tests
bun test

# Specific package
cd packages/shared && bun test

# Specific test file
bun test conversation-linker.test.ts
```

## Important Notes

- Uses Bun runtime exclusively (no Node.js)
- Separate Docker images for each service
- TypeScript compilation for production builds
- Model-agnostic (accepts any model name)

## Database Schema

### Main Tables

**api_requests** - Stores all API requests and responses with token tracking:

- `account_id` - Account identifier from credential files for per-account tracking
- `input_tokens`, `output_tokens`, `total_tokens` - Token usage metrics
- `conversation_id`, `branch_id` - Conversation tracking
- `current_message_hash`, `parent_message_hash` - Message linking
- `parent_task_request_id`, `is_subtask`, `task_tool_invocation` - Sub-task tracking

**streaming_chunks** - Stores streaming response chunks

**rate_limit_events** - Partitioned table storing individual rate limit events:

- `request_id` - Links to the request that triggered the rate limit
- `account_id`, `domain` - Account and domain information
- `limit_type` - Type of rate limit (5h_sliding or weekly)
- `triggered_at` - Timestamp when the rate limit occurred
- `metadata` - Additional information about the rate limit event
- Partitioned by month for efficient querying and maintenance

**account_rate_limit_summary** - Summary table for rate limit information per account

### Account-Based Token Tracking

Token usage is tracked directly in the `api_requests` table:

- Each request is associated with an `account_id` from the credential file
- Token counts are stored per request for accurate tracking
- Queries aggregate usage by account and time window

### Database Schema Evolution

**Schema Management:**

- Initial schema: `scripts/init-database.sql`
- Migrations: `scripts/db/migrations/` (TypeScript files)
- Auto-initialization: `writer.ts` uses init SQL file when tables don't exist

**Running Migrations:**

```bash
# Run a specific migration
bun run scripts/db/migrations/001-add-conversation-tracking.ts

# Run all migrations in order
for file in scripts/db/migrations/*.ts; do bun run "$file"; done
```

**Available Migrations:**

- 000: Initial database setup
- 001: Add conversation tracking
- 002: Optimize conversation indexes
- 003: Add sub-task tracking
- 004: Optimize window function queries
- 005: Populate account IDs
- 006: Split conversation hashes
- 007: Add parent_request_id
- 008: Update subtask conversation IDs and optimize Task queries
- 009: Increase response body size limit
- 010: Add account rate limit summary table
- 011: Add conversation analyses table
- 012: Add partial index for pending analyses
- 013: Add rate limit events table with partitioning

See `docs/04-Architecture/ADRs/adr-012-database-schema-evolution.md` for details.

## Common Tasks

### Add Domain Credentials

```bash
# Generate secure client API key
bun run scripts/generate-api-key.ts

# Create credential file
cat > credentials/domain.com.credentials.json << EOF
{
  "type": "api_key",
  "accountId": "acc_f9e1c2d3b4a5",  # Unique account identifier
  "api_key": "sk-ant-...",
  "client_api_key": "cnp_live_..."
}
EOF
```

### Enable Storage

```bash
export STORAGE_ENABLED=true
export DATABASE_URL=postgresql://...
```

### View Token Stats

```bash
curl http://localhost:3000/token-stats
```

### Access Dashboard

```bash
open http://localhost:3001
# Use DASHBOARD_API_KEY for authentication
# Auth header: X-Dashboard-Key: <your-key>
```

## Sub-task Tracking & Visualization

### Sub-task Detection

The proxy automatically detects and tracks sub-tasks spawned using the Task tool through an integrated single-phase process:

**Single-Phase Detection (ConversationLinker):**

- Complete subtask detection happens within ConversationLinker using the SubtaskQueryExecutor pattern
- SQL queries retrieve Task invocations from database (24-hour window)
- Matches single-message user conversations against recent Task invocations (30-second window)
- Sets `is_subtask=true` and links to parent via `parent_task_request_id`
- Subtasks inherit parent's conversation_id with unique branch naming (subtask_1, subtask_2, etc.)

**Architecture Components:**

- **SubtaskQueryExecutor**: Injected function that queries for Task tool invocations
- **ConversationLinker**: Central component handling all conversation and subtask linking logic
- **Optimized SQL Queries**: Uses PostgreSQL `@>` containment operator for exact prompt matching
- **RequestByIdExecutor**: Fetches parent task details for conversation inheritance
- **GIN Index**: Full JSONB index on response_body for efficient containment queries

**Query Optimization:**

When the subtask prompt is known, the system uses an optimized query:

```sql
response_body @> jsonb_build_object(
  'content', jsonb_build_array(
    jsonb_build_object(
      'type', 'tool_use',
      'name', 'Task',
      'input', jsonb_build_object('prompt', $4::text)
    )
  )
)
```

This leverages the GIN index for O(log n) lookup performance instead of scanning all Task invocations.

**Database Fields:**

- `parent_task_request_id` - Links sub-task requests to their parent task
- `is_subtask` - Boolean flag indicating if a request is a confirmed sub-task
- `task_tool_invocation` - JSONB array storing Task tool invocations (for historical queries)

**Sub-task Linking:**

- Sub-tasks are linked by exact matching of user message to Task tool invocation prompts
- The system creates parent-child relationships between tasks and their sub-tasks
- Multiple sub-tasks can be spawned from a single parent request
- Sub-tasks inherit parent task's conversation_id with sequential branch IDs (subtask_1, subtask_2, etc.)

### Dashboard Visualization

**Conversation Tree:**

- Sub-task nodes appear as separate gray boxes to the right of parent nodes
- Format: "sub-task N (M)" where N is the sub-task number and M is the message count
- Sub-task boxes are clickable and link to their conversation
- Hover over sub-task boxes to see the task prompt in a tooltip

**Stats Display:**

- "Total Sub-tasks" panel shows count of all sub-tasks in a conversation
- Sub-task indicators on parent nodes show number of spawned tasks

**Visual Design:**

- Sub-task boxes: 100x36px gray boxes with 150px right offset
- Tooltips: 250x130px with gradient background, appear above nodes on hover
- Connected to parent nodes with horizontal edges

## Important Implementation Notes

### Conversation Hash Filtering

When generating message hashes for conversation tracking, the system filters out:

- Content items that start with `<system-reminder>`
- This prevents conversation linking from breaking when Claude adds system reminders

### Dashboard Authentication

- Uses `X-Dashboard-Key` header (not Authorization)
- Cookie-based auth also supported for browser sessions

### AI-Powered Conversation Analysis

The proxy supports automated analysis of conversations using AI models (currently Gemini 1.5 Flash or 2.5 Pro):

**Features:**

- Background processing of conversations for insights
- Status tracking (pending, processing, completed, failed)
- Token usage tracking for cost management
- Retry logic with exponential backoff
- Unique analyses per conversation and branch
- Comprehensive environment variable configuration for prompt tuning
- Graceful handling of unparseable JSON responses
- Automatic failure of jobs exceeding max retries
- Custom prompt support for targeted analysis

**Error Handling:**

- **JSON Parse Failures**: When the AI model returns malformed JSON, the system stores the raw text response instead of failing
- **Max Retry Exceeded**: Jobs that exceed `AI_ANALYSIS_MAX_RETRIES` are automatically marked as failed with clear error messages
- **Non-retryable Errors**: Sensitive information detection and API key issues fail immediately without retries

**Database Schema:**

- `conversation_analyses` table stores analysis results
- ENUM type for status field ensures data integrity
- Automatic `updated_at` timestamp via trigger
- Partial index on pending status for efficient queue processing
- Supports both structured data (`analysis_data`) and raw text (`analysis_content`)

**API Endpoints:**

- `POST /api/analyses` - Create analysis request (supports `customPrompt`)
- `GET /api/analyses/:conversationId/:branchId` - Get analysis status/result
- `POST /api/analyses/:conversationId/:branchId/regenerate` - Force regeneration with optional custom prompt

**Utility Scripts:**

- `scripts/check-analysis-jobs.ts` - Check status of analysis jobs
- `scripts/check-ai-worker-config.ts` - Verify AI worker configuration
- `scripts/reset-stuck-analysis-jobs.ts` - Reset jobs stuck with high retry counts
- `scripts/fail-exceeded-retry-jobs.ts` - Manually fail jobs exceeding max retries
- `scripts/check-analysis-content.ts` - Inspect analysis content for a conversation

**Implementation Status:**

- ✅ Database schema (Migration 011, 012)
- ✅ API endpoints with custom prompt support
- ✅ Prompt engineering with actionable feedback
- ✅ Background worker with resilient error handling
- ✅ Dashboard UI with analysis panel
- ✅ Graceful JSON parse failure handling
- ✅ Automatic max retry failure

See [ADR-016](docs/04-Architecture/ADRs/adr-016-ai-powered-conversation-analysis.md) for architectural decisions.

**Background Worker Configuration:**

Enable the AI Analysis background worker by setting these environment variables:

```bash
# Enable the worker
AI_WORKER_ENABLED=true

# Worker configuration
AI_WORKER_POLL_INTERVAL_MS=5000      # Poll every 5 seconds
AI_WORKER_MAX_CONCURRENT_JOBS=3      # Process up to 3 jobs concurrently
AI_WORKER_JOB_TIMEOUT_MINUTES=5      # Mark jobs as stuck after 5 minutes

# Resilience configuration
AI_ANALYSIS_MAX_RETRIES=3              # Retry failed jobs up to 3 times
AI_ANALYSIS_GEMINI_REQUEST_TIMEOUT_MS=60000  # Gemini API request timeout

# Gemini API configuration
GEMINI_API_KEY=your-api-key-here
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta/models
GEMINI_MODEL_NAME=gemini-2.0-flash-exp

# Prompt engineering configuration (optional)
AI_MAX_PROMPT_TOKENS=855000          # Override calculated token limit
AI_HEAD_MESSAGES=10                  # Messages to keep from start
AI_TAIL_MESSAGES=30                  # Messages to keep from end

# Analysis token limits
AI_ANALYSIS_INPUT_TRUNCATION_TARGET_TOKENS=8192   # Target token count for input message truncation
AI_ANALYSIS_TRUNCATE_FIRST_N_TOKENS=1000  # Tokens from conversation start
AI_ANALYSIS_TRUNCATE_LAST_M_TOKENS=4000   # Tokens from conversation end
```

The worker runs in-process with the proxy service and uses PostgreSQL row-level locking to safely process jobs across multiple instances.

### Spark Tool Integration

The dashboard supports the Spark recommendation tool (`mcp__spark__get_recommendation`):

**Features:**

- Automatic detection of Spark tool usage in conversations
- Display of recommendations in a formatted view
- Feedback UI for rating and commenting on recommendations
- Batch fetching of existing feedback
- Integration with Spark API for feedback submission

**Configuration:**

1. Set `SPARK_API_URL` and `SPARK_API_KEY` environment variables
2. The dashboard will automatically detect Spark recommendations in tool_result messages
3. Users can submit feedback directly from the request details page
4. The proxy logs Spark configuration at startup:
   - When configured: Shows URL and confirms API key is set
   - When not configured: Shows "SPARK_API_KEY not set"

**API Endpoints:**

- `POST /api/spark/feedback` - Submit feedback for a recommendation
- `GET /api/spark/sessions/:sessionId/feedback` - Get feedback for a specific session
- `POST /api/spark/feedback/batch` - Get feedback for multiple sessions

**Security Note:**

The dashboard authentication cookie (`dashboard_auth`) is set with `httpOnly: false` to allow JavaScript access for making authenticated API calls from the browser to the proxy service. This is a security trade-off that enables the inline feedback component to work. Consider implementing a more secure approach such as:

- Using a separate API token for browser-based requests
- Implementing a server-side proxy endpoint in the dashboard
- Using session-based authentication with CSRF tokens

### SQL Query Optimization

- Always include all required fields in SELECT statements
- Missing fields like `parent_task_request_id`, `is_subtask`, `task_tool_invocation` will break sub-task tracking
- Use the SLOW_QUERY_THRESHOLD_MS env var to monitor query performance

### Check Token Usage

```bash
# Current 5-hour window usage
curl "http://localhost:3000/api/token-usage/current?accountId=acc_f9e1c2d3b4a5&window=300" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"

# Daily usage (last 30 days)
curl "http://localhost:3000/api/token-usage/daily?accountId=acc_f9e1c2d3b4a5&aggregate=true" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"

# View conversations
curl "http://localhost:3000/api/conversations?accountId=acc_f9e1c2d3b4a5" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"
```

### Copy Conversation Between Databases

```bash
# Copy a conversation from one database to another
bun run db:copy-conversation --conversation-id <uuid> --dest-db <url> [options]

# Example: Copy to staging database (same table names)
bun run db:copy-conversation --conversation-id 123e4567-e89b-12d3-a456-426614174000 \
  --dest-db "postgresql://user:pass@staging-host:5432/staging_db"

# Dry run to preview what would be copied
bun run db:copy-conversation --conversation-id 123e4567-e89b-12d3-a456-426614174000 \
  --dest-db "postgresql://user:pass@staging-host:5432/staging_db" --dry-run

# Copy with streaming chunks
bun run db:copy-conversation --conversation-id 123e4567-e89b-12d3-a456-426614174000 \
  --dest-db "postgresql://user:pass@staging-host:5432/staging_db" --include-chunks

# Use custom table names (e.g., from api_requests to api_requests_backup)
bun run db:copy-conversation --conversation-id 123e4567-e89b-12d3-a456-426614174000 \
  --dest-db "postgresql://user:pass@staging-host:5432/staging_db" \
  --source-table api_requests --dest-table api_requests_backup
```

## Maintenance

### Grooming

The process of `grooming` is used to keep a clean repository. It should be performed regularly and rely on [GROOMING.md](GROOMING.md)
