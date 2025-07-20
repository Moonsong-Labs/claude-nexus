# Features

> **Document Purpose**: This file provides comprehensive technical documentation of all features in Claude Nexus Proxy. For a quick overview and getting started, see [README.md](/README.md).

Claude Nexus Proxy is a high-performance proxy for the Claude API with comprehensive monitoring, conversation tracking, and advanced management capabilities. This document provides in-depth technical details about each feature.

## Core Features

### 🧠 AI-Powered Conversation Analysis

**Implementation**: Background worker architecture with PostgreSQL job queue (ADR-018)

- **Smart Prompt Engineering**:
  - Uses Gemini 2.0 Flash or 2.5 Pro models
  - Configurable prompt templates with environment variables
  - Custom prompts supported via API
- **Intelligent Truncation**:
  - Tail-first priority algorithm (preserves recent context)
  - Configurable head/tail message counts
  - Target token limits: 8192 tokens (1000 from start, 4000 from end)
- **Structured Insights**:
  - JSON-formatted analysis with sentiment, outcomes, quality metrics
  - Graceful fallback to raw text on parse failures
  - Comprehensive error handling with retry logic
- **Token Management**:
  - 855k token limit with safety margins
  - Per-model token counting
  - Automatic truncation based on token budget
- **Job Processing**:
  - Concurrent job processing (default: 3 jobs)
  - Row-level locking for multi-instance safety
  - Automatic retry with exponential backoff
  - Failed job management with max retry limits

### 🚀 API Proxying

**Implementation**: Hono framework with streaming response handling

- **Direct API forwarding**:
  - Minimal overhead (< 5ms added latency)
  - Full Claude API compatibility
  - Model-agnostic design
- **Streaming support**:
  - SSE (Server-Sent Events) for real-time responses
  - Chunk storage for complete history
  - Stream interruption recovery
- **Request transformation**:
  - Header manipulation
  - Request ID injection
  - Automatic retry on transient failures
- **Timeout configuration**:
  - Default: 10 minutes for Claude API requests
  - Server timeout: 11 minutes (prevents premature closure)
  - Configurable via environment variables
  - Retry timeout slightly longer than request timeout

### 🔐 Authentication & Security

- **Multi-auth support**:
  - API key authentication
  - OAuth 2.0 with automatic token refresh
  - Client API key authentication for proxy access
- **Domain-based credential management**
- **Timing-safe credential verification**
- **Secure credential storage** with separate files per domain

### 📊 Token Tracking & Usage

- **Comprehensive token usage tracking**:
  - Per-account tracking
  - Per-domain tracking
  - 5-hour rolling window monitoring
  - Historical daily usage data
- **Request type classification**:
  - Query evaluation
  - Inference requests
  - Quota checks
- **Tool call counting** and analysis

### 💾 Storage & Persistence

**Implementation**: PostgreSQL with optimized write patterns

- **Database Architecture**:
  - Write-only access from proxy service
  - Read-only access from dashboard
  - Connection pooling for performance
  - Prepared statements for security
- **Storage Features**:
  - Complete request/response logging
  - Streaming chunk storage with ordering
  - Token usage tracking per request
  - Conversation metadata preservation
- **Performance Optimizations**:
  - Batch insert processing
  - Asynchronous write queue
  - Configurable retention policies
  - Index optimization for common queries
- **Data Management**:
  - Automatic orphan cleanup (5-minute intervals)
  - Request ID mapping with 1-hour retention
  - Partitioned tables for time-series data
  - Built-in backup/recovery scripts

### 🔄 Conversation Management

**Implementation**: SHA-256 message hashing with parent-child linking (ADR-003)

- **Automatic conversation tracking**:
  - SHA-256 hashing of message content
  - Dual hash system (message hash + system hash)
  - Backward-compatible with existing conversations
- **Branch detection and visualization**:
  - Git-like branching when conversations diverge
  - Automatic branch naming (branch_HHMMSS format)
  - Visual branch indicators in dashboard
- **Message normalization**:
  - Consistent hashing for string and array content
  - System reminder filtering (`<system-reminder>` tags)
  - Duplicate tool message deduplication
- **Special handling**:
  - Conversation summarization detection
  - Compact conversation continuation (context overflow)
  - Preserves conversation flow across system prompt changes
- **Sub-task detection**:
  - Automatic detection of Task tool invocations
  - Parent-child task relationship tracking
  - Visual sub-task nodes in conversation tree

### 🌳 Sub-task Tracking & Visualization

**Implementation**: Integrated detection in ConversationLinker (ADR-007)

- **Detection Mechanism**:
  - Single-phase detection during conversation linking
  - SQL queries for Task tool invocations (24-hour window)
  - Exact prompt matching with 30-second time window
  - GIN index optimization for fast lookups
- **Relationship Tracking**:
  - `parent_task_request_id` links tasks to parents
  - `is_subtask` boolean flag for confirmed sub-tasks
  - Sub-tasks inherit parent conversation ID
  - Sequential branch naming (subtask_1, subtask_2, etc.)
