# Web Dashboard Development Plan

## Overview
Develop a web dashboard for Claude Nexus Proxy that provides real-time visibility into conversations and usage statistics across all domains.

## Goals
1. **Conversation Visibility**: View ongoing and historical chats between users and Claude by domain
2. **Usage Analytics**: Domain-specific and global statistics on API usage, tokens, costs, and patterns
3. **Real-time Monitoring**: Live updates on active conversations and metrics
4. **Multi-tenant Support**: Secure access to domain-specific data

## Architecture Design

### Frontend Stack
- **Framework**: React with TypeScript (or Vue.js/Svelte for lighter weight)
- **UI Library**: Tailwind CSS + Shadcn/ui or Material-UI
- **State Management**: Zustand or Redux Toolkit
- **Charts**: Recharts or Chart.js for visualizations
- **Real-time**: WebSockets (Socket.io) or Server-Sent Events

### Backend Integration
- **API**: Extend existing Hono app with dashboard endpoints
- **Authentication**: JWT-based auth with domain-scoped access
- **Database**: Leverage existing PostgreSQL storage
- **Real-time**: WebSocket server for live updates

## Feature Breakdown

### Phase 1: Core Dashboard (MVP)

#### 1.1 Authentication & Access Control
```typescript
// New endpoints
POST   /api/auth/login     // Login with domain credentials
POST   /api/auth/refresh   // Refresh JWT token
GET    /api/auth/me        // Get current user/domain info
```

- Domain-based authentication (use existing credential system)
- JWT tokens with domain scope
- Role-based access (admin, viewer)

#### 1.2 Conversation Viewer
```typescript
// Conversation endpoints
GET    /api/conversations                    // List conversations
GET    /api/conversations/:id                // Get single conversation
GET    /api/conversations/:id/messages       // Get messages with pagination
GET    /api/conversations/:id/stream         // SSE for live updates
```

**Features:**
- List view of all conversations for a domain
- Conversation detail view with message history
- Real-time updates for active conversations
- Search and filter by date, model, user
- Token count per message
- Request/response timing

**UI Components:**
```
┌─────────────────────────────────────────────────┐
│ Dashboard > example.com > Conversations         │
├─────────────────────────┬───────────────────────┤
│ Conversation List       │ Message Thread        │
│ ┌─────────────────────┐ │ ┌─────────────────┐  │
│ │ □ Conv #1234 (2.5k) │ │ │ User: Help me.. │  │
│ │   3 mins ago       │ │ │ Tokens: 150     │  │
│ │ □ Conv #1233 (1.2k) │ │ ├─────────────────┤  │
│ │   15 mins ago      │ │ │ Claude: Sure... │  │
│ │ □ Conv #1232 (5.1k) │ │ │ Tokens: 2,341   │  │
│ └─────────────────────┘ │ └─────────────────┘  │
└─────────────────────────┴───────────────────────┘
```

#### 1.3 Statistics Dashboard
```typescript
// Statistics endpoints
GET    /api/stats/overview              // Global stats
GET    /api/stats/domains               // Per-domain summary
GET    /api/stats/domains/:domain       // Detailed domain stats
GET    /api/stats/timeline              // Time-series data
GET    /api/stats/models                // Usage by model
```

**Metrics to Track:**
- Total requests (by domain, time period)
- Token usage (input/output)
- Cost estimation (based on token usage)
- Response times (p50, p95, p99)
- Error rates
- Active users/domains
- Model usage distribution
- Peak usage times

**Dashboard Layout:**
```
┌─────────────────────────────────────────────────┐
│ Statistics Overview                             │
├─────────────┬─────────────┬─────────────────────┤
│ Total       │ Today       │ This Month          │
│ ├ Requests  │ ├ 1,234     │ ├ 45,678           │
│ ├ Tokens    │ ├ 2.5M      │ ├ 89.2M            │
│ └ Cost      │ └ $125      │ └ $4,460           │
├─────────────┴─────────────┴─────────────────────┤
│ Usage Timeline          [1D] [7D] [30D] [90D]   │
│ ┌─────────────────────────────────────────────┐ │
│ │     📊 Chart showing requests over time     │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ Top Domains             │ Model Distribution     │
│ 1. app.example.com 45%  │ Claude 3 Opus    45%  │
│ 2. dev.example.com 30%  │ Claude 3 Sonnet  35%  │
│ 3. api.example.com 15%  │ Claude 3 Haiku   20%  │
└─────────────────────────┴───────────────────────┘
```

### Phase 2: Advanced Features

#### 2.1 Real-time Monitoring
- WebSocket connection for live updates
- Active conversation counter
- Real-time token usage meter
- Alert system for errors or rate limits

