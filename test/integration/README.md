# Integration Tests

This directory contains integration tests that verify functionality with real database connections.

## Running Integration Tests

```bash
# Run all integration tests
bun test test/integration/

# Run a specific integration test
bun test test/integration/subtask-linking.test.ts
```

## Prerequisites

- PostgreSQL database must be running
- `DATABASE_URL` environment variable must be set
- Database schema must be initialized (run migrations)

## Test Files

### subtask-linking.test.ts

Tests the end-to-end functionality of subtask detection and linking:

- Verifies subtasks are properly linked to parent tasks
- Tests timing window constraints
- Validates database-level integration

## Writing Integration Tests

Integration tests should:

1. Use real database connections (no mocks)
2. Clean up test data after each test
3. Be isolated from other tests
4. Test complete workflows end-to-end
5. Use descriptive test names

Example structure:

```typescript
describe('Feature Integration', () => {
  let pool: Pool
  let testIds: string[] = []

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
  })

  afterAll(async () => {
    // Cleanup test data
    if (testIds.length > 0) {
      await pool.query('DELETE FROM table WHERE id = ANY($1)', [testIds])
    }
    await pool.end()
  })

  it('should test complete workflow', async () => {
    // Test implementation
  })
})
```
