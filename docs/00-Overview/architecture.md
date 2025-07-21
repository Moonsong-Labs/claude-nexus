# Claude Nexus Architecture

## Overview

Claude Nexus Proxy is a high-performance proxy for Claude API with comprehensive monitoring, analytics, and management capabilities. Built with Bun and Hono framework, it provides enterprise-grade features for teams using Claude.

## System Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Client App    │     │    Dashboard    │     │   Claude CLI    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ HTTPS                 │ HTTPS/SSE             │ HTTPS
         ▼                       ▼                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                        Proxy Service                             │
│                        (Port 3000)                               │
│  • API Forwarding     • Authentication    • Token Tracking      │
│  • Request Storage    • Conversation Links • Sub-task Detection │
│  • MCP Server         • AI Analysis       • Slack Notifications │
└────────┬────────────────────────────────────────────┬───────────┘
         │                                            │
         │ PostgreSQL                                 │ HTTPS
         ▼                                            ▼
┌─────────────────┐                          ┌─────────────────┐
│   PostgreSQL    │                          │   Claude API    │
│    Database     │                          │   (Anthropic)   │
└─────────────────┘                          └─────────────────┘
         ▲
         │ PostgreSQL (Read-only)
         │
┌─────────────────┐
│ Dashboard Svc   │
│  (Port 3001)    │
└─────────────────┘
```

## Core Services

### Proxy Service

- **Primary endpoint**: `POST /v1/messages` - Claude API proxy with enhanced features
- **Authentication**: Multi-method support (API keys, OAuth with auto-refresh)
- **Conversation tracking**: Automatic linking and branch detection
- **Token management**: Real-time usage tracking with 5-hour rolling windows
- **MCP server**: Model Context Protocol for prompt management
- **AI analysis**: Background worker for conversation insights (Gemini-powered)
- **Storage**: Configurable request/response persistence

### Dashboard Service

- **Web UI**: Real-time monitoring and historical analytics
- **Visualizations**: Conversation trees, token usage charts, request timelines
- **SSE updates**: Live request streaming
- **Analysis panel**: AI-generated conversation insights
- **Security**: API key authentication with session management

## Key Features

- **Conversation Management**: Automatic tracking with branch visualization
- **Sub-task Detection**: Identifies and links Task tool invocations
- **Token Tracking**: Per-account usage with rolling window support
- **AI Analysis**: Automated conversation insights and feedback
- **MCP Integration**: Prompt management with hot-reloading
- **Multi-tenancy**: Domain-based credential isolation
- **High Performance**: Optimized for long-running requests (10+ minutes)
- **Observability**: Comprehensive logging and metrics

## Documentation

- **Getting Started**: [Installation](../01-Getting-Started/installation.md) | [Configuration](../01-Getting-Started/configuration.md) | [Development](../01-Getting-Started/development.md)
- **User Guides**: [API Reference](../02-User-Guide/api-reference.md) | [Authentication](../02-User-Guide/authentication.md) | [Dashboard](../02-User-Guide/dashboard-guide.md)
- **Operations**: [Deployment](../03-Operations/deployment/) | [Database](../03-Operations/database.md) | [Security](../03-Operations/security.md)
- **Deep Dive**: [Internals](../04-Architecture/internals.md) | [ADRs](../04-Architecture/ADRs/) | [Environment Variables](../06-Reference/environment-vars.md)

## Quick Start

```bash
# Clone and install
git clone https://github.com/your-org/claude-nexus-proxy
cd claude-nexus-proxy
bun install

# Configure credentials
cp credentials/example.com.credentials.json credentials/yourdomain.com.credentials.json
# Edit with your Claude API key

# Start services
bun run dev
```

For production deployment, see the [deployment guides](../03-Operations/deployment/).
