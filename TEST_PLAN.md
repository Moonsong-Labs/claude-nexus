# Claude Nexus Proxy - Comprehensive Test Plan

## Executive Summary

This document outlines a comprehensive testing strategy for the Claude Nexus Proxy service. The goal is to achieve high confidence in the codebase through reliable, maintainable, and fast tests that cover all critical functionality.

## Testing Framework Selection

### Primary Framework: Vitest with Bun
**Rationale:**
- Native TypeScript support
- Excellent performance with Bun runtime
- Jest-compatible API for easy migration
- Built-in mocking capabilities
- Snapshot testing support
- Concurrent test execution

### Supporting Tools:
1. **MSW (Mock Service Worker)** - Mock HTTP requests elegantly
2. **Testcontainers** - Spin up real PostgreSQL for integration tests
3. **Supertest** - HTTP assertions for Hono application testing
4. **@faker-js/faker** - Generate realistic test data
5. **c8** - Code coverage reporting

### Why Not Bun's Built-in Test Runner?
While Bun has a built-in test runner, Vitest offers:
- More mature ecosystem
- Better IDE integration
- Advanced mocking capabilities
- Extensive plugin ecosystem

## Test Categories

### 1. Unit Tests (Target: 90% coverage)
Fast, isolated tests for pure functions and individual components.

### 2. Integration Tests (Target: 80% coverage)
Test interactions between components with some real dependencies.

### 3. End-to-End Tests (Target: Critical paths only)
Full system tests including real HTTP requests and database.

### 4. Performance Tests (Weekly runs)
Load testing and performance regression detection.

## Component Test Coverage

### 1. Core Proxy (`src/index.ts`)

#### Unit Tests:
```typescript
describe('Proxy Utilities', () => {
  describe('maskApiKey', () => {
    it('should mask API keys correctly')
    it('should handle short keys')
    it('should handle undefined keys')
  })
  
  describe('setCachedMessage', () => {
    it('should add messages to cache')
    it('should evict oldest entry when cache is full')
    it('should maintain MAX_MESSAGE_CACHE_SIZE limit')
  })
})
```

#### Integration Tests:
```typescript
describe('Proxy Endpoints', () => {
  describe('POST /v1/messages', () => {
    it('should forward requests with API key auth')
    it('should forward requests with OAuth auth')
    it('should handle streaming responses')
    it('should handle non-streaming responses')
    it('should track tokens correctly')
    it('should send telemetry data')
    it('should handle Claude API errors')
    it('should respect rate limits')
  })
  
  describe('GET /token-stats', () => {
    it('should return aggregated statistics')
    it('should filter by domain when requested')
  })
})
```

#### E2E Tests:
```typescript
describe('Full Proxy Flow', () => {
  it('should proxy a complete conversation with streaming')
  it('should handle OAuth token refresh mid-request')
  it('should recover from temporary Claude API outage')
})
```

### 2. Credential Management (`src/credentials.ts`)

#### Unit Tests:
```typescript
describe('Credential Management', () => {
  describe('loadCredentials', () => {
    it('should load API key credentials from file')
    it('should load OAuth credentials from file')
    it('should handle missing files gracefully')
    it('should resolve ~ paths correctly')
    it('should cache loaded credentials')
    it('should respect cache TTL')
    it('should evict old entries when cache is full')
  })
  
  describe('refreshToken', () => {
    it('should refresh OAuth tokens')
    it('should update credential file after refresh')
    it('should handle refresh failures')
  })
  
  describe('getCredentials', () => {
    it('should return domain-specific credentials')
    it('should fall back to default credentials')
    it('should refresh tokens 1 minute before expiry')
  })
})
```

#### Integration Tests:
```typescript
describe('OAuth Flow', () => {
  it('should complete OAuth authorization flow')
  it('should exchange code for tokens')
  it('should persist tokens to file')
})
```

### 3. Token Tracking (`src/tokenTracker.ts`)

#### Unit Tests:
```typescript
describe('Token Tracking', () => {
  describe('trackTokens', () => {
    it('should track input/output tokens by domain')
    it('should categorize request types correctly')
    it('should count tool calls accurately')
    it('should handle missing token data')
  })
  
  describe('getStats', () => {
    it('should return statistics for all domains')
    it('should filter by specific domain')
    it('should calculate totals correctly')
  })
})
```

