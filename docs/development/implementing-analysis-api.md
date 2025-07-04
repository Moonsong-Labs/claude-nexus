# Implementing the Conversation Analysis API

This guide provides technical details for developers working with the Conversation Analysis API implementation.

## Architecture Overview

The API follows a standard layered architecture:

```
┌─────────────────┐
│   API Routes    │  /api/analyses/*
├─────────────────┤
│   Middleware    │  Authentication, Validation
├─────────────────┤
│     Types       │  Zod schemas, TypeScript interfaces
├─────────────────┤
│    Database     │  PostgreSQL with conversation_analyses table
└─────────────────┘
```

## File Structure

```
claude-nexus-proxy/
├── packages/shared/src/types/
│   ├── analysis.ts          # Type definitions and schemas
│   └── index.ts            # Export aggregation
├── services/proxy/src/
│   ├── routes/
│   │   └── analyses.ts     # API endpoint implementations
│   └── app.ts              # Route registration
├── scripts/
│   ├── init-database.sql   # Initial schema
│   └── db/migrations/
│       └── 009-add-conversation-analyses-table.ts
```

## Type Definitions

### Core Types (packages/shared/src/types/analysis.ts)

```typescript
// Analysis status enum
export enum AnalysisStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// Main analysis interface
export interface Analysis {
  id: string
  conversationId: string
  branchId: string
  status: AnalysisStatus
  content?: string
  metadata?: {
    totalTokens?: number
    processingTime?: number
    model?: string
    error?: string
  }
  createdAt: Date
  updatedAt: Date
  completedAt?: Date
}
```

### Request Validation

All requests are validated using Zod schemas:

```typescript
export const createAnalysisSchema = z.object({
  conversationId: z.string().uuid(),
  branchId: z.string(),
})

export const analysisParamsSchema = z.object({
  conversationId: z.string().uuid(),
  branchId: z.string(),
})
```

## API Implementation Details

### Route Setup (services/proxy/src/app.ts)

```typescript
// Analysis routes are protected by API authentication
app.use('/api/*', apiAuthMiddleware())
app.route('/api/analyses', analysesRoutes)
```

### Endpoint Implementation Pattern

Each endpoint follows this pattern:

1. **Pool Validation**: Check database connection availability
2. **Request Validation**: Parse and validate input with Zod
3. **Business Logic**: Execute queries and handle edge cases
4. **Error Handling**: Return typed error responses
5. **Logging**: Log operations with metadata

Example from POST endpoint:

```typescript
analysesRoutes.post('/', async c => {
  // 1. Pool validation
  const pool = c.get('pool')
  if (!pool) {
    return c.json<AnalysisErrorResponse>(
      {
        error: {
          code: 'service_unavailable',
          message: 'Database service is not available',
        },
      },
      503
    )
  }

  try {
    // 2. Request validation
    const body = await c.req.json()
    const params = createAnalysisSchema.parse(body)

    // 3. Business logic
    // ... check conversation exists
    // ... check for existing analysis
    // ... create new analysis

    // 4. Success response
    return c.json(response, 201)
  } catch (error) {
    // 5. Error handling
    if (error instanceof Error && error.name === 'ZodError') {
      return c.json<AnalysisErrorResponse>(
        {
          error: {
            code: AnalysisErrorCodes.INVALID_PARAMS,
            message: 'Invalid request parameters',
            details: error,
          },
        },
        400
      )
    }
    // ... handle other errors
  }
})
```

## Database Design

### Schema Considerations

The `conversation_analyses` table uses several PostgreSQL features:

1. **Exclusion Constraint**: Prevents duplicate active analyses

```sql
CONSTRAINT unique_active_analysis EXCLUDE USING btree (
  conversation_id WITH =,
  branch_id WITH =
) WHERE (status NOT IN ('failed'))
```

2. **Check Constraint**: Validates status values

```sql
status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
```

3. **JSONB Metadata**: Flexible storage for analysis metadata

```sql
metadata JSONB
```

