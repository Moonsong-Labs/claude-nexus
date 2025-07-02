# E2E Tests for Claude Nexus Proxy

This directory contains end-to-end tests for the Claude Nexus Proxy service.

## Overview

The E2E test framework:

- Executes real API requests through the proxy service
- Validates conversation linking, branching, and persistence
- Uses Docker PostgreSQL for authentic database testing
- Supports both streaming and non-streaming responses
- Uses JSON fixtures for test case definitions

## Setup

1. Install dependencies:

```bash
cd e2e
bun install
```

2. Configure test environment:

- Copy `.env.test.example` to `.env.test` if needed
- Update `TEST_CLAUDE_API_KEY` with a valid test API key

## Running Tests

```bash
# Run all E2E tests
bun run test

# Run tests in watch mode
bun run test:watch

# Run Docker services manually
bun run docker:up
bun run docker:logs
bun run docker:down
```

## Test Fixtures

Test cases are defined as JSON files in the `fixtures/` directory. Each fixture contains:

- **authentication**: Domain and API keys for the test
- **steps**: Sequential API requests to execute
- **expected**: Validations for responses and database state

### Fixture Format

```json
{
  "name": "Test name",
  "description": "Optional description",
  "authentication": {
    "domain": "e2e-test.com",
    "clientApiKey": "cnp_test_xxx",
    "claudeApiKey": "sk-ant-xxx"
  },
  "steps": [
    {
      "stepName": "unique_step_name",
      "request": {
        "body": {
          /* Claude API request body */
        }
      },
      "context": {
        "save": {
          "variableName": "path.to.value"
        }
      },
      "expected": {
        "response": {
          "statusCode": 200,
          "body": {
            /* expected fields */
          }
        },
        "dbState": {
          "table": "api_requests",
          "assert": {
            /* expected DB fields */
          }
        }
      }
    }
  ]
}
```

### Special Keywords

- `IS_UUID` - Validates UUID format
- `!IS_NULL` - Ensures value is not null
- `IS_NULL` - Ensures value is null
- `NEW_CONVERSATION` - Generates new conversation ID
- `REF_STEP:stepName.field` - References value from previous step
- `${context.variable}` - Interpolates saved context variable

### Operators

For numeric comparisons:

```json
{
  "stream_chunks_count": {
    "operator": ">=",
    "value": 5
  }
}
```

## Exporting Conversations

Use the export script to copy conversations or requests from the database:

```bash
# Export full conversation
bun run export -c <conversation-id>

# Export specific requests
bun run export -r request1,request2,request3

# Export with streaming chunks
bun run export -c <conversation-id> --include-chunks

# Specify output file
bun run export -c <conversation-id> -o my-conversation.json
```

## Architecture

- **test-harness.ts** - Main test orchestrator
- **runner.ts** - Test execution logic
- **apiClient.ts** - Proxy API client
- **dbClient.ts** - Database operations
- **export-conversation.ts** - Data export utility

The test framework:

1. Starts Docker PostgreSQL
2. Initializes database schema
3. Creates test credentials
4. Starts proxy server
5. Executes test fixtures
6. Validates responses and DB state
7. Cleans up resources

## Adding New Tests

1. Create a new JSON file in `fixtures/`
2. Define test steps with expected outcomes
3. Run `bun run test` to execute

## Debugging

- Set `DEBUG=true` in `.env.test` for verbose logging
- Check Docker logs: `bun run docker:logs`
- Inspect database: Connect to `localhost:5433` with test credentials