### 4. Slack Integration (`src/slack.ts`)

#### Unit Tests:
```typescript
describe('Slack Integration', () => {
  describe('sendToSlack', () => {
    it('should format messages correctly')
    it('should truncate long messages')
    it('should skip personal domains')
    it('should use domain-specific config')
    it('should fall back to global config')
  })
  
  describe('parseSlackConfig', () => {
    it('should parse credential slack config')
    it('should handle missing config')
    it('should validate webhook URLs')
  })
})
```

### 5. Storage Service (`src/storage.ts`)

#### Unit Tests:
```typescript
describe('Storage Service', () => {
  describe('Batch Processing', () => {
    it('should batch requests efficiently')
    it('should flush batches on interval')
    it('should handle batch failures gracefully')
    it('should respect batch size limits')
  })
})
```

#### Integration Tests:
```typescript
describe('Storage Service Integration', () => {
  let container: StartedTestContainer
  let storage: StorageService
  
  beforeAll(async () => {
    container = await new GenericContainer('postgres:16')
      .withExposedPorts(5432)
      .start()
    
    storage = new StorageService({
      host: container.getHost(),
      port: container.getMappedPort(5432),
      // ...
    })
  })
  
  describe('Database Operations', () => {
    it('should initialize schema correctly')
    it('should store requests and responses')
    it('should store streaming chunks')
    it('should query by domain')
    it('should handle concurrent writes')
  })
})
```

## Test Data Strategy

### 1. Fixtures
```typescript
// test/fixtures/requests.ts
export const sampleApiRequest = {
  model: 'claude-3-opus-20240229',
  messages: [
    { role: 'user', content: 'Hello, Claude!' }
  ],
  max_tokens: 1000
}

export const sampleStreamResponse = {
  // Realistic streaming response chunks
}
```

### 2. Factories
```typescript
// test/factories/credential.factory.ts
export function createApiKeyCredential(overrides = {}) {
  return {
    type: 'api_key',
    api_key: faker.string.alphanumeric(40),
    ...overrides
  }
}

export function createOAuthCredential(overrides = {}) {
  return {
    type: 'oauth',
    oauth: {
      accessToken: faker.string.alphanumeric(64),
      refreshToken: faker.string.alphanumeric(64),
      expiresAt: Date.now() + 3600000,
      scopes: ['user:inference'],
      ...overrides
    }
  }
}
```

### 3. Mock Data Generators
```typescript
// test/mocks/claude-api.ts
export function setupClaudeApiMocks() {
  return setupServer(
    rest.post('https://api.anthropic.com/v1/messages', (req, res, ctx) => {
      // Return appropriate response based on request
    }),
    
    rest.post('https://console.anthropic.com/v1/oauth/token', (req, res, ctx) => {
      // Mock OAuth token refresh
    })
  )
}
```

## Critical Test Scenarios

### 1. Authentication Flows
- API key in header
- API key from credential file
- OAuth token from credential file
- OAuth token refresh during request
- Expired OAuth token handling
- Invalid credentials

### 2. Streaming Scenarios
- Normal streaming response
- Streaming with errors mid-stream
- Large streaming responses
- Concurrent streaming requests
- Stream interruption recovery

### 3. Error Handling
- Claude API 429 (rate limit)
- Claude API 500 (server error)
- Network timeouts
- Invalid request payloads
- Database connection loss
- Malformed streaming chunks

### 4. Performance Scenarios
- 100 concurrent requests
- 10MB payload handling
- Long-running streams (>5 minutes)
- Memory usage under load
- Database write throughput

### 5. Security Scenarios
- API key masking in logs
- SQL injection attempts
- Path traversal in client-setup
- Large payload DoS attempts
- Header injection

## Test Infrastructure

### 1. Test Database Management
```typescript
// test/helpers/database.ts
export async function createTestDatabase() {
  const container = await new PostgreSQLContainer()
    .withDatabase('test_claude_proxy')
    .start()
  
  return {
    container,
    connectionString: container.getConnectionString(),
    cleanup: () => container.stop()
  }
}
```

