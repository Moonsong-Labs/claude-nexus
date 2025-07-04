# Conversation Analysis API - Quick Reference

## Endpoints at a Glance

| Method | Endpoint                                               | Description         | Status Codes  |
| ------ | ------------------------------------------------------ | ------------------- | ------------- |
| POST   | `/api/analyses`                                        | Create new analysis | 201, 404, 409 |
| GET    | `/api/analyses/{conversationId}/{branchId}`            | Get analysis        | 200, 404      |
| POST   | `/api/analyses/{conversationId}/{branchId}/regenerate` | Regenerate analysis | 201, 404      |

## Authentication

Add one of these headers to all requests:

```
X-API-Key: your-api-key
X-Dashboard-Key: your-api-key
Authorization: Bearer your-api-key
```

## Quick Examples

### Create Analysis

```bash
curl -X POST https://api.example.com/api/analyses \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "123e4567-e89b-12d3-a456-426614174000",
    "branchId": "main"
  }'
```

### Get Analysis

```bash
curl https://api.example.com/api/analyses/123e4567-e89b-12d3-a456-426614174000/main \
  -H "X-API-Key: your-api-key"
```

### Regenerate Analysis

```bash
curl -X POST https://api.example.com/api/analyses/123e4567-e89b-12d3-a456-426614174000/main/regenerate \
  -H "X-API-Key: your-api-key"
```

## Status Values

- `pending` - Queued for processing
- `processing` - Currently being generated
- `completed` - Successfully completed
- `failed` - Generation failed

## Common Error Codes

- `analysis_exists` - Active analysis already exists (409)
- `analysis_not_found` - No analysis found (404)
- `conversation_not_found` - Conversation doesn't exist (404)
- `invalid_params` - Request validation failed (400)
- `processing_error` - Server error (500)

## Response Structures

### Success Response (Create/Regenerate)

```json
{
  "id": "abc123",
  "conversationId": "...",
  "branchId": "main",
  "status": "pending",
  "message": "Analysis queued for processing"
}
```

### Analysis Response (Get)

```json
{
  "id": "abc123",
  "conversationId": "...",
  "branchId": "main",
  "status": "completed",
  "content": "## Analysis\n\n...",
  "metadata": {
    "totalTokens": 1500,
    "processingTime": 3200,
    "model": "claude-3-opus"
  },
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:03Z",
  "completedAt": "2024-01-15T10:30:03Z",
  "conversationDetails": {
    "domain": "example.com",
    "accountId": "acc_123",
    "messageCount": 25,
    "totalTokens": 45000
  }
}
```

### Error Response

```json
{
  "error": {
    "code": "error_code",
    "message": "Human readable message",
    "details": {} // Optional additional context
  }
}
```

## Key Business Rules

1. **One Active Analysis**: Only one non-failed analysis per conversation branch
2. **Failed Retries**: Failed analyses can be retried by creating a new one
3. **Branch Isolation**: Each branch has independent analyses
4. **Async Processing**: All analyses are processed asynchronously

## TypeScript Types

```typescript
import {
  CreateAnalysisRequest,
  GetAnalysisResponse,
  AnalysisErrorResponse,
  AnalysisStatus,
} from '@claude-nexus/shared/types/analysis'
```

## Database Query Examples

### Find Pending Analyses

```sql
SELECT * FROM conversation_analyses
WHERE status = 'pending'
ORDER BY created_at ASC;
```

### Get Latest Analysis

```sql
SELECT * FROM conversation_analyses
WHERE conversation_id = $1 AND branch_id = $2
ORDER BY created_at DESC
LIMIT 1;
```

### Check Active Analysis

```sql
SELECT id, status FROM conversation_analyses
WHERE conversation_id = $1
  AND branch_id = $2
  AND status NOT IN ('failed')
LIMIT 1;
```
