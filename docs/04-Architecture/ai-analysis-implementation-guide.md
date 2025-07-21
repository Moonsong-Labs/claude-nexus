# AI-Powered Conversation Analysis - Implementation Guide

This document contains the detailed implementation information for the AI-powered conversation analysis feature described in [ADR-018](./ADRs/adr-018-ai-powered-conversation-analysis.md).

## Implementation Details

### Phase 1: Database Schema

**Migration 011** creates the conversation analyses table:

```sql
CREATE TABLE conversation_analyses (
    id BIGSERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL,
    branch_id VARCHAR(255) NOT NULL DEFAULT 'main',
    status conversation_analysis_status NOT NULL DEFAULT 'pending',
    model_used VARCHAR(255) DEFAULT 'gemini-2.5-pro',
    analysis_content TEXT,
    analysis_data JSONB,
    raw_response JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    generated_at TIMESTAMPTZ,
    processing_duration_ms INTEGER,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (conversation_id, branch_id)
);
```

Key features:

- Proper indexing for performance
- Status tracking with ENUM type
- Token usage tracking for cost management
- Retry count for resilience

### Phase 2: API Implementation

#### API Endpoints

**Dashboard API Routes**: `services/dashboard/src/routes/analysis-api.ts`

- `POST /api/analyses` - Create analysis request
  - Returns 409 if analysis already exists
  - Supports custom prompts via request body
- `GET /api/analyses/:conversationId/:branchId` - Get analysis
  - Returns status and results
  - Includes token usage information
- `POST /api/analyses/:conversationId/:branchId/regenerate` - Force regeneration
  - Deletes existing analysis and creates new one
  - Supports custom prompts for targeted analysis

**Type Definitions**: `packages/shared/src/types/ai-analysis.ts`

- Zod schemas for request/response validation
- Consistent error handling patterns
- Integrated with dashboard authentication middleware

#### Prompt Engineering

**Key Components**:

- **Tokenizer**: @lenml/tokenizer-gemini for accurate token counting
- **Truncation**: Smart tail-first priority with 855k token limit (5% safety margin)
- **Prompt Format**: Multi-turn conversation structure optimized for Gemini

**Implementation Files**:

- `packages/shared/src/types/ai-analysis.ts` - Analysis schema definitions
- `packages/shared/src/prompts/truncation.ts` - Smart truncation logic
- `packages/shared/src/prompts/analysis/` - Versioned prompt templates

**Configuration via Environment Variables**:

- `AI_MAX_PROMPT_TOKENS` - Override calculated token limit
- `AI_HEAD_MESSAGES` - Messages to keep from conversation start
- `AI_TAIL_MESSAGES` - Messages to keep from conversation end
- `AI_ANALYSIS_INPUT_TRUNCATION_TARGET_TOKENS` - Target token count
- `AI_ANALYSIS_TRUNCATE_FIRST_N_TOKENS` - Tokens from start
- `AI_ANALYSIS_TRUNCATE_LAST_M_TOKENS` - Tokens from end

#### Background Worker

**Architecture**: In-process background worker using database polling

**Key Files**:

- `services/proxy/src/workers/ai-analysis/AnalysisWorker.ts` - Main worker class
- `services/proxy/src/workers/ai-analysis/db.ts` - Database operations
- `services/proxy/src/workers/ai-analysis/GeminiService.ts` - Gemini API client
- `services/proxy/src/workers/ai-analysis/index.ts` - Worker lifecycle management

**Features**:

1. **Job Management**
   - PostgreSQL row-level locking (`FOR UPDATE SKIP LOCKED`)
   - Prevents duplicate processing across instances
   - Automatic stuck job detection and recovery

2. **Error Handling**
   - Exponential backoff with jitter for retries
   - Automatic failure of jobs exceeding `AI_ANALYSIS_MAX_RETRIES`
   - Graceful handling of unparseable JSON responses
   - Non-retryable error detection for critical failures

3. **JSON Parse Failure Handling**
   - Stores raw text response as `analysis_content`
   - Sets `analysis_data` to null
   - UI displays raw text instead of error

4. **Configuration**
   ```bash
   AI_WORKER_ENABLED=true
   AI_WORKER_POLL_INTERVAL_MS=5000
   AI_WORKER_MAX_CONCURRENT_JOBS=3
   AI_WORKER_JOB_TIMEOUT_MINUTES=5
   AI_ANALYSIS_MAX_RETRIES=3
   AI_ANALYSIS_GEMINI_REQUEST_TIMEOUT_MS=60000
   ```

### Management Utilities

**Scripts** (in package.json):

- `ai:check-jobs` - Check analysis job statuses
- `ai:check-content` - Inspect analysis content for a conversation
- `ai:check-config` - Verify AI worker configuration
- `ai:reset-stuck` - Reset jobs with high retry counts
- `ai:fail-exceeded` - Manually fail jobs exceeding max retries
- `ai:test-max-retry` - Create test jobs for max retry handling

**Example Usage**:

```bash
# Check status of all analysis jobs
bun run ai:check-jobs

# Inspect analysis content for specific conversation
bun run ai:check-content <conversation-id> <branch-id>

# Fail jobs that have exceeded retry limit
bun run ai:fail-exceeded
```

### Security Improvements

As documented in [ADR-019: AI Analysis DB Refactoring](./ADRs/adr-019-ai-analysis-db-refactoring.md):

1. **SQL Injection Prevention**
   - Replaced string interpolation with parameterized queries
   - Added input validation for INTERVAL clauses

2. **Code Quality**
   - Extracted SQL queries to constants
   - Reduced code duplication
   - Added comprehensive JSDoc documentation

3. **Error Handling**
   - Consistent error parsing and logging
   - Better error messages for debugging

## Monitoring and Operations

### Health Checks

- Worker status available via proxy health endpoint
- Metrics include:
  - Jobs processed
  - Average processing time
  - Error rates
  - Token usage

### Troubleshooting

**Common Issues**:

1. **Jobs Stuck in Pending**
   - Check worker logs for errors
   - Verify Gemini API key is valid
   - Run `bun run ai:reset-stuck` to reset

2. **JSON Parse Errors**
   - System handles gracefully by storing raw text
   - Check `analysis_content` field for raw response
   - Review prompts if errors are frequent

3. **High Token Usage**
   - Adjust truncation settings via environment variables
   - Monitor token usage in database
   - Consider more aggressive truncation for large conversations

## Future Enhancements

1. **Custom Analysis Types**
   - Support for different analysis templates
   - User-defined prompts and schemas

2. **Webhook Notifications**
   - Notify external systems when analysis completes
   - Support for multiple webhook endpoints

3. **Real-time Triggers**
   - Analyze conversations as they complete
   - Event-driven architecture integration

4. **Multi-model Support**
   - Add support for Claude, GPT-4, etc.
   - Model selection based on conversation characteristics
