# API Reference - Non-Obvious Patterns Only

## Critical Non-Intuitive Behaviors

### 1. Domain-Based Credential Routing

**The proxy routes based on `Host` header, NOT the request URL:**

```bash
# This determines credential file lookup:
Host: example.com  # -> credentials/example.com.credentials.json
```

### 2. Streaming Response Format

**Streaming uses Server-Sent Events, not typical JSON streaming:**

```
event: content_block_delta
data: {"type":"content_block_delta","delta":{"text":"partial text"},...}
```

### 3. Client Authentication Header Patterns

```bash
# Primary pattern
Authorization: Bearer cnp_live_YOUR_KEY

# Alternative (legacy support)
x-api-key: cnp_live_YOUR_KEY
```

### 4. Token Statistics - Per-Domain Aggregation

**Non-intuitive per-domain response structure:**

```json
{
  "example.com": {
    "request_types": {
      "inference": 145,
      "query_evaluation": 5 // Non-obvious classification
    },
    "total_cache_creation_tokens": 1000, // Separate from input tokens
    "total_cache_read_tokens": 500 // Separate cache read tracking
  }
}
```

## Dashboard API - Critical Security Patterns

### ⚠️ Dashboard Authentication Vulnerability

**Multiple auth methods - use header for API, cookies for UI:**

```bash
# API calls
Authorization: Bearer YOUR_DASHBOARD_KEY

# Browser UI uses different header
X-Dashboard-Key: YOUR_DASHBOARD_KEY

# Automatic cookie after login
Cookie: dashboard_auth=YOUR_DASHBOARD_KEY
```

### Critical Dashboard Endpoints - Non-Obvious Patterns

#### Conversation Tracking (Automatic)

**Non-intuitive branch naming pattern:**

```json
{
  "branches": {
    "main": { "request_count": 8 },
    "branch-2024-01-15-09-30-00": {
      // Timestamp-based branching
      "branched_from": "def456..." // Parent message hash
    }
  }
}
```

**Message hashing for conversation detection (SHA-256 based):**

```json
{
  "parent_message_hash": null,
  "current_message_hash": "abc123...", // Content-based hash
  "message_count": 2 // Position in conversation
}
```

#### AI-Powered Conversation Analysis (Advanced)

**Critical Gemini integration with truncation logic:**

- Uses `gemini-2.5-pro` by default
- **855k token limit with safety margins**
- **Tail-first priority** (recent messages preserved)

**Non-obvious analysis request pattern:**

```json
{
  "conversation_id": "uuid",
  "branch_id": "main", // Defaults to "main" if omitted
  "customPrompt": "Focus on security implications" // Optional override
}
```

**Analysis response includes token usage metrics:**

```json
{
  "model_used": "gemini-2.5-pro",
  "processing_duration_ms": 2500,
  "prompt_tokens": 1000,     // Input to Gemini
  "completion_tokens": 500,  // Gemini's response tokens
  "analysis_data": {         // Structured JSON output
    "summary": "...",
    "insights": ["..."],
    "metrics": {...}
  }
}
```

#### Critical Token Usage - 5-Hour Rolling Window (Non-obvious)

**Default window is 300 minutes (5 hours), not daily:**

```json
{
  "windowStart": "2024-01-15T05:00:00Z",
  "windowEnd": "2024-01-15T10:00:00Z",
  "cacheCreationInputTokens": 1000, // Separate cache token tracking
  "cacheReadInputTokens": 500 // Different from total input tokens
}
```

#### Rate Limiting - Model Fallback Pattern

**Non-obvious fallback model configuration:**

```json
{
  "tokenLimit": 140000,
  "fallbackModel": "claude-3-haiku-20240307", // Auto-downgrade on limits
  "windowMinutes": 300 // 5-hour sliding window
}
```

## Critical Error Patterns

**Proxy-specific error types:**

```json
{
  "error": {
    "type": "authentication_error", // Client API key issues
    "message": "Invalid x-api-key" // Claude API key issues
  }
}
```

**Rate limiting headers forwarded from Claude:**

```bash
x-ratelimit-limit: 100
x-ratelimit-remaining: 99
x-ratelimit-reset: 1705315200  # Unix timestamp
```
