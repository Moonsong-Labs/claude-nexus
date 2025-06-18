# Error Propagation Enhancement

## Overview

Enhanced error message propagation from Claude API through the proxy to ensure clients receive detailed error information instead of generic error messages.

## Changes Made

### 1. Enhanced UpstreamError Class (`src/types/errors.ts`)

- Added `upstreamResponse` property to store the original Claude API error response
- Updated constructor to accept and store the full error response from Claude
- Modified status code to use the upstream status instead of defaulting to 502

### 2. Improved Error Parsing (`src/services/ClaudeApiClient.ts`)

- Parse Claude API error responses and store both the error message and full response
- For non-JSON errors, create a structured error object to maintain consistency
- Pass the parsed error response to UpstreamError for propagation

### 3. Updated Error Serialization (`src/types/errors.ts`)

- Special handling for UpstreamError to return Claude's original error format
- Preserve original error messages instead of generic "An unexpected error occurred"
- Maintain compatibility with Claude API error response structure

### 4. Fixed Status Code Handling (`src/controllers/MessageController.ts`)

- Properly extract status codes from different error types
- Use the actual upstream status code instead of defaulting to 500
- Handle ValidationError (400) and other BaseError types correctly

### 5. Enhanced Streaming Error Handling (`src/services/ProxyService.ts`)

- Added error event sending in SSE format for streaming responses
- Track metrics and send notifications for streaming errors
- Ensure errors are properly logged and propagated

## Testing

A test script is provided at `test-error-propagation.mjs` to verify error propagation:

```bash
# Run with default settings (localhost:3000)
./test-error-propagation.mjs

# Run with custom proxy URL
PROXY_URL=https://your-proxy.com ./test-error-propagation.mjs
```

The script tests various error scenarios:

- Invalid request format
- Invalid model names
- Empty messages array
- Invalid message roles
- Max tokens exceeding limits

## Benefits

1. **Better Debugging**: Clients receive detailed error messages from Claude API
2. **Correct Status Codes**: HTTP status codes match the actual error type
3. **API Compatibility**: Error responses maintain Claude API format
4. **Streaming Support**: Errors in streaming responses are properly communicated

## Example

Before:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred",
    "statusCode": 500
  }
}
```

After:

```json
{
  "error": {
    "type": "invalid_request_error",
    "message": "messages: Expected an array with at least 1 element, but got an empty array"
  }
}
```