#### 2.2 Advanced Analytics
- Cost breakdown by domain/team
- Usage patterns and trends
- Conversation quality metrics
- Response time analysis
- Geographic distribution (if applicable)

#### 2.3 Administration Panel
- Domain management
- User access control
- API key rotation
- Rate limit configuration
- Alert configuration

#### 2.4 Export & Reporting
- Export conversations (JSON, CSV)
- Generate usage reports
- Cost allocation reports
- API to integrate with billing systems

### Phase 3: Enhanced Features

#### 3.1 Conversation Management
- Tag and categorize conversations
- Bulk operations (export, delete)
- Conversation search across all messages
- Favorite/bookmark conversations

#### 3.2 Advanced Visualizations
- Token usage heatmap
- Request flow diagram
- Error analysis dashboard
- Model performance comparison

#### 3.3 Integration Features
- Webhook notifications
- Slack integration for alerts
- API for custom integrations
- Embed widgets for external dashboards

## Implementation Plan

### Sprint 1: Foundation (Week 1-2)
- [ ] Set up frontend project structure
- [ ] Create authentication system
- [ ] Design database schema for dashboard data
- [ ] Implement basic API endpoints
- [ ] Create login and layout components

### Sprint 2: Conversation Viewer (Week 3-4)
- [ ] Implement conversation list API
- [ ] Create conversation list UI
- [ ] Implement message thread viewer
- [ ] Add pagination and search
- [ ] Test with real data

### Sprint 3: Statistics Dashboard (Week 5-6)
- [ ] Implement statistics aggregation queries
- [ ] Create statistics API endpoints
- [ ] Build dashboard UI components
- [ ] Add charts and visualizations
- [ ] Implement time range filters

### Sprint 4: Real-time Features (Week 7-8)
- [ ] Set up WebSocket server
- [ ] Implement live conversation updates
- [ ] Add real-time metrics
- [ ] Create notification system
- [ ] Performance optimization

### Sprint 5: Polish & Deploy (Week 9-10)
- [ ] UI/UX improvements
- [ ] Add loading states and error handling
- [ ] Write documentation
- [ ] Set up deployment pipeline
- [ ] Security audit

## Technical Considerations

### Security
- Domain isolation (users only see their domain's data)
- Rate limiting on dashboard API
- Secure session management
- Input validation and sanitization
- CORS configuration for API access

### Performance
- Efficient database queries with indexes
- Pagination for large datasets
- Caching for frequently accessed data
- Lazy loading for UI components
- CDN for static assets

### Scalability
- Horizontal scaling for dashboard servers
- Database read replicas for analytics
- Redis for session storage
- Background jobs for heavy computations
- Archive old data to reduce query load

### Database Schema Extensions
```sql
-- Add indexes for dashboard queries
CREATE INDEX idx_requests_domain_timestamp ON requests(domain, timestamp DESC);
CREATE INDEX idx_requests_conversation_id ON requests(conversation_id);

-- Add conversation grouping
ALTER TABLE requests ADD COLUMN conversation_id UUID;
ALTER TABLE requests ADD COLUMN message_index INTEGER;

-- Add materialized views for stats
CREATE MATERIALIZED VIEW daily_stats AS
SELECT 
  domain,
  DATE(timestamp) as date,
  COUNT(*) as request_count,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  AVG(response_time_ms) as avg_response_time
FROM requests
GROUP BY domain, DATE(timestamp);
```

### API Route Structure
```
/api/
  /auth/
    POST   /login
    POST   /logout
    POST   /refresh
    GET    /me
  
  /conversations/
    GET    /                    ?domain=&limit=&offset=&from=&to=
    GET    /:id
    GET    /:id/messages        ?limit=&offset=
    GET    /:id/export          ?format=json|csv
    DELETE /:id                 (admin only)
  
  /stats/
    GET    /overview            ?from=&to=
    GET    /domains             ?from=&to=
    GET    /domains/:domain     ?from=&to=&granularity=hour|day|month
    GET    /timeline            ?domain=&from=&to=&granularity=
    GET    /models              ?domain=&from=&to=
    GET    /costs               ?domain=&from=&to=&breakdown=model|domain
  
  /ws/
    /conversations              WebSocket for live updates
    /metrics                    WebSocket for real-time metrics
```

## Success Metrics
- Dashboard load time < 2 seconds
- Real-time updates latency < 500ms
- Support for 10k+ conversations per domain
- 99.9% uptime for dashboard
- User satisfaction score > 4.5/5

## Future Enhancements
- Mobile app version
- AI-powered insights and anomaly detection
- Conversation sentiment analysis
- Automated report generation
- Multi-language support
- White-label customization options