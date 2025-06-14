# Claude Nexus Proxy Dashboard

## Overview

A web-based dashboard for monitoring Claude API usage, viewing conversations, and analyzing statistics across domains.

## Features

### ✅ Implemented
- **Authentication**: API key-based login system
- **Global & Domain Statistics**: 
  - Total requests (24-hour window)
  - Token usage (input + output)
  - Estimated costs
  - Active domains count
- **Visualizations**:
  - Request timeline (hourly breakdown)
  - Model usage distribution (pie chart)
- **Conversation Viewer**:
  - List of recent conversations
  - Detailed conversation view with request/response
  - Token counts per message
- **Real-time Updates**: Server-Sent Events (SSE) for live data
- **Domain Filtering**: View stats for specific domains

### 🚧 Planned
- Export conversations (JSON/CSV)
- Advanced search and filtering
- Cost allocation reports
- Alert configuration
- Usage trends analysis

## Setup

### 1. Environment Configuration

```bash
# Required: Set dashboard API key
export DASHBOARD_API_KEY="your-secure-api-key-here"

# Optional: Enable/disable dashboard
export ENABLE_DASHBOARD=true

# Database connection (required for dashboard)
export DATABASE_URL="postgresql://user:pass@localhost:5432/claude_proxy"
```

### 2. Database Setup

The dashboard requires the storage service to be enabled. Ensure your database has the requests table:

```sql
CREATE TABLE IF NOT EXISTS requests (
  request_id UUID PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  domain VARCHAR(255),
  model VARCHAR(100),
  input_tokens INTEGER,
  output_tokens INTEGER,
  request_body JSONB,
  response_body JSONB,
  response_time_ms INTEGER,
  stream BOOLEAN,
  request_type VARCHAR(50)
);

-- Create indexes for dashboard queries
CREATE INDEX idx_requests_domain_timestamp ON requests(domain, timestamp DESC);
CREATE INDEX idx_requests_timestamp ON requests(timestamp DESC);
```

### 3. Access the Dashboard

1. Start the proxy server:
   ```bash
   bun run start
   ```

2. Navigate to: http://localhost:3000/dashboard

3. Login with your DASHBOARD_API_KEY

## Usage

### Viewing Statistics
- The main dashboard shows aggregated statistics for the last 24 hours
- Use the domain dropdown to filter by specific domains
- Charts update automatically every 10 seconds

### Viewing Conversations
- Click on any conversation in the list to see full details
- Conversations show:
  - Full request/response text
  - Token counts
  - Response time
  - Model used
  - Estimated cost

### Real-time Updates
- New conversations appear automatically
- Statistics update in real-time with visual indicators
- SSE connection status shown in browser console

## Security

- Dashboard requires authentication via API key
- Sessions stored in httpOnly cookies
- No sensitive data (API keys) displayed in UI
- Domain isolation support (future feature)

## Architecture

### Frontend
- Server-rendered HTML with Tailwind CSS
- HTMX for dynamic updates
- Chart.js for visualizations
- Alpine.js for interactivity
- Server-Sent Events for real-time data

### Backend
- Hono route handlers
- PostgreSQL queries with connection pooling
- SSE manager for live updates
- Cookie-based session management

## API Endpoints

### Public (requires auth)
- `GET /dashboard` - Main dashboard page
- `GET /dashboard/conversation/:id` - Conversation detail
- `GET /dashboard/api/conversations` - HTMX conversation list
- `GET /dashboard/sse` - SSE stream for updates
- `GET /dashboard/api/sse-stats` - Active SSE connections

### Authentication
- `GET /dashboard/login` - Login page
- `POST /dashboard/login` - Process login
- `GET /dashboard/logout` - Clear session

## Troubleshooting

### Dashboard not loading
1. Check DASHBOARD_API_KEY is set
2. Verify database connection
3. Ensure storage service is enabled

### No data showing
1. Verify requests are being stored in database
2. Check database permissions
3. Look for errors in server logs

### Real-time updates not working
1. Check browser console for SSE errors
2. Verify your reverse proxy supports SSE
3. Check for firewall/timeout issues

## Development

### Adding new metrics
1. Update database queries in `getGlobalStats()`
2. Add UI components in dashboard routes
3. Update SSE broadcasting if needed

### Customizing appearance
1. Modify Tailwind classes in HTML templates
2. Add custom CSS in the `<style>` section
3. Update chart colors in Chart.js config

## Performance Considerations

- Dashboard queries are optimized with indexes
- Stats cached for 10 seconds
- Pagination on conversation list
- SSE connections limited per domain
- Charts render client-side to reduce server load

## Future Enhancements

1. **User Management**: Multi-user support with roles
2. **Advanced Analytics**: ML-based insights
3. **Mobile App**: React Native companion
4. **Webhooks**: Alert on thresholds
5. **Data Export**: Scheduled reports
6. **Custom Dashboards**: Drag-and-drop widgets