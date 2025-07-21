# Claude Nexus Proxy

A high-performance proxy for Claude API with comprehensive monitoring, conversation tracking, and dashboard visualization.

## Features

- 🚀 **High-Performance Proxy** - Built with Bun and Hono for minimal latency
- 🔀 **Conversation Tracking** - Automatic message threading with branch support
- 📊 **Real-time Dashboard** - Monitor usage, view conversations, and analyze patterns
- 🔐 **Multi-Auth Support** - API keys and OAuth with auto-refresh
- 📈 **Token Tracking** - Detailed usage statistics per domain and account
- 🔄 **Streaming Support** - Full SSE streaming with chunk storage
- 🐳 **Docker Ready** - Separate optimized images for each service
- 🤖 **Claude CLI Integration** - Run Claude CLI connected to the proxy
- 🧠 **AI-Powered Analysis** - Automated conversation insights using Gemini Pro

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime (v1.0+)
- PostgreSQL database
- Claude API key

### Installation

```bash
# Clone the repository
git clone https://github.com/moonsong-labs/claude-nexus-proxy.git
cd claude-nexus-proxy

# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your settings

# Initialize database (run migrations)
# See scripts/db/migrations/README.md for details

# Start development servers
bun run dev
```

The proxy runs on `http://localhost:3000` and dashboard on `http://localhost:3001`.

### Using Claude CLI with the Proxy

Run Claude CLI connected to your local proxy:

```bash
# Start the proxy and Claude CLI
./docker-up.sh --profile dev --profile claude up -d

# Access Claude CLI
./docker-up.sh exec claude-cli claude

# Or run a single command
./docker-up.sh exec claude-cli claude "What is 2+2?"
```

The Claude CLI will use Bearer token authentication to connect through the proxy.

### Viewing Proxy Logs

After running Claude queries, you can view the proxy logs to debug issues:

```bash
# View recent logs
./docker-up.sh logs proxy

# Follow logs in real-time
./docker-up.sh logs -f proxy

# Use the helper script for filtered views
./scripts/view-claude-logs.sh --help

# Examples:
./scripts/view-claude-logs.sh -f          # Follow logs
./scripts/view-claude-logs.sh -e -n 100   # Show last 100 errors
./scripts/view-claude-logs.sh -r          # Show API requests
```

## Configuration

### Environment Variables

Essential configuration:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/claude_nexus

# Dashboard Authentication
DASHBOARD_API_KEY=your-secure-key

# Optional Features
STORAGE_ENABLED=true
DEBUG=false
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

See the [Configuration Guide](docs/01-Getting-Started/configuration.md) for complete configuration options.

### Domain Credentials

Create domain-specific credentials:

```bash
# Generate secure API key
bun run auth:generate-key

# Create credential file
cat > credentials/example.com.credentials.json << EOF
{
  "type": "api_key",
  "accountId": "acc_unique_identifier",
  "api_key": "sk-ant-...",
  "client_api_key": "cnp_live_..."
}
EOF
```

## Usage

### API Proxy

Use the proxy exactly like Claude's API:

```bash
curl -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer YOUR_CLIENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-opus-20240229",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Dashboard

Access the dashboard at `http://localhost:3001` with your `DASHBOARD_API_KEY`.

Features:

- Real-time request monitoring
- Conversation visualization with branching
- Token usage analytics
- Request history browsing

## Architecture

```
claude-nexus-proxy/
├── packages/shared/      # Shared types and utilities
├── services/
│   ├── proxy/           # Proxy API service
│   └── dashboard/       # Dashboard web service
└── scripts/             # Management utilities
```

See [System Architecture](docs/00-Overview/architecture.md) for detailed architecture documentation.

## Development

```bash
# Run type checking
bun run typecheck

# Run tests
bun test

# Format code
bun run format

# Database operations
bun run db:backup              # Backup database
bun run db:analyze-conversations # Analyze conversation structure
bun run db:rebuild-conversations # Rebuild conversation data

# AI Analysis management
bun run ai:check-jobs          # Check analysis job statuses
bun run ai:check-content       # Inspect analysis content
bun run ai:reset-stuck         # Reset jobs with high retry counts
bun run ai:fail-exceeded       # Manually fail jobs exceeding retries
```

See [Development Guide](docs/01-Getting-Started/development.md) for development guidelines.

## Deployment

### Docker

```bash
# Run with pre-built images
./docker-up.sh up -d

# Build and run locally
./docker-local.sh up -d --build
```

### Production Environments

- **Production (`prod`)** - Live production services
- **Staging (`staging`)** - Pre-production testing

```bash
# Deploy to production
./scripts/ops/manage-nexus-proxies.sh --env prod up

# Check staging status
./scripts/ops/manage-nexus-proxies.sh --env staging status
```

See the [Deployment Guide](docs/03-Operations/deployment/) for detailed deployment options.

## Documentation

Full documentation is available in the [docs](docs/) directory, organized by topic:

- **[Getting Started](docs/01-Getting-Started/)** - Installation, configuration, and development
- **[User Guide](docs/02-User-Guide/)** - API reference, authentication, and dashboard usage
- **[Operations](docs/03-Operations/)** - Deployment, security, monitoring, and backups
- **[Architecture](docs/04-Architecture/)** - System design, internals, and decision records
- **[Troubleshooting](docs/05-Troubleshooting/)** - Common issues and debugging

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) first.

## Support

- 📖 [Full Documentation](docs/README.md)
- 🐛 [Issue Tracker](https://github.com/moonsong-labs/claude-nexus-proxy/issues)
- 💬 [Discussions](https://github.com/moonsong-labs/claude-nexus-proxy/discussions)
- 📊 [Changelog](docs/06-Reference/changelog.md)
