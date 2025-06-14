# Claude Nexus Proxy Architecture

## Overview

Claude Nexus Proxy is a modular proxy service for Claude API with telemetry, multi-subscription support, and a web dashboard.

## Entry Point

### `src/main.ts`
The single entry point for the application that:
- Handles CLI arguments and environment configuration
- Initializes the Hono application
- Starts the HTTP server
- Manages graceful shutdown

## Core Architecture

### Application Structure (`src/app.ts`)
- Creates and configures the Hono application
- Mounts all routes and middleware
- Initializes external services (database, Slack)

### Dependency Injection (`src/container.ts`)
- Manages service lifecycle
- Provides singleton instances
- Handles resource cleanup

## Service Layer

### AuthenticationService (`src/services/AuthenticationService.ts`)
- Manages API keys and OAuth credentials
- Handles domain-based authentication
- Supports credential file loading

### ClaudeApiClient (`src/services/ClaudeApiClient.ts`)
- Handles communication with Claude API
- Supports both streaming and non-streaming requests
- Includes retry logic and error handling

### MetricsService (`src/services/MetricsService.ts`)
- Tracks token usage and costs
- Collects request statistics
- Sends telemetry data

### NotificationService (`src/services/NotificationService.ts`)
- Sends Slack notifications
- Formats messages for readability
- Supports domain-specific configurations

### ProxyService (`src/services/ProxyService.ts`)
- Orchestrates the request flow
- Coordinates all other services
- Handles response formatting

## Controllers

### MessageController (`src/controllers/MessageController.ts`)
- Handles `/v1/messages` endpoint
- Validates requests
- Delegates to ProxyService

## Middleware

### Authentication (`src/middleware/auth.ts`)
- Validates API keys
- Manages sessions

### Rate Limiting (`src/middleware/rate-limit.ts`)
- Global and per-domain limits
- In-memory storage

### Logging (`src/middleware/logger.ts`)
- Structured JSON logging
- Request/response tracking
- Correlation IDs

### Validation (`src/middleware/validation.ts`)
- Request schema validation
- Input sanitization

## Dashboard

### Routes (`src/dashboard/routes.ts`)
- Server-rendered HTML pages
- HTMX for dynamic updates
- Chart.js visualizations

### Authentication (`src/dashboard/auth.ts`)
- API key-based login
- Cookie sessions

### Real-time Updates (`src/dashboard/sse.ts`)
- Server-Sent Events
- Live conversation updates
- Metrics broadcasting

## Storage

### StorageService (`src/storage.ts`)
- PostgreSQL integration
- Batch processing
- Query optimization

## Configuration

### Config Module (`src/config/index.ts`)
- Centralized environment variables
- Type-safe configuration
- Validation

## Domain Models

### Entities
- `ProxyRequest` - Request representation
- `ProxyResponse` - Response formatting

### Value Objects
- `RequestContext` - Request metadata

## Utilities

### Circuit Breaker (`src/utils/circuit-breaker.ts`)
- Fault tolerance
- Automatic recovery

### Retry Logic (`src/utils/retry.ts`)
- Exponential backoff
- Smart retry policies

## Legacy Code

The `src/legacy/` directory contains the old monolithic implementation for reference. This code is no longer used but kept for migration reference.

## Request Flow

1. Request arrives at Hono server
2. Passes through middleware chain:
   - CORS
   - Logging
   - Rate limiting
   - Validation
3. MessageController receives request
4. ProxyService orchestrates:
   - Authentication
   - Claude API call
   - Metrics collection
   - Notifications
   - Storage
5. Response sent to client
6. Post-response tasks execute

## Environment Variables

Key configuration:
- `CLAUDE_API_KEY` - Default API key
- `DASHBOARD_API_KEY` - Dashboard access
- `DATABASE_URL` - PostgreSQL connection
- `SLACK_WEBHOOK_URL` - Notifications
- `STORAGE_ENABLED` - Enable persistence

See `src/config/index.ts` for complete list.

## Development

```bash
# Install dependencies
bun install

# Run development server
bun run start

# Build for production
bun run build

# Run tests
bun test
```

## Docker Deployment

```bash
# Build image
docker build -t claude-nexus-proxy .

# Run container
docker run -p 3000:3000 \
  -e CLAUDE_API_KEY=sk-ant-... \
  -e DASHBOARD_API_KEY=... \
  -e DATABASE_URL=... \
  claude-nexus-proxy
```