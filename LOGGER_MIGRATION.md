# Logger Migration Guide

## Overview

We're migrating from a custom logger implementation to Pino for better performance and structured logging capabilities. This guide explains the changes and migration steps.

## Why Pino?

1. **Performance**: Pino is one of the fastest Node.js loggers, designed for high-throughput applications
2. **Structured Logging**: Native JSON output for better log aggregation and querying
3. **Child Loggers**: Automatic context propagation for request-scoped logging
4. **Battle-tested**: Widely used in production environments

## Key Changes

### 1. Object Serialization

**Before**: Objects needed to be manually stringified

```typescript
logger.warn('Event missing data', {
  metadata: {
    event: JSON.stringify(event), // Manual stringification
  },
})
```

**After**: Objects are automatically serialized

```typescript
logger.warn('Event missing data', {
  metadata: {
    event: event, // Pino handles serialization
  },
})
```

### 2. Error Handling

**Before**: Manual error type checking

```typescript
catch (error) {
  logger.error('Failed', {
    metadata: {
      error: error instanceof Error ? error.message : String(error)
    }
  })
}
```

**After**: Automatic error serialization with stack traces

```typescript
catch (error) {
  logger.error('Failed', {
    error: { originalError: error }
  })
}
```

### 3. Request-Scoped Logging

**New Feature**: Create child loggers for automatic context inclusion

```typescript
// In request handler
const requestLogger = createRequestLogger(logger.pino, {
  requestId: request.id,
  domain: request.hostname,
})

// All logs from this logger automatically include requestId and domain
requestLogger.info('Processing request')
requestLogger.debug('Step completed', { metadata: { step: 1 } })
```

## Migration Steps

### 1. Install Pino

```bash
bun add pino
bun add -d @types/pino
```

### 2. Update Logger Initialization

**Before**:

```typescript
import { createLogger } from '@claude-nexus/shared/logger'

const logger = createLogger({ service: 'proxy' })
```

**After** (no change needed - maintains compatibility):

```typescript
import { createLogger } from '@claude-nexus/shared/logger'

const logger = createLogger({ service: 'proxy' })
```

### 3. Remove JSON.stringify Calls

Search for `JSON.stringify` in logger calls and remove them:

```bash
# Find all instances
grep -r "logger.*JSON.stringify" services/
```

### 4. Development Setup

For pretty-printed logs during development, update your npm scripts:

```json
{
  "scripts": {
    "dev": "bun run src/main.ts | bunx pino-pretty"
  }
}
```

## Production Considerations

### Log Output

Pino writes structured JSON to stdout:

```json
{
  "level": 30,
  "time": 1735893456789,
  "pid": 12345,
  "hostname": "proxy-server-1",
  "service": "proxy",
  "requestId": "req-123",
  "domain": "example.com",
  "msg": "Request processed",
  "responseTime": 45
}
```

### Infrastructure Setup

Your container orchestration should capture stdout and forward to your log aggregation service:

**Docker Compose**:

```yaml
services:
  proxy:
    image: claude-nexus-proxy
    logging:
      driver: 'json-file'
      options:
        max-size: '10m'
        max-file: '3'
```

**Kubernetes**:

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: proxy
      image: claude-nexus-proxy
      # Logs automatically captured by kubelet
```

### Log Aggregation

Common patterns for log shipping:

1. **Fluentd/Fluent Bit**: Reads container logs and forwards to Elasticsearch, Datadog, etc.
2. **Vector**: High-performance log aggregation
3. **CloudWatch/Stackdriver**: Native cloud provider solutions

## Performance Impact

Based on benchmarks, Pino adds minimal overhead:

- ~5% impact on request throughput
- Sub-millisecond logging latency
- Efficient memory usage with object pooling

## Rollback Plan

If issues arise, the logger interface remains unchanged. To rollback:

1. Revert the pino-logger.ts file
2. Restore the original logger implementation
3. No application code changes needed

## FAQ

**Q: Why not use pino-pretty in production?**
A: Performance overhead and transport compatibility issues with Bun. Production logs should be JSON for aggregation.

**Q: Can we still use custom metadata fields?**
A: Yes, all fields in the metadata object are preserved and flattened into the log entry.

**Q: How do we handle sensitive data?**
A: Pino is configured to redact common sensitive fields (passwords, tokens, API keys).

**Q: What about log levels?**
A: Same as before - controlled by LOG_LEVEL environment variable or options.level.
