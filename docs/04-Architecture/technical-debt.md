# Technical Debt Register

This document tracks known technical debt in the Claude Nexus Proxy project. Each item includes context, impact, and proposed remediation.

## Summary

| ID     | Priority | Description                   | Effort | Status | Target Date |
| ------ | -------- | ----------------------------- | ------ | ------ | ----------- |
| TD-001 | High     | Memory Leak in StorageAdapter | M      | Open   | 2025-02-15  |
| TD-003 | Low      | Incomplete SSE Implementation | L      | Open   | 2025-03-01  |
| TD-004 | Medium   | Missing Automated Tests       | XL     | Open   | Q1 2025     |
| TD-005 | Medium   | Configuration Hardcoding      | M      | Open   | Q1 2025     |
| TD-006 | Low      | Incomplete Error Handling     | M      | Open   | Q2 2025     |
| TD-009 | Low      | API Response Caching          | L      | Open   | Q2 2025     |

**Metrics:**

- Active High Priority Items: 1
- Active Medium Priority Items: 2
- Active Low Priority Items: 3
- Total Active Items: 6

## Active Technical Debt

### TD-001: Memory Leak in StorageAdapter

- **Priority:** High
- **Effort:** M
- **Status:** Open
- **Location:** `services/proxy/src/storage/StorageAdapter.ts:12-15`
- **First Identified:** 2025-01-15
- **Target Date:** 2025-02-15

**Description:**  
The `requestIdMap` grows indefinitely as requests are processed, causing memory usage to increase over time.

**Impact:**

- Service crashes after extended operation (OOM)
- Increased infrastructure costs
- Potential data loss during crashes

**Proposed Remediation:**  
Implement cleanup logic in `storeResponse()` to remove entries after use. Add periodic cleanup for orphaned entries using environment variables for retention configuration (STORAGE_ADAPTER_CLEANUP_MS, STORAGE_ADAPTER_RETENTION_MS).

### TD-003: Incomplete SSE Implementation

- **Priority:** Low
- **Effort:** L
- **Status:** Open
- **Location:** `services/dashboard/src/routes/sse.ts`
- **First Identified:** 2025-01-10
- **Target Date:** 2025-03-01

**Description:**  
Server-Sent Events implementation exists but is not integrated - routes not registered, broadcast functions never called.

**Impact:**

- Documentation promises real-time updates that don't work
- Dashboard lacks live monitoring capabilities
- Potential user trust issues

**Proposed Remediation:**  
Register SSE route in `app.ts`, implement proxy-to-dashboard communication (Redis Pub/Sub or in-memory event bus), and call broadcast functions from proxy service on relevant events.

### TD-004: Missing Automated Tests

- **Priority:** Medium
- **Effort:** XL
- **Status:** Open
- **Location:** Project-wide
- **First Identified:** 2025-01-05
- **Target Date:** Q1 2025

**Description:**  
No automated test suite despite complex business logic in conversation tracking, authentication, and token management.

**Impact:**

- High risk of regressions during refactoring
- Slower development velocity due to manual testing
- Lower confidence when making changes

**Proposed Remediation:**  
Prioritize unit tests for critical functions (message hashing, token counting, auth), add integration tests for API endpoints, implement E2E tests for critical user journeys. Set up CI/CD with test requirements.

### TD-005: Configuration Hardcoding

- **Priority:** Medium
- **Effort:** M
- **Status:** Open
- **Location:** Various files
- **First Identified:** 2025-01-08
- **Target Date:** Q1 2025

**Description:**  
Some configuration values are hardcoded in source files rather than externalized to environment variables.

**Impact:**

- Requires code changes and redeployment for config updates
- Risk of accidentally committing sensitive values
- Harder to maintain different environments

**Proposed Remediation:**  
Audit codebase for hardcoded values, move all configuration to environment variables following existing patterns, update CLAUDE.md with new configuration options.

### TD-006: Incomplete Error Handling

- **Priority:** Low
- **Effort:** M
- **Status:** Open
- **Location:** Various async functions
- **First Identified:** 2025-01-12
- **Target Date:** Q2 2025

**Description:**  
Some async operations lack proper error handling, leading to ungraceful failures.

**Impact:**

- Ungraceful service failures
- Poor error messages making debugging difficult
- Potential for cascading failures

**Proposed Remediation:**  
Implement comprehensive error handling strategy: add try-catch blocks to all async operations, use structured error logging, implement error recovery and circuit breaker patterns where appropriate.

### TD-009: API Response Caching

- **Priority:** Low
- **Effort:** L
- **Status:** Open
- **Location:** API routes
- **First Identified:** 2025-01-14
- **Target Date:** Q2 2025

**Description:**  
No caching layer for expensive database queries, causing repeated computations.

**Impact:**

- Higher latency for frequently accessed endpoints
- Unnecessary database load
- Higher infrastructure costs

**Proposed Remediation:**  
Implement caching using existing DASHBOARD_CACHE_TTL configuration. Add Redis caching layer for expensive queries, implement cache invalidation on data changes, monitor cache hit rates.

## Process & Metrics

### Resolution Process

1. **Identification**: Document new debt as it's introduced with clear metadata
2. **Prioritization**: Reassess priority and effort estimates monthly
3. **Resolution**: Allocate 20% of sprint capacity to debt reduction
4. **Prevention**: Review PRs for new debt introduction

### Tracking Metrics

- High-priority items: Target ≤ 2
- Average age of debt: Target < 90 days for high priority
- Resolution rate: Target 2+ items per quarter
- New debt introduction rate: Monitor monthly

## Resolution History

### 2025-06-26

- **N+1 Query Pattern in Conversations API** - Replaced correlated subqueries with window functions, added optimized indexes
- **N+1 Query in Token Usage Time Series** - Refactored to single query using UNNEST
- **Database Migration Strategy** - Standardized on TypeScript migrations with init SQL

### 2025-01-20

- **Console.log violations** - Replaced with proper debug logging
- **TestSampleCollector privacy issues** - Fixed sensitive data masking

### Earlier Resolutions

- **Conversation tracking** - Implemented with message hashing
- **Token usage tracking** - Added comprehensive tracking system
- **OAuth error handling** - Improved with auto-refresh logic

## References

- [Architecture Decision Records](./ADRs/)
- [Performance Troubleshooting](../05-Troubleshooting/performance.md)
- [Database Documentation](../03-Operations/database.md)
- [GROOMING.md](../../GROOMING.md) - Grooming process guidelines

---

Last Updated: 2025-01-21
Next Review: 2025-02-21
