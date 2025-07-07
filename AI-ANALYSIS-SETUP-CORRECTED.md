# AI Analysis Feature Setup Guide (On-Demand Mode)

This guide sets up the AI-powered conversation analysis feature for **on-demand** execution only.

## Important Architecture Note

The current implementation uses a background worker pattern where:

1. API creates analysis requests with `status='pending'`
2. Background worker polls and processes pending jobs
3. Results are stored in the database

For true on-demand execution, you have two options:

### Option 1: Keep Worker but Disable Auto-Polling (Recommended)

Keep the background worker architecture but only process when explicitly triggered.

## Setup Steps

### 1. Database Migrations (Required)

```bash
# Run both migrations
bun run scripts/db/migrations/011-add-conversation-analyses.ts
bun run scripts/db/migrations/012-add-analysis-audit-log.ts
```

### 2. Environment Variables

Add to your `.env` file:

```bash
# ===================
# AI Analysis Configuration
# ===================

# IMPORTANT: Set to false for on-demand only
AI_WORKER_ENABLED=false

# Gemini API Configuration (REQUIRED)
GEMINI_API_KEY=your-actual-gemini-api-key-here
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta/models
GEMINI_MODEL_NAME=gemini-2.0-flash-exp

# Processing settings (used when triggered)
AI_ANALYSIS_MAX_RETRIES=3
AI_ANALYSIS_GEMINI_REQUEST_TIMEOUT_MS=60000

# Token limits
AI_ANALYSIS_INPUT_TRUNCATION_TARGET_TOKENS=8192
AI_ANALYSIS_TRUNCATE_FIRST_N_TOKENS=1000
AI_ANALYSIS_TRUNCATE_LAST_M_TOKENS=4000
```

### 3. Get Gemini API Key

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create an API key
3. Add to `.env` file

### 4. Usage Patterns

#### A. Dashboard Usage (Manual Trigger)

When `AI_WORKER_ENABLED=false`, the API creates analysis records but they remain `pending`. You'll need to:

1. Create analysis request via dashboard/API:

```bash
curl -X POST http://localhost:3001/api/analyses \
  -H "Content-Type: application/json" \
  -H "X-Dashboard-Key: your-dashboard-api-key" \
  -d '{
    "conversationId": "550e8400-e29b-41d4-a716-446655440000",
    "branchId": "main"
  }'
```

2. Manually trigger processing (requires custom endpoint or script):

```bash
# This would need to be implemented
curl -X POST http://localhost:3001/api/analyses/process-pending \
  -H "X-Dashboard-Key: your-dashboard-api-key"
```

#### B. CLI Script for On-Demand Processing

Create a script `scripts/process-analysis.ts`:

```typescript
#!/usr/bin/env bun

import { Pool } from 'pg'
import { AnalysisWorker } from '../services/proxy/src/workers/ai-analysis/AnalysisWorker.js'

async function processOnDemand(conversationId?: string) {
  const worker = new AnalysisWorker()

  if (conversationId) {
    // Process specific conversation
    await worker.processConversation(conversationId)
  } else {
    // Process all pending
    await worker.processPendingJobs()
  }
}

// Usage: bun run scripts/process-analysis.ts [conversationId]
const conversationId = process.argv[2]
processOnDemand(conversationId)
```

### Option 2: Implement Synchronous Processing (Requires Code Changes)

To make the API truly synchronous, you would need to modify the `/api/analyses` endpoint to:

1. Create the analysis record
2. Immediately call the Gemini API
3. Return the result in the same request

This would require modifying `services/proxy/src/routes/analyses.ts` to call the analysis service directly instead of just creating a pending record.

## Current Limitations

The existing implementation is designed for background processing. For true on-demand:

1. **API creates pending records only** - Processing requires separate trigger
2. **No built-in synchronous mode** - Would need code modifications
3. **Dashboard expects async pattern** - UI might show "pending" status

## Recommended Approach

1. Keep `AI_WORKER_ENABLED=false`
2. Create a manual trigger script or API endpoint
3. Call it when you want to process analyses
4. This gives you full control over when processing happens

## Alternative: Scheduled Processing

If you want periodic processing instead of continuous:

```bash
# Run every hour via cron
0 * * * * cd /path/to/project && bun run scripts/process-analysis.ts
```

## Monitoring

Check analysis status:

```sql
SELECT
  conversation_id,
  branch_id,
  status,
  created_at,
  updated_at,
  error_message
FROM conversation_analyses
ORDER BY created_at DESC;
```

## Cost Control

With on-demand processing:

- You control exactly when API calls are made
- No surprise costs from background processing
- Can implement approval workflow if needed