- **Dashboard Visualization**:
  - Gray sub-task boxes (100x36px) with right offset
  - Hover tooltips showing task prompts
  - Clickable navigation to sub-task conversations
  - "Total Sub-tasks" statistics panel
- **Query Optimization**:
  - PostgreSQL `@>` containment operator
  - Full JSONB GIN index on response_body
  - O(log n) lookup performance

### 📈 Monitoring Dashboard

- **Real-time usage monitoring**
- **Interactive charts** for token usage analysis
- **Request history browser**
- **Conversation visualization** with branch support
- **SSE (Server-Sent Events)** for live updates
- **Account-based analytics**

### 🔔 Notifications & Alerts

- **Slack webhook integration** for notifications
- **Configurable alert thresholds**
- **Error notification** with detailed context

### 📝 MCP (Model Context Protocol) Server

**Implementation**: File-based prompt management with optional GitHub sync (ADR-017)

- **Prompt Management**:
  - YAML file-based storage in `prompts/` directory
  - File names become prompt names (e.g., `feature.yaml` → `/feature`)
  - Handlebars templating with `{{variable}}` syntax
  - Hot-reloading on file changes
- **GitHub Integration**:
  - Optional repository synchronization
  - Configurable sync intervals (default: 5 minutes)
  - Preserves local-only prompts during sync
  - Path traversal security validation
- **Protocol Support**:
  - MCP protocol version 2024-11-05
  - JSON-RPC endpoint at `/mcp`
  - Bearer token authentication
  - Methods: initialize, prompts/list, prompts/get
- **Claude Desktop Integration**:
  - Install via: `claude mcp add nexus-prompts`
  - Tab completion for available prompts
  - Slash commands auto-generated from prompt files

### 🎯 Spark Tool Integration

- **Recommendation Detection**:
  - Automatic detection of `mcp__spark__get_recommendation` tool usage
  - Structured parsing of recommendations
  - Session ID tracking for feedback correlation
- **Feedback System**:
  - In-dashboard feedback UI
  - Rating and comment submission
  - Batch feedback retrieval
  - Integration with Spark API endpoints
- **API Configuration**:
  - Configurable Spark API URL and authentication
  - Automatic feedback forwarding
  - Session-based tracking

### 🛠️ Developer Experience

- **Test sample collection**:
  - Enable with `COLLECT_TEST_SAMPLES=true`
  - Automatic request/response capture
  - Sensitive data masking
  - Organized by request type
- **Debug logging**:
  - Comprehensive logging with `DEBUG=true`
  - SQL query logging with `DEBUG_SQL=true`
  - Automatic masking of API keys and tokens
  - Query performance tracking
- **TypeScript Project References** (ADR-013):
  - Proper dependency management in monorepo
  - Automatic build ordering
  - Cross-package type checking
- **Development Tools**:
  - Git pre-commit hooks via Husky
  - ESLint and Prettier auto-formatting
  - Bun runtime for fast development
- **Database Migrations**:
  - TypeScript-based migration system
  - Auto-initialization from SQL schema
  - Numbered migrations in `scripts/db/migrations/`

### 🐳 Deployment Options

- **Docker support** with optimized images
- **Docker Compose** for full stack deployment
- **Separate images** for proxy and dashboard
- **Environment-based configuration**
- **Health check endpoints**

### 🔧 Operational Features

- **Graceful shutdown**:
  - Completes in-flight requests
  - Closes database connections cleanly
  - Saves pending batch writes
- **Request retry logic**:
  - Automatic retry on transient failures
  - Exponential backoff strategy
  - Configurable retry limits
- **Error recovery**:
  - Connection pool recovery
  - Automatic reconnection to services
  - Failed job reprocessing
- **Performance monitoring**:
  - Slow query logging (default: >5 seconds)
  - Request latency tracking
  - Database query profiling
  - Resource usage metrics
- **Database operations**:
  - TypeScript migration system
  - Auto-initialization on first run
  - Backup and recovery scripts
  - Conversation copy utilities

## Advanced Features

### Message Normalization

- Consistent hashing regardless of content format
- Support for both string and array message content
- Automatic content type detection

### Request Metadata

- Detailed request/response logging
- Performance metrics tracking
- Error categorization and analysis

### API Compatibility

- Full Claude API compatibility
- Model-agnostic design
- Support for all Claude endpoints

## Planned Features

Based on architectural decisions and roadmap (see ADR-011):

- **Kubernetes Deployment**:
  - Helm charts for easy deployment
  - ConfigMaps for configuration
  - Horizontal pod autoscaling
- **Advanced Rate Limiting**:
  - Per-domain rate limits
  - Token bucket algorithm
  - Redis-based distributed limiting
- **Custom Middleware Support**:
  - Plugin architecture for request/response transformation
  - Authentication middleware extensions
  - Custom logging handlers
- **GraphQL API**:
  - Query optimization for dashboard
  - Real-time subscriptions
  - Batch query support
- **Enhanced Analytics**:
  - Cost forecasting
  - Usage trend analysis
  - Custom report generation
- **Multi-Region Support**:
  - Geographic request routing
  - Regional failover
  - Latency optimization
