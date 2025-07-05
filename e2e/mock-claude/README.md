# Mock Claude API for E2E Testing

A lightweight mock server that simulates Claude API responses for end-to-end testing purposes.

## Overview

This mock server provides a flexible way to test applications that integrate with the Claude API without making actual API calls. It uses JSON test data files to define request patterns and corresponding responses.

## Features

- **JSON-based test data**: Define request patterns and responses in JSON files
- **Dynamic placeholder replacement**: Supports `{{nanoid}}`, `{{timestamp}}`, and `{{timestamp_iso}}` placeholders
- **Streaming support**: Handles both streaming and non-streaming responses
- **Flexible request matching**: Uses lodash.ismatch for partial object matching
- **Specificity-based matching**: More specific request patterns are matched first
- **Error simulation**: Includes mock definitions for common error scenarios (429, 400, 500)

## Usage

### Starting the Server

```bash
cd e2e/mock-claude
bun run server.ts
# or
MOCK_CLAUDE_PORT=8082 bun run server.ts
```

Default port is 8081.

### Running Tests

```bash
bun test e2e/mock-claude.test.ts
```

## Test Data Structure

Test data files are organized in `test-data/`:

```
test-data/
├── by-feature/
│   ├── basic-completion/
│   │   ├── simple-text.json
│   │   └── simple-stream.json
│   └── tool-use/
│       └── web-search-response.json
├── by-response-type/
│   └── errors/
│       ├── 400-invalid-request.json
│       ├── 429-rate-limit.json
│       └── 500-server-error.json
└── zzz-default.json  # Catch-all fallback
```

### Mock Definition Format

Each JSON file defines a mock with the following structure:

```json
{
  "name": "Description of the mock",
  "request": {
    // Request pattern to match against
    "model": "claude-3-opus-20240229",
    "messages": [
      {
        "role": "user",
        "content": "What is the capital of France?"
      }
    ],
    "stream": false
  },
  "response": {
    "status": 200,
    "headers": {
      // Optional custom headers
    },
    "body": {
      // Response body for non-streaming responses
    },
    "stream": true, // Optional: for streaming responses
    "chunks": [
      // Required if stream is true
      // Array of SSE chunks
    ]
  }
}
```

### Request Matching

The mock server uses lodash.ismatch for flexible partial matching:

- Only fields specified in the request pattern need to match
- Arrays and nested objects are deep-matched
- More specific patterns (longer JSON strings) are checked first
- An empty request pattern `{}` matches all requests (catch-all)

### Dynamic Placeholders

The following placeholders are replaced at runtime:

- `{{nanoid}}` - Generates a unique ID
- `{{timestamp}}` - Current timestamp in milliseconds
- `{{timestamp_iso}}` - ISO 8601 formatted timestamp

## API Endpoints

- `GET /health` - Health check endpoint
- `POST /v1/messages` - Claude API messages endpoint

## Environment Variables

- `MOCK_CLAUDE_PORT` - Server port (default: 8081)

## Adding New Mocks

1. Create a new JSON file in the appropriate directory
2. Define the request pattern (be specific to avoid unintended matches)
3. Define the expected response
4. The server automatically loads all JSON files on startup

## Best Practices

1. **Be specific with request patterns**: Include model, role, and other fields to avoid matching unintended requests
2. **Organize by feature or response type**: Use subdirectories to keep mocks organized
3. **Use descriptive names**: The "name" field helps with debugging
4. **Test edge cases**: Include error responses and edge cases in your mocks
5. **Default fallback**: The catch-all mock ensures tests don't fail on unexpected requests
