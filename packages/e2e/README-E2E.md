# E2E Test Framework for Claude Nexus Proxy

This package provides an end-to-end testing framework for testing conversation tracking through the actual proxy.

## Overview

The E2E test framework:

- Runs real requests through the proxy (not mocks)
- Uses a mock Claude API server to avoid hitting the real API
- Validates conversation tracking in the database
- Supports dynamic value substitution with keywords
- Can import real conversations as test fixtures

## Architecture

```
E2E Test Flow:
1. PostgreSQL Container (test database)
2. Mock Claude API Server (returns canned responses)
3. Proxy Server (configured to use mock API)
4. Test Runner (sends requests and validates database state)
```

## Features

### Dynamic Value Substitution

Tests can use keywords for expected values:

- `$new` - Expect a new UUID
- `$same` - Same as previous request
- `$different` - Different from previous request
- `$previous` - Reference to previous request ID
- `$null` - Expect null value
- `$main` - Main branch
- `$branch_*` - Any branch starting with prefix

### Test Case Structure

```typescript
{
  description: "Test description",
  variables: {
    // Define variables for reuse
    conv_id: "uuid"
  },
  requests: [
    {
      domain: "test.example.com",
      body: {
        model: "claude-3-sonnet-20240229",
        messages: [...]
      },
      expectDatabase: {
        conversationId: "$new",
        branchId: "$main",
        messageCount: 1
      }
    }
  ]
}
```

## Running Tests

### Manual Testing

1. Start PostgreSQL:

```bash
docker run -d --name e2e-postgres \
  -e POSTGRES_USER=test_user \
  -e POSTGRES_PASSWORD=test_pass \
  -e POSTGRES_DB=claude_nexus_test \
  -p 5433:5432 \
  postgres:16-alpine
```

2. Initialize database:

```bash
PGPASSWORD=test_pass psql -h localhost -p 5433 -U test_user \
  -d claude_nexus_test -f ../../scripts/init-database.sql
```

3. Start mock Claude API:

```bash
cd packages/e2e
bun run src/setup/run-mock-claude.ts
```

4. Start proxy:

```bash
DATABASE_URL=postgresql://test_user:test_pass@localhost:5433/claude_nexus_test \
PORT=3100 \
STORAGE_ENABLED=true \
ENABLE_CLIENT_AUTH=false \
CLAUDE_API_URL=http://localhost:3101/mock-claude \
bun run services/proxy/src/main.ts
```

5. Run tests:

```bash
cd packages/e2e
DATABASE_URL=postgresql://test_user:test_pass@localhost:5433/claude_nexus_test \
PROXY_URL=http://localhost:3100 \
bun test src/__tests__/conversation-tracking.simple.test.ts
```

### Automated Testing (WIP)

The framework includes Jest configuration with global setup/teardown, but currently has issues with TypeScript module resolution. A simpler Bun test approach is recommended.

## Export Script

To export real conversations as test fixtures:

```bash
bun run scripts/export-conversation.ts \
  --conversation-id <uuid> \
  --output packages/e2e/src/fixtures/my-test.json
```

## Test Files

- `src/types/test-case.ts` - TypeScript types for test cases
- `src/utils/test-runner.ts` - Core test execution logic
- `src/setup/mock-claude.ts` - Mock Claude API server
- `src/__tests__/conversation-tracking.simple.test.ts` - Simple test examples

## Known Issues

1. Jest has issues with TypeScript ES modules in global setup
2. Testcontainers can be slow to start PostgreSQL
3. The proxy needs time to write to the database (500ms delay added)

## Future Improvements

1. Replace fixed delays with proper event-based synchronization
2. Add comprehensive error handling
3. Support for streaming responses
4. More sophisticated mock Claude responses
5. Better integration with CI/CD
