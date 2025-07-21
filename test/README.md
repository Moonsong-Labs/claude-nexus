# Test Suite

This directory contains the test suite for Claude Nexus Proxy.

## Structure

```
test/
├── unit/              # Unit tests for individual components
├── integration/       # Integration tests
└── fixtures/         # Test data and fixtures
    └── requests/     # Sample request/response data
```

## Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test test/unit/message-formatting.test.ts

# Run with coverage
bun test --coverage
```

## Unit Tests

### Message Formatting

- Tests message content normalization
- Validates content array handling
- Ensures consistent hashing

### Request Type Identification

- Tests classification of requests (inference vs query evaluation)
- Validates request type detection logic

### Streaming Tool Input

- Tests streaming response parsing
- Validates tool call handling in streams

### Notification Formatting

- Tests Slack notification formatting
- Validates error message formatting
- Tests tool call notifications

### Sub-task Detection and Linking

- Tests sub-task conversation tracking feature
- Validates Task tool invocation detection
- Tests timing-based linking logic (30-second window)
- Verifies parent-child relationships between tasks

**How Sub-task Linking Works:**

1. **Detection**: When a response contains a tool use with `name: "Task"`, it's marked as spawning a sub-task
2. **Storage**: The Task invocation details are stored in the `task_tool_invocation` field
3. **Linking**: Conversations that start within 30 seconds of a Task invocation are linked as sub-tasks
4. **Tracking**: Sub-tasks have `is_subtask: true` and `parent_task_request_id` set to the spawning request

## Test Fixtures

Sample requests are stored in service-specific test directories:

- `services/proxy/tests/fixtures/requests/`:
  - `query_evaluation_streaming_with_system_haiku.json` - Query evaluation example
  - `quota_haiku.json` - Quota check request

Note: For complex test data, prefer using programmatic test builders over large JSON fixtures to improve maintainability and reduce repository size.

## Writing Tests

### Test Structure

```typescript
import { describe, it, expect } from 'bun:test'

describe('Feature Name', () => {
  it('should do something', () => {
    // Arrange
    const input = { ... }

    // Act
    const result = functionUnderTest(input)

    // Assert
    expect(result).toBe(expected)
  })
})
```

## Test Coverage

Current coverage areas:

- ✅ Message formatting and normalization
- ✅ Request type identification
- ✅ Streaming response parsing
- ✅ Notification formatting
- ❌ API endpoint integration tests
- ❌ Database operations
- ❌ OAuth flow

## Future Improvements

1. **Integration Tests** - Test full request/response flow
2. **Database Tests** - Test storage and retrieval
3. **E2E Tests** - Test proxy with real Claude API
4. **Performance Tests** - Benchmark proxy overhead
5. **Security Tests** - Test authentication and authorization

## Test Data

When adding test fixtures:

1. Mask sensitive data (API keys, tokens)
2. Use realistic data structures
3. Document what each fixture tests
4. Keep fixtures minimal but complete

## Continuous Integration

Tests are run automatically on:

- Pull requests
- Main branch commits
- Release tags

Failed tests block deployment.
