# E2E Tests for Claude Nexus Proxy

This package contains end-to-end tests for the Claude Nexus Proxy, focusing on conversation tracking and database state validation.

## Architecture

The E2E tests use:

- **Testcontainers** to spin up a real PostgreSQL instance
- **Jest** as the test runner with custom setup/teardown
- **JSON fixtures** for declarative test cases
- **Dynamic value substitution** for handling UUIDs and relationships

## Running Tests

```bash
# From root directory
bun run test:e2e

# Watch mode
bun run test:e2e:watch

# From e2e package directory
cd packages/e2e
bun test
```

## Test Case Format

Test cases are defined in JSON with the following structure:

```json
{
  "description": "Test description",
  "variables": {
    "varName": "uuid" | "timestamp" | "string"
  },
  "requests": [
    {
      "domain": "test.example.com",
      "body": { /* Claude API request body */ },
      "expectDatabase": {
        "conversationId": "$new" | "$same" | "$different",
        "branchId": "$main" | "$branch_*" | "$compact_*",
        "parentRequestId": "$null" | "$previous" | "$request:N",
        // ... other expectations
      }
    }
  ]
}
```

### Keywords

- `$new` - Expect a new unique value
- `$same` - Expect same value as previous request
- `$different` - Expect different value from previous
- `$null` - Expect null value
- `$previous` - Reference to previous request ID
- `$request:N` - Reference to specific request index
- `$any` - Any non-null value
- `$main` - Main branch
- `$branch_*` - Branch pattern matching
- `$compact_*` - Compact conversation branch

## Exporting Conversations

You can export real conversations from the database as test fixtures:

```bash
# Export a full conversation by ID
bun run db:export-conversation <conversation-id>

# Export specific requests
bun run db:export-conversation <request-id-1> <request-id-2> ...

# Export to specific file
bun run db:export-conversation <conversation-id> --output=my-test.json
```

## Creating New Tests

1. Create a new JSON fixture in `src/fixtures/`
2. Define the test case following the format above
3. Run the tests to validate

Example fixture:

```json
{
  "description": "Test branching conversation",
  "requests": [
    {
      "domain": "test.example.com",
      "body": {
        "model": "claude-3-sonnet-20240229",
        "messages": [{ "role": "user", "content": "Hello" }]
      },
      "expectDatabase": {
        "conversationId": "$new",
        "branchId": "$main"
      }
    }
  ]
}
```

## Test Isolation

Each test case:

- Gets a fresh database state (no cleanup between requests in a test case)
- Runs against the same proxy instance
- Uses unique domains to avoid conflicts

## Debugging

- Check `packages/e2e/jest.config.js` for test timeout settings
- Use `console.log` in test files for debugging
- Database queries wait 500ms for async storage to complete
- Proxy logs are captured but not displayed by default
