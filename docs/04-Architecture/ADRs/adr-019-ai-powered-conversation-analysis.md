# ADR-019: AI-Powered Conversation Analysis

## Status

Accepted

## Context

As the Claude Nexus Proxy processes increasing volumes of conversations, users need insights into conversation patterns, quality, and outcomes. Currently, users must manually review conversations to understand their effectiveness, common patterns, and areas for improvement. Manual analysis is time-consuming and does not scale.

## Decision Drivers

- **Scalability**: Must handle analyzing thousands of conversations efficiently.
- **Flexibility**: Support multiple AI models (Gemini, Claude, etc.).
- **Performance**: Background processing to avoid impacting proxy performance.
- **Cost Control**: Manage API costs through smart batching and caching.
- **Privacy**: Ensure conversation data remains secure during analysis.
- **Extensibility**: Easy to add new analysis types and metrics.

## Considered Options

1.  **Real-time Analysis During Proxy Requests**: Analyze conversations as they happen. Pros: Immediate insights. Cons: Adds latency, increases costs, harder to manage failures.
2.  **Dedicated Analysis Microservice**: A separate service for analysis. Pros: Complete isolation, independent scaling. Cons: Complex deployment, data synchronization challenges.
3.  **Background Jobs in Proxy Service**: Background workers within the proxy using database polling. Pros: Simple deployment, shared database access. Cons: Competes for proxy resources.
4.  **Event-Driven Lambda/Cloud Functions**: Serverless functions for analysis. Pros: Auto-scaling, pay-per-use. Cons: Vendor lock-in, cold starts.

## Decision

We will implement **Background Jobs in the Proxy Service** with database polling. This approach offers the best balance of implementation simplicity and scalability for the initial version, with a clear migration path to a dedicated microservice if future needs require it.

### Implementation Details

#### 1. Database Schema

A new `conversation_analyses` table stores all analysis data, including status, results, and metadata.

```sql
CREATE TABLE conversation_analyses (
    id BIGSERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL,
    branch_id VARCHAR(255) NOT NULL DEFAULT 'main',
    status conversation_analysis_status NOT NULL DEFAULT 'pending', -- (pending, processing, completed, failed)
    model_used VARCHAR(255),
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
CREATE INDEX idx_conversation_analyses_status ON conversation_analyses (status) WHERE status = 'pending';
```

#### 2. API Design

The dashboard service exposes endpoints for managing analysis jobs:

- `POST /api/analyses`: Create a new analysis request.
- `GET /api/analyses/:conversationId/:branchId`: Retrieve analysis status and results.
- `POST /api/analyses/:conversationId/:branchId/regenerate`: Force a new analysis.

#### 3. Background Processing

A background worker within the proxy service polls the database for pending jobs. It uses row-level locking (`FOR UPDATE SKIP LOCKED`) to handle concurrent workers. A watchdog process handles jobs that get stuck in a processing state.

#### 4. Prompt Engineering

- **Smart Truncation**: To manage context windows and cost, a tail-first truncation strategy is used for long conversations, preserving the most recent messages.
- **Tokenizer**: The `@lenml/tokenizer-gemini` library is used for accurate, local token counting before sending requests to the Gemini API.
- **Response Validation**: A Zod schema is used to validate the structure of the JSON response from the analysis model, ensuring data consistency.

#### 5. UI/UX Implementation

The dashboard will feature an `AnalysisPanel` component that allows users to trigger, view, and regenerate analyses. The panel will be stateful, polling the API for updates and displaying the status (e.g., "Processing...", "Completed", "Failed").

#### 6. Configuration

Key settings are managed via environment variables:

- `AI_WORKER_ENABLED`: Globally enables or disables the feature.
- `GEMINI_API_KEY`: The API key for the analysis model.
- `AI_WORKER_POLL_INTERVAL_MS`: How often the worker checks for new jobs.
- `AI_ANALYSIS_MAX_RETRIES`: Number of times to retry a failed analysis.
- `AI_MAX_PROMPT_TOKENS`: Safety limit for prompt size to control costs.

#### 7. Security & Monitoring

- **Security**: The worker uses a least-privilege database role. All API endpoints are protected by the standard dashboard authentication. PII redaction and prompt injection protection are included.
- **Monitoring**: Key metrics such as queue depth, processing duration, and error rates will be tracked. All analysis operations are logged for auditing.

#### 8. Testing Strategy

- **Unit Tests**: Cover prompt generation, API handlers, and worker logic.
- **Integration Tests**: Verify the end-to-end flow from API request to database update.
- **Load Tests**: Assess worker scalability and database performance under load.

## Consequences

### Positive

- **Simple Deployment**: No new services to deploy for the initial implementation.
- **Shared Resources**: Reuses the existing database and application framework.
- **Cost-Effective**: Background processing with configurable limits helps control API costs.
- **Easy Migration Path**: The design allows for extraction into a dedicated microservice in the future.

### Negative

- **Resource Competition**: Background jobs will share CPU and memory with the core proxy service.
- **Scaling Limitations**: The analysis worker's performance is tied to the scaling of the proxy service.
- **Deployment Coupling**: Any updates to the analysis feature require a full redeployment of the proxy service.

### Risks and Mitigations

- **Risk**: Background jobs impact proxy performance.
  - **Mitigation**: Use configurable concurrency limits and monitor resource usage.
- **Risk**: High API costs from large conversations.
  - **Mitigation**: Implement strict token counting and smart truncation strategies.
- **Risk**: Long-running jobs block the queue.
  - **Mitigation**: Implement job timeouts and a watchdog process to handle stuck jobs.

## Links

- [Database Schema Evolution ADR](./adr-012-database-schema-evolution.md)
- [PR #75: Database Schema Implementation](https://github.com/Moonsong-Labs/claude-nexus-proxy/pull/75)