### Index Strategy

Two indexes optimize common queries:

```sql
-- Primary lookup pattern
CREATE INDEX idx_conversation_analyses_lookup
ON conversation_analyses(conversation_id, branch_id, created_at DESC);

-- Queue processing pattern
CREATE INDEX idx_conversation_analyses_status
ON conversation_analyses(status)
WHERE status IN ('pending', 'processing');
```

## Integration Points

### Authentication

The API uses the existing `apiAuthMiddleware` which supports three header formats:

- `X-API-Key`
- `X-Dashboard-Key`
- `Authorization: Bearer`

### Database Connection

Routes receive the database pool via Hono context:

```typescript
const pool = c.get('pool')
```

### Error Response Format

All errors follow a consistent structure:

```typescript
interface AnalysisErrorResponse {
  error: {
    code: string
    message: string
    details?: any
  }
}
```

## Testing Considerations

### Unit Tests

Test each endpoint with:

1. Valid requests
2. Invalid UUIDs
3. Missing parameters
4. Duplicate creation attempts
5. Non-existent conversations

### Integration Tests

1. Database constraint validation
2. Concurrent creation handling
3. Transaction rollback scenarios

### Example Test

```typescript
describe('POST /api/analyses', () => {
  it('should return 409 for duplicate active analysis', async () => {
    // Create first analysis
    const response1 = await request(app).post('/api/analyses').set('X-API-Key', 'test-key').send({
      conversationId: 'test-uuid',
      branchId: 'main',
    })

    expect(response1.status).toBe(201)

    // Attempt duplicate
    const response2 = await request(app).post('/api/analyses').set('X-API-Key', 'test-key').send({
      conversationId: 'test-uuid',
      branchId: 'main',
    })

    expect(response2.status).toBe(409)
    expect(response2.body.error.code).toBe('analysis_exists')
  })
})
```

## Async Processing Integration

The current implementation creates records with `pending` status. The async processor should:

1. **Poll for pending analyses**:

```sql
SELECT * FROM conversation_analyses
WHERE status = 'pending'
ORDER BY created_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;
```

2. **Update status to processing**:

```sql
UPDATE conversation_analyses
SET status = 'processing', updated_at = NOW()
WHERE id = $1;
```

3. **Generate analysis** (implementation-specific)

4. **Update with results**:

```sql
UPDATE conversation_analyses
SET
  status = 'completed',
  content = $2,
  metadata = $3,
  completed_at = NOW(),
  updated_at = NOW()
WHERE id = $1;
```

## Security Considerations

1. **SQL Injection**: All queries use parameterized statements
2. **UUID Validation**: Zod ensures valid UUID format
3. **Rate Limiting**: Inherits from proxy middleware
4. **Authentication**: Required for all endpoints
5. **Input Validation**: Strict schema validation with Zod

## Performance Optimization

1. **Database Indexes**: Optimized for common query patterns
2. **Connection Pooling**: Reuses database connections
3. **Minimal Queries**: Each endpoint uses 2-3 queries max
4. **No N+1 Queries**: Conversation details fetched in single query

## Monitoring and Debugging

### Logging

All operations log with structured metadata:

```typescript
logger.info('Analysis queued', {
  metadata: {
    analysisId: newAnalysis.id,
    conversationId: params.conversationId,
    branchId: params.branchId,
  },
})
```

### Metrics to Track

1. Analysis creation rate
2. Queue depth (pending analyses)
3. Processing time distribution
4. Failure rate by error code
5. API response times

## Future Enhancements

### Planned Features

1. **Batch Creation**: Accept array of conversation IDs
2. **Analysis Types**: Support different analysis templates
3. **Webhooks**: POST to URL on completion
4. **TTL**: Auto-expire old analyses
5. **Compression**: Store large analyses compressed

### Extension Points

The design allows easy extension:

- Add fields to `metadata` JSONB
- New status values (with migration)
- Additional endpoints for management
- Custom analysis processors per domain