### 2. Test Server Setup
```typescript
// test/helpers/server.ts
export function createTestApp(config = {}) {
  process.env.DATABASE_URL = config.databaseUrl
  process.env.CLAUDE_API_KEY = config.apiKey || 'test-key'
  
  const app = new Hono()
  // Configure app...
  return app
}
```

### 3. Streaming Test Utilities
```typescript
// test/helpers/streaming.ts
export async function* createMockStream(chunks: string[]) {
  for (const chunk of chunks) {
    yield `data: ${chunk}\n\n`
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
```

## Performance Testing

### 1. Load Testing with k6
```javascript
// test/performance/load-test.js
import http from 'k6/http'
import { check } from 'k6'

export const options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.01'],   // Error rate under 1%
  },
}

export default function() {
  const res = http.post('http://localhost:3000/v1/messages', 
    JSON.stringify({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 10
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  })
}
```

### 2. Memory Leak Detection
```typescript
// test/performance/memory-leak.test.ts
describe('Memory Leak Detection', () => {
  it('should not leak memory over 1000 requests', async () => {
    const initialMemory = process.memoryUsage().heapUsed
    
    for (let i = 0; i < 1000; i++) {
      await request(app)
        .post('/v1/messages')
        .send(sampleApiRequest)
    }
    
    global.gc() // Force garbage collection
    const finalMemory = process.memoryUsage().heapUsed
    
    // Allow 10MB growth maximum
    expect(finalMemory - initialMemory).toBeLessThan(10 * 1024 * 1024)
  })
})
```

## CI/CD Integration

### GitHub Actions Workflow
```yaml
name: Test Suite
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test:unit
      - uses: codecov/codecov-action@v3

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test:integration
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test:e2e

  performance-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: grafana/k6-action@v0.3.0
        with:
          filename: test/performance/load-test.js
```

## Test Reliability Strategies

### 1. Flaky Test Prevention
- Use fixed timestamps for time-dependent tests
- Mock all external services
- Use deterministic test data
- Implement proper async/await patterns
- Add retry logic for integration tests

### 2. Test Isolation
- Each test gets fresh database
- Clear all caches between tests
- Reset global state
- Use unique ports for each test server

### 3. Speed Optimization
- Run unit tests in parallel
- Share database containers in integration tests
- Use in-memory databases where possible
- Minimize test data setup

### 4. Debugging Helpers
```typescript
// test/helpers/debug.ts
export function captureConsoleOutput() {
  const originalLog = console.log
  const logs: string[] = []
  
  console.log = (...args) => {
    logs.push(args.join(' '))
  }
  
  return {
    logs,
    restore: () => { console.log = originalLog }
  }
}
```

## Code Coverage Goals

- **Overall**: 85%
- **Critical paths** (proxy, auth): 95%
- **Error handling**: 100%
- **Utilities**: 90%
- **Storage**: 80%

## Test Maintenance

### 1. Test Review Checklist
- [ ] Test name clearly describes what is being tested
- [ ] Test has proper setup and teardown
- [ ] Test data is realistic
- [ ] Assertions are specific and meaningful
- [ ] No hardcoded delays or timeouts
- [ ] Mocks are properly restored

### 2. Regular Maintenance Tasks
- Weekly: Review flaky test reports
- Monthly: Update test dependencies
- Quarterly: Performance baseline updates
- Yearly: Full test suite audit

## Implementation Timeline

### Week 1: Foundation
- Set up Vitest and testing infrastructure
- Create test utilities and helpers
- Implement unit tests for pure functions

### Week 2: Integration
- Set up Testcontainers
- Implement database tests
- Create API endpoint tests

### Week 3: E2E and Performance
- Implement full flow tests
- Set up k6 for load testing
- Create CI/CD pipeline

### Week 4: Polish
- Achieve coverage goals
- Document test patterns
- Create testing guidelines

## Conclusion

This comprehensive testing strategy will provide high confidence in the Claude Nexus Proxy codebase while maintaining fast, reliable tests. The key to success is proper test isolation, good mocking strategies, and continuous maintenance of the test suite.