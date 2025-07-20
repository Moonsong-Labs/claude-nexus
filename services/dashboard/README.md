# Claude Nexus Dashboard Service

Real-time monitoring and analytics dashboard for Claude API usage with comprehensive visualization and analysis capabilities.

## Overview

- **Port**: 3001 (default, configurable via `PORT`)
- **Purpose**: Enterprise-grade web dashboard for monitoring Claude API usage, analyzing conversations, and visualizing metrics
- **Architecture**: Built with Bun, Hono, and HTMX for server-side rendering with dynamic updates
- **Storage**: Primarily API-driven with optional direct database access for legacy features

## Features

### Core Monitoring

- **Real-time updates** - Server-sent events (SSE) for live monitoring
- **Request history** - Browse and filter historical API requests
- **Conversation tracking** - Visual conversation trees with branch support
- **Sub-task visualization** - Track and visualize Task tool invocations

### Analytics & Visualization

- **Token usage analytics** - Detailed token consumption metrics by account/domain
- **5-hour rolling windows** - Claude API rate limit tracking
- **Model distribution** - Visual breakdown of model usage
- **Response time analysis** - Performance metrics and trends
- **Export capabilities** - Download data in various formats

### Advanced Features

- **AI-powered analysis** - View Gemini-generated conversation insights
- **Spark recommendations** - Display and provide feedback on technical recommendations
- **MCP prompt browser** - Browse and view Model Context Protocol prompts
- **Dark mode support** - User preference persistence
- **Responsive design** - Mobile-friendly interface

## Development

```bash
# Install dependencies (from project root)
bun install

# Run in development mode
bun run dev:dashboard
# Or from service directory
cd services/dashboard && bun run dev

# Type checking
bun run typecheck

# Run tests
bun test
# Specific test file
bun test src/routes/__tests__/analysis-api.test.ts

# Build for production
bun run build:dashboard

# Development with specific proxy URL
PROXY_API_URL=http://localhost:3000 bun run dev
```

## Configuration

Configuration is managed through environment variables. See `.env.example` for a complete list.

### Essential Configuration

```bash
# Dashboard authentication
DASHBOARD_API_KEY=your-secure-key

# Proxy service connection
PROXY_API_URL=http://localhost:3000

# Optional: Direct database access (being phased out)
DATABASE_URL=postgresql://user:pass@localhost:5432/claude_nexus
```

### Performance & Caching

```bash
# Cache TTL for dashboard data (seconds, 0 to disable)
DASHBOARD_CACHE_TTL=30

# Server configuration
PORT=3001
HOST=0.0.0.0
```

### Feature Flags

```bash
# Enable/disable specific features
ENABLE_AI_ANALYSIS=true
ENABLE_SPARK_INTEGRATION=true
```

## API Endpoints

### Dashboard Routes

#### `GET /`

Main dashboard interface with authentication.

```bash
# Browser access
open http://localhost:3001
# Enter DASHBOARD_API_KEY when prompted
```

#### `GET /dashboard/request/:id`

Detailed request view with conversation context.

#### `GET /dashboard/conversations`

Conversation browser with visual tree representation.

#### `GET /dashboard/prompts`

MCP prompt browser interface.

### API Routes

#### `GET /api/requests`

Query stored requests with filtering.

```bash
curl "http://localhost:3001/api/requests?limit=10&domain=example.com" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"
```

#### `GET /api/storage-stats`

Aggregated statistics and metrics.

```bash
curl "http://localhost:3001/api/storage-stats" \
  -H "X-Dashboard-Key: $DASHBOARD_API_KEY"
```

#### `GET /sse`

Server-sent events for real-time updates.

```javascript
const eventSource = new EventSource('/sse')
eventSource.onmessage = event => {
  const data = JSON.parse(event.data)
  console.log('Update:', data)
}
```

### Utility Routes

#### `GET /health`

Health check endpoint.

#### `GET /styles.css`

Dynamic CSS with dark mode support.

## Architecture

### Dependency Injection

The dashboard uses a lightweight container pattern for service management:

#### Core Services

