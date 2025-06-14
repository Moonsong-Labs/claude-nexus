# Testing Implementation Guide

## Overview

This guide provides concrete steps to implement the comprehensive testing strategy outlined in TEST_PLAN.md. The test infrastructure is designed for reliability, speed, and maintainability.

## Quick Start

### 1. Install Testing Dependencies

```bash
bun add -d vitest @vitest/coverage-c8 supertest msw @faker-js/faker testcontainers
bun add -d @types/supertest @types/pg
```

### 2. Set Up Test Structure

```
test/
├── unit/               # Fast, isolated unit tests
│   ├── credentials.test.ts
│   ├── tokenTracker.test.ts
│   └── utils.test.ts
├── integration/        # Tests with real dependencies
│   ├── proxy.test.ts
│   ├── storage.test.ts
│   └── oauth.test.ts
├── e2e/               # Full system tests
│   └── proxy-flow.test.ts
├── performance/       # Performance and load tests
│   └── memory-leak.test.ts
└── helpers/           # Test utilities
    ├── test-factories.ts
    ├── database.ts
    └── mock-claude.ts

test-setup/
├── vitest.config.ts   # Test configuration
└── setup.ts          # Global test setup
```

### 3. Run Tests

```bash
# Run all tests
bun test

# Run specific test suites
bun test:unit          # Fast unit tests only
bun test:integration   # Integration tests
bun test:coverage      # With coverage report
bun test:watch         # Watch mode for development
```

## Key Testing Patterns

### 1. Mock External Services

All external services (Claude API, Slack, OAuth) are mocked using MSW:

```typescript
// Mock Claude API response
mockServer.use(
  rest.post('https://api.anthropic.com/v1/messages', (req, res, ctx) => {
    return res(ctx.json(responseFactory.simple()))
  })
)
```

### 2. Test Database Isolation

Each integration test gets a fresh PostgreSQL container:

```typescript
const container = await new GenericContainer('postgres:16')
  .withDatabase('test_db')
  .start()
```

### 3. Streaming Response Testing

Special utilities handle SSE streaming:

```typescript
const chunks = scenarioFactory.streamingResponse('Hello world')
const response = global.testUtils.createStreamResponse(chunks)
```

### 4. Performance Monitoring

Memory and response time tests ensure no regressions:

```typescript
// Memory leak detection
expect(memoryGrowth).toBeLessThan(5 * 1024 * 1024) // 5MB max

// Response time assertions
expect(p95ResponseTime).toBeLessThan(100) // 95th percentile under 100ms
```

## Critical Test Scenarios

### Authentication & Authorization
- ✅ API key from header
- ✅ API key from credential file
- ✅ OAuth token usage
- ✅ OAuth token refresh mid-request
- ✅ Expired credentials handling

### Streaming
- ✅ Normal streaming flow
- ✅ Large streaming responses
- ✅ Stream interruption
- ✅ Concurrent streams

### Error Handling
- ✅ Rate limiting (429)
- ✅ Server errors (500)
- ✅ Network failures
- ✅ Malformed requests
- ✅ Database outages

### Performance
- ✅ Memory leak prevention
- ✅ Concurrent request handling
- ✅ Large payload processing
- ✅ Sustained load testing

## Test Data Management

### Factories
Use factories for consistent test data:

```typescript
const request = requestFactory.simple()
const credential = credentialFactory.oauth()
const response = responseFactory.withToolUse()
```

### Fixtures
Store complex test data in fixtures:

```typescript
import sampleConversation from '@test/fixtures/conversation.json'
```

## CI/CD Integration

### GitHub Actions
```yaml
- run: bun test:ci
- uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

### Pre-commit Hooks
```bash
# .husky/pre-commit
bun test:unit --run
```

## Best Practices

### 1. Test Naming
```typescript
describe('Component', () => {
  describe('method', () => {
    it('should handle specific scenario with expected outcome', () => {
      // Arrange, Act, Assert
    })
  })
})
```

### 2. Async Testing
Always use proper async/await:
```typescript
it('should handle async operations', async () => {
  await expect(asyncFunction()).resolves.toBe(expected)
})
```

### 3. Cleanup
Ensure proper cleanup in afterEach/afterAll:
```typescript
afterAll(async () => {
  await pool?.end()
  await container?.stop()
})
```

### 4. Flaky Test Prevention
- Mock time-dependent operations
- Use deterministic test data
- Avoid hardcoded delays
- Implement proper retry logic

## Performance Benchmarks

Target metrics based on current implementation:

| Metric | Target | Current |
|--------|--------|---------|
| Unit test suite | < 10s | - |
| Integration suite | < 60s | - |
| E2E suite | < 120s | - |
| Code coverage | > 85% | - |
| P95 response time | < 100ms | - |
| Memory per 1K requests | < 10MB | - |

## Troubleshooting

### Common Issues

1. **Container startup timeout**
   - Increase timeout in testcontainers
   - Check Docker daemon is running

2. **Port conflicts**
   - Use dynamic port allocation
   - Clean up containers properly

3. **Memory test failures**
   - Run with `--expose-gc` flag
   - Ensure proper cleanup between tests

4. **Flaky streaming tests**
   - Increase timeouts for CI
   - Use proper stream end detection

## Next Steps

1. **Week 1**: Implement unit tests for all pure functions
2. **Week 2**: Add integration tests for API endpoints
3. **Week 3**: Create E2E tests for critical paths
4. **Week 4**: Set up CI/CD and monitoring

## Monitoring Test Health

Track these metrics:
- Test execution time trends
- Flaky test frequency
- Coverage changes
- Performance regression alerts

Use tools like:
- Vitest UI for local development
- Codecov for coverage tracking
- GitHub Actions for CI metrics
- Grafana for performance monitoring

## Conclusion

This testing infrastructure provides:
- 🚀 Fast feedback during development
- 🛡️ High confidence in changes
- 📊 Performance regression prevention
- 🔧 Easy debugging when tests fail

Start with unit tests for immediate value, then gradually add integration and E2E tests as the codebase stabilizes.