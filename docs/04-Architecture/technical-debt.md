# Technical Debt Register

This document tracks known technical debt in the Claude Nexus Proxy project. Each item includes context, impact, and proposed remediation.

## High Priority

### 1. Memory Leak in StorageAdapter

**Location**: `services/proxy/src/storage/StorageAdapter.ts:12-15`

**Issue**: The `requestIdMap` grows indefinitely as requests are processed, causing memory usage to increase over time.

```typescript
// Current problematic code
private requestIdMap = new Map<string, string>();

// Missing cleanup after storeResponse
```

**Impact**:

- Service crashes after extended operation
- Increased memory costs
- Potential data loss during OOM crashes

**Remediation**:

```typescript
async storeResponse(data: ResponseData) {
  // ... existing code ...

  // Add cleanup
  this.requestIdMap.delete(data.request_id);
}

// Add periodic cleanup for orphaned entries
setInterval(() => {
  const oneHourAgo = Date.now() - 3600000;
  for (const [key, value] of this.requestIdMap.entries()) {
    if (value.timestamp < oneHourAgo) {
      this.requestIdMap.delete(key);
    }
  }
}, 300000); // Every 5 minutes
```

**Reference**: [PR #13 Review](https://github.com/Moonsong-Labs/claude-nexus-proxy/pull/13#review)

### 2. N+1 Query Pattern in Conversations API

**Location**: `services/proxy/src/routes/api.ts:456-460`

**Issue**: Correlated subqueries create an N+1 query pattern, causing poor performance with large datasets.

```typescript
// Current problematic query uses correlated subqueries
// for latest_request_id and parent_task_request_id
```

**Impact**:

- Dashboard slowness with many conversations
- Database CPU spikes
- Poor user experience

**Remediation**:

- Rewrite using window functions or CTEs
- Consider materialized views for frequently accessed data
- Add appropriate indexes

**Reference**: [PR #13 Review](https://github.com/Moonsong-Labs/claude-nexus-proxy/pull/13#review)

## Medium Priority

### 3. N+1 Query in Token Usage Time Series

**Location**: `services/proxy/src/routes/api.ts:771-774`

**Issue**: Loops through each account and executes separate queries for time series data.

**Impact**:

- Slow dashboard loading with multiple accounts
- Unnecessary database load

**Remediation**:

- Refactor to fetch all time series data in a single query
- Use window functions for aggregation
- Consider caching time series data

### 4. Missing Automated Tests

**Location**: Project-wide

**Issue**: No automated test suite despite complex business logic.

**Impact**:

- Risk of regressions
- Slower development velocity
- Lower confidence in changes

**Remediation**:

1. Add unit tests for critical functions:
   - Message hashing
   - Token counting
   - Authentication logic
2. Add integration tests for API endpoints
3. Add end-to-end tests for critical user journeys
4. Set up CI/CD pipeline with test requirements

### 5. Configuration Hardcoding

**Location**: Various files

**Issue**: Some configuration values are hardcoded rather than externalized.

**Impact**:

- Requires code changes for configuration updates
- Risk of exposing sensitive values

**Remediation**:

- Audit all hardcoded values
- Move to environment variables or config files
- Document all configuration options

## Low Priority

### 6. Incomplete Error Handling

**Location**: Various async functions

**Issue**: Some async operations lack proper error handling and recovery.

**Impact**:

- Ungraceful failures
- Poor error messages for debugging

**Remediation**:

- Add try-catch blocks to all async operations
- Implement proper error logging
- Add error recovery mechanisms

### 7. Database Migration Strategy

**Location**: `services/proxy/src/db/migrations/`

**Issue**: Manual migration execution without version tracking.

**Impact**:

- Risk of missed migrations
- No rollback capability

**Remediation**:

- Implement proper migration tool (e.g., Knex, Prisma)
- Add migration version tracking
- Create rollback scripts

### 8. API Response Caching

**Location**: API routes

**Issue**: No caching for expensive queries.

**Impact**:

- Repeated expensive computations
- Higher latency for common requests

**Remediation**:

- Implement Redis caching layer
- Add cache invalidation logic
- Configure TTLs appropriately

## Tracking and Resolution

### Process

1. **Identification**: Document new debt as it's introduced
2. **Prioritization**: Assess impact and effort quarterly
3. **Resolution**: Allocate 20% of development time to debt reduction
4. **Prevention**: Review PRs for new debt introduction

### Metrics

Track technical debt health:

- Number of high-priority items
- Average age of debt items
- Time spent on debt-related incidents
- Performance degradation trends

### Recent Progress

- ✅ Implemented conversation tracking (removed from debt)
- ✅ Added token usage tracking (removed from debt)
- ✅ Improved OAuth error handling (removed from debt)

## Future Considerations

### Architectural Improvements

1. **Event Sourcing**: Consider for better audit trail
2. **CQRS**: Separate read/write models for performance
3. **Service Mesh**: For better observability and security

### Performance Optimizations

1. **Connection Pooling**: Optimize database connections
2. **Query Optimization**: Regular query plan analysis
3. **Horizontal Scaling**: Prepare for multi-instance deployment

### Security Enhancements

1. **Secrets Management**: Integrate with secret stores
2. **Audit Logging**: Comprehensive security audit trail
3. **Rate Limiting**: Implement proper rate limiting

## References

- [Performance Troubleshooting](../05-Troubleshooting/performance.md)
- [Database Optimization](../03-Operations/database.md)
- [Architecture Overview](./internals.md)

---

Last Updated: 2024-06-25
Next Review: 2024-07-25
