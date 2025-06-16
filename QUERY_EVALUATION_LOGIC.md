# Query Evaluation Request Detection Logic

## Overview

The Claude Nexus Proxy uses a specific logic to determine whether a request is a "query_evaluation" request (considered insignificant and ignored) versus an "inference" request (considered significant and tracked/stored).

## Original Intent

Based on the code analysis and test files, the original intent was to identify requests that are "insignificant and should be ignored based on the fact they have only 1 message in their System payload."

## Current Implementation

### Detection Logic

The proxy counts the total number of system messages in a request:

1. **System field count**: If `request.system` exists, it counts as 1 system message
2. **Messages array count**: Each message with `role: 'system'` in the messages array is counted
3. **Total**: The sum of both counts determines the request type

### Classification Rules

- **Exactly 1 system message** → `query_evaluation` (insignificant)
- **0 or more than 1 system messages** → `inference` (significant)

### Code Location

The logic is implemented in:
- `services/proxy/src/domain/entities/ProxyRequest.ts` - `determineRequestType()` method
- `services/proxy/src/types/claude.ts` - `countSystemMessages()` helper function

### Example Code

```typescript
// From ProxyRequest.ts
private determineRequestType(): RequestType {
  const systemMessageCount = this.countSystemMessages()
  
  // If there's only 1 system message, it's a query evaluation (insignificant request)
  if (systemMessageCount === 1) {
    return 'query_evaluation'
  }
  
  // If there are 0 or more than 1 system messages, it's an inference (significant request)
  return 'inference'
}

// From claude.ts
export function countSystemMessages(request: ClaudeMessagesRequest): number {
  let count = request.system ? 1 : 0
  count += request.messages.filter(m => m.role === 'system').length
  return count
}
```

## Behavior Implications

### For Query Evaluation Requests (1 system message):
- **NOT stored** in the database
- **NOT tracked** in token statistics
- **NOT sent** to Slack notifications
- **Debug logs skipped** (when DEBUG=true)
- **Telemetry sent** but with minimal data

### For Inference Requests (0 or >1 system messages):
- **Stored** in the database
- **Tracked** in token statistics
- **Sent** to Slack notifications
- **Debug logs included**
- **Full telemetry** collected

## Test Cases

From `test-system-message-logic.js`:

1. **No system messages** → inference (stored)
2. **One system message in system field** → query_evaluation (NOT stored)
3. **One system message in messages array** → query_evaluation (NOT stored)
4. **Two system messages (system field + message)** → inference (stored)
5. **Three or more system messages** → inference (stored)

## Rationale

The logic appears to be designed to filter out simple, single-context requests that might be used for:
- Health checks
- Simple evaluations
- Testing
- Minimal context queries

These are considered "insignificant" and don't need to be tracked or stored, reducing noise in logs and storage.

## Configuration

Currently, this behavior is **hardcoded** and cannot be configured via environment variables. To change this behavior, you would need to modify the `determineRequestType()` method in `ProxyRequest.ts`.