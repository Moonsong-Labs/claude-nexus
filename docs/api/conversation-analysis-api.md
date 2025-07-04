# Conversation Analysis API

This document describes the REST API endpoints for managing AI-generated analyses of conversations in Claude Nexus Proxy.

## Overview

The Conversation Analysis API provides endpoints to create, retrieve, and regenerate AI-powered analyses of conversation branches. Each analysis is uniquely identified by a conversation ID and branch ID combination.

## Authentication

All endpoints require API key authentication. Include your API key in one of the following headers:

- `X-API-Key: your-api-key`
- `X-Dashboard-Key: your-api-key`
- `Authorization: Bearer your-api-key`

## Endpoints

### Create Analysis

Creates a new analysis for a specific conversation branch. Returns 409 if an active analysis already exists.

```http
POST /api/analyses
Content-Type: application/json

{
  "conversationId": "123e4567-e89b-12d3-a456-426614174000",
  "branchId": "main"
}
```

#### Response

**201 Created** - Analysis successfully queued

```json
{
  "id": "abc123xyz",
  "conversationId": "123e4567-e89b-12d3-a456-426614174000",
  "branchId": "main",
  "status": "pending",
  "message": "Analysis queued for processing"
}
```

**404 Not Found** - Conversation/branch doesn't exist

```json
{
  "error": {
    "code": "conversation_not_found",
    "message": "Conversation 123e4567-e89b-12d3-a456-426614174000 with branch main not found"
  }
}
```

**409 Conflict** - Active analysis already exists

```json
{
  "error": {
    "code": "analysis_exists",
    "message": "Analysis already exists for conversation 123e4567-e89b-12d3-a456-426614174000 branch main",
    "details": {
      "analysisId": "existing123",
      "status": "completed"
    }
  }
}
```

### Get Analysis

Retrieves the latest analysis for a conversation branch, including its status and results.

```http
GET /api/analyses/{conversationId}/{branchId}
```

#### Response

**200 OK** - Analysis found

```json
{
  "id": "abc123xyz",
  "conversationId": "123e4567-e89b-12d3-a456-426614174000",
  "branchId": "main",
  "status": "completed",
  "content": "## Executive Summary\n\nThis conversation discusses...",
  "metadata": {
    "totalTokens": 1500,
    "processingTime": 3200,
    "model": "claude-3-opus-20240229"
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

**404 Not Found** - No analysis exists

```json
{
  "error": {
    "code": "analysis_not_found",
    "message": "No analysis found for conversation 123e4567-e89b-12d3-a456-426614174000 branch main"
  }
}
```

### Regenerate Analysis

Creates a new analysis for a conversation branch that already has an existing analysis. Useful for updating analyses with new models or after conversation changes.

```http
POST /api/analyses/{conversationId}/{branchId}/regenerate
```

#### Response

**201 Created** - Regeneration queued

```json
{
  "id": "newAbc456",
  "conversationId": "123e4567-e89b-12d3-a456-426614174000",
  "branchId": "main",
  "status": "pending",
  "message": "Analysis regeneration queued for processing",
  "previousAnalysisId": "abc123xyz"
}
```

**404 Not Found** - No existing analysis to regenerate

```json
{
  "error": {
    "code": "analysis_not_found",
    "message": "No analysis found for conversation 123e4567-e89b-12d3-a456-426614174000 branch main"
  }
}
```

## Data Types

### Analysis Status

The `status` field can have the following values:

- `pending` - Analysis is queued for processing
- `processing` - Analysis is currently being generated
- `completed` - Analysis successfully completed
- `failed` - Analysis generation failed

### Error Codes

Standard error codes returned by the API:

- `analysis_exists` - Analysis already exists for the conversation branch
- `analysis_not_found` - No analysis found for the specified parameters
- `conversation_not_found` - The specified conversation/branch doesn't exist
- `invalid_params` - Request parameters failed validation
- `processing_error` - Server error during processing
- `queue_error` - Failed to queue the analysis job

## Database Schema

Analyses are stored in the `conversation_analyses` table:

```sql
CREATE TABLE conversation_analyses (
    id VARCHAR(255) PRIMARY KEY,
    conversation_id UUID NOT NULL,
    branch_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    content TEXT,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,

    -- Ensures only one active analysis per conversation branch
    -- Failed analyses can be retried
    CONSTRAINT unique_active_analysis EXCLUDE USING btree (
      conversation_id WITH =,
      branch_id WITH =
    ) WHERE (status NOT IN ('failed'))
);
```

## Implementation Notes

1. **Idempotency**: Creating an analysis is not idempotent - repeated calls will return 409 if an active analysis exists
2. **Retry Logic**: Failed analyses can be retried by calling the create endpoint again
3. **Branch Support**: Each branch of a conversation can have its own independent analysis
4. **Async Processing**: All analysis generation is asynchronous - the API returns immediately with a pending status

## Example Usage

### TypeScript/JavaScript

```typescript
// Create an analysis
const response = await fetch('https://api.example.com/api/analyses', {
  method: 'POST',
  headers: {
    'X-API-Key': 'your-api-key',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    conversationId: '123e4567-e89b-12d3-a456-426614174000',
    branchId: 'main',
  }),
})

if (response.status === 201) {
  const analysis = await response.json()
  console.log(`Analysis ${analysis.id} queued`)
} else if (response.status === 409) {
  // Analysis already exists, fetch it instead
  const getResponse = await fetch(
    'https://api.example.com/api/analyses/123e4567-e89b-12d3-a456-426614174000/main',
    {
      headers: { 'X-API-Key': 'your-api-key' },
    }
  )
  const analysis = await getResponse.json()
  console.log(`Existing analysis:`, analysis)
}
```

### Python

```python
import requests

# Create an analysis
response = requests.post(
    'https://api.example.com/api/analyses',
    headers={'X-API-Key': 'your-api-key'},
    json={
        'conversationId': '123e4567-e89b-12d3-a456-426614174000',
        'branchId': 'main'
    }
)

if response.status_code == 201:
    analysis = response.json()
    print(f"Analysis {analysis['id']} queued")
elif response.status_code == 409:
    # Fetch existing analysis
    get_response = requests.get(
        'https://api.example.com/api/analyses/123e4567-e89b-12d3-a456-426614174000/main',
        headers={'X-API-Key': 'your-api-key'}
    )
    analysis = get_response.json()
    print(f"Existing analysis:", analysis)
```

## Rate Limits

API rate limits are enforced at the proxy level. The analysis endpoints share the same rate limits as other dashboard API endpoints.

## Future Enhancements

The following features are planned for future releases:

1. **Bulk Operations**: Create analyses for multiple conversations in a single request
2. **Webhooks**: Receive notifications when analysis completes
3. **Analysis Templates**: Support different analysis types (summary, technical, security audit)
4. **Streaming**: Stream analysis content as it's generated
5. **Analysis History**: Retrieve all analyses for a conversation, not just the latest
