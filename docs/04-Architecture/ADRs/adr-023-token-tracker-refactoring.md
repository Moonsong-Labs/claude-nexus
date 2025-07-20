# ADR-023: Token Tracker Refactoring

## Status

Accepted

## Date

2025-01-20

## Context

The tokenTracker service in `services/proxy/src/services/tokenTracker.ts` had several code quality issues that needed to be addressed during a grooming sprint:

1. **Duplicate Methods**: Both `stop()` and `stopReporting()` methods did the same thing
2. **Hardcoded Values**: The startup message showed "reporting every 10s" even when a different interval was configured
3. **Type Issues**: Used `NodeJS.Timeout` type which is not ideal for a Bun project
4. **Memory Leak Risk**: The stats Map could grow indefinitely without any cleanup mechanism
5. **Missing Error Handling**: No try-catch blocks for error scenarios
6. **Poor Method Organization**: Methods were not organized by functionality
7. **Insufficient Documentation**: Missing JSDoc comments for public methods

## Decision

We decided to refactor the tokenTracker service with the following improvements:

1. **Remove Duplicate Method**: Kept only `stopReporting()` and removed the duplicate `stop()` method
2. **Fix Hardcoded Message**: Made the interval message dynamic based on the actual configured interval
3. **Proper Type Usage**: Changed from `NodeJS.Timeout` to `Timer` for better Bun compatibility
4. **Memory Management**: Implemented a cleanup mechanism with:
   - Maximum domain limit (1000 domains)
   - Stale data removal after 24 hours
   - LRU-style eviction when at capacity (removes oldest 10%)
5. **Error Handling**: Added try-catch blocks in `track()` and `printStats()` methods
6. **Method Reorganization**: Grouped methods by functionality (public API first, then private helpers)
7. **Improved Documentation**: Added comprehensive JSDoc comments with parameter descriptions
8. **Extract Constants**: Moved magic numbers to named constants at the top of the file

## Implementation Details

### Memory Management Strategy

We chose a simple but effective approach:

- Track up to 1000 domains (MAX_DOMAINS)
- Remove domains not updated in 24 hours (STALE_DATA_THRESHOLD)
- When at capacity after stale cleanup, remove the oldest 10% of entries
- This prevents unbounded memory growth while maintaining recent data

### Type Safety

- Replaced `NodeJS.Timeout` with `Timer` type
- This aligns with Bun's type system and removes Node.js dependencies

### Error Resilience

- Added error handling to prevent crashes during tracking or reporting
- Errors are logged to console but don't interrupt the service

## Consequences

### Positive

- **Improved Stability**: Memory management prevents OOM issues in long-running deployments
- **Better Maintainability**: Cleaner code structure and documentation
- **Runtime Compatibility**: Proper Bun types instead of Node.js types
- **Accurate Reporting**: Dynamic interval messages reflect actual configuration
- **Error Resilience**: Service continues operating even if individual operations fail

### Negative

- **Data Loss Risk**: Old domain data may be evicted when at capacity
- **Slight Complexity**: Added cleanup logic increases code complexity slightly

### Trade-offs

We opted for a simple memory management approach rather than more complex solutions (circular buffer, time-windowed tracking) to keep the refactoring focused and within the grooming sprint scope. More sophisticated approaches can be considered in future enhancements if needed.

## Alternatives Considered

1. **Circular Buffer**: Would provide fixed memory usage but add complexity
2. **Time-Windowed Tracking**: Would align with rate limiting windows but requires redesign
3. **Database Storage**: Would eliminate memory concerns but adds dependency and latency

These alternatives were deferred as they represent feature changes rather than refactoring.

## References

- Original issue: Code quality issues identified during grooming sprint
- Consensus validation: Both Gemini-2.5-flash and O3-mini models endorsed the approach with 9/10 confidence