- **ProxyApiClient** - Primary data source via proxy API
- **StorageReader** - Legacy direct database access (being phased out)
- **Container** - Service lifecycle management

#### Key Components

- **Routes** - HTMX-powered server-side rendering
- **Layouts** - Reusable UI components
- **Utils** - Data processing and visualization helpers
- **Middleware** - Authentication, logging, error handling

### Data Flow

1. **API-First Architecture** - Primary data from proxy service API
2. **Server-Side Rendering** - HTMX for dynamic updates without full page reloads
3. **Real-time Updates** - SSE connection for live data streaming
4. **Caching Layer** - Configurable TTL for performance optimization
5. **Progressive Enhancement** - Works without JavaScript, enhanced with it

### Frontend Stack

- **HTMX** - Dynamic HTML updates
- **Alpine.js** - Lightweight interactivity
- **Chart.js** - Data visualization
- **Prism.js** - Syntax highlighting
- **Tailwind CSS** - Utility-first styling (via CDN)

## Docker Deployment

### Building the Image

```bash
# From project root
./docker/build-images.sh

# Or manually
docker build -f docker/dashboard/Dockerfile -t claude-nexus-dashboard .
```

### Running with Docker

```bash
# Standalone
docker run -p 3001:3001 \
  -e DASHBOARD_API_KEY=your-key \
  -e PROXY_API_URL=http://proxy:3000 \
  claude-nexus-dashboard

# With docker-compose
./docker-up.sh up dashboard
```

### Environment Variables in Docker

```yaml
# docker-compose.yml example
services:
  dashboard:
    image: claude-nexus-dashboard
    environment:
      - DASHBOARD_API_KEY=${DASHBOARD_API_KEY}
      - PROXY_API_URL=http://proxy:3000
      - DASHBOARD_CACHE_TTL=30
    ports:
      - '3001:3001'
```

## Testing

### Unit Tests

```bash
# Run all tests
bun test

# Run with watch mode
bun test --watch

# Test specific functionality
bun test analysis-api
```

### Integration Tests

```bash
# Run integration tests
bun test integration

# Example: Dark mode integration
bun test dark-mode.integration
```

### Test Structure

- `src/routes/__tests__/` - Route handler tests
- `src/layout/__tests__/` - Component tests
- `src/test-utils/` - Shared test utilities

## Authentication

### Dashboard Access

1. **Initial Login** - Enter `DASHBOARD_API_KEY` on first visit
2. **Cookie Storage** - Authentication persisted in `dashboard_auth` cookie
3. **API Authentication** - Use `X-Dashboard-Key` header for API requests

### Security Considerations

- Authentication cookie is httpOnly by design for JavaScript access
- Consider implementing CSRF protection for production deployments
- Use HTTPS in production to protect authentication tokens

## Troubleshooting

### Common Issues

1. **Cannot connect to proxy**
   - Check `PROXY_API_URL` configuration
   - Ensure proxy service is running
   - Verify network connectivity between services

2. **Authentication failures**
   - Verify `DASHBOARD_API_KEY` matches configuration
   - Check cookie settings in browser
   - Clear browser cache and cookies

3. **No data displayed**
   - Ensure proxy has `STORAGE_ENABLED=true`
   - Check database connectivity
   - Verify data exists in time range

4. **Real-time updates not working**
   - Check SSE connection in browser dev tools
   - Ensure no proxy/firewall blocking SSE
   - Verify CORS settings if cross-origin

### Debug Mode

```bash
# Enable debug logging
DEBUG=true bun run dev

# Check specific components
DEBUG_SQL=true bun run dev
```

### Performance Optimization

1. **Adjust cache TTL** - Increase `DASHBOARD_CACHE_TTL` for better performance
2. **Database connection pool** - Configure pool size based on load
3. **Use CDN assets** - Frontend libraries loaded from CDN by default
4. **Enable compression** - Built-in response compression

## See Also

- [Main Project README](../../README.md) - Project overview and quick start
- [CLAUDE.md](../../CLAUDE.md) - Comprehensive project documentation
- [Proxy Service](../proxy/README.md) - Proxy service documentation
- [ADRs](../../docs/04-Architecture/ADRs/) - Architectural decision records
