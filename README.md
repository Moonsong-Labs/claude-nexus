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

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime (v1.0+)
- PostgreSQL database
- Claude API key

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/claude-nexus-proxy.git
cd claude-nexus-proxy

# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your settings

# Initialize database
bun run db:migrate:token-usage

# Start development servers
bun run dev
```

The proxy runs on `http://localhost:3000` and dashboard on `http://localhost:3001`.

### Using Claude CLI with the Proxy

Run Claude CLI connected to your local proxy:

```bash
# Start the proxy and Claude CLI
docker compose --profile dev --profile claude up -d

# Access Claude CLI
docker compose exec claude-cli claude

# Or run a single command
docker compose exec claude-cli claude "What is 2+2?"
```

The Claude CLI will use Bearer token authentication to connect through the proxy.

### Viewing Proxy Logs

After running Claude queries, you can view the proxy logs to debug issues:

```bash
# View recent logs
docker compose logs proxy

# Follow logs in real-time
docker compose logs -f proxy

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

See the [Documentation](docs/README.md) for complete configuration options.

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

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture documentation.

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
```

See [DEVELOPMENT.md](docs/DEVELOPMENT.md) for development guidelines.

## Deployment

### Environments

Claude Nexus Proxy supports deployment to multiple environments:

- **Production (`prod`)** - Live production services
- **Staging (`staging`)** - Pre-production testing environment

For AWS EC2 deployments, use the `manage-nexus-proxies.sh` script with environment filtering:

```bash
# Deploy to production servers only
./scripts/ops/manage-nexus-proxies.sh --env prod up

# Check staging server status
./scripts/ops/manage-nexus-proxies.sh --env staging status
```

See [AWS Infrastructure Guide](docs/03-Operations/deployment/aws-infrastructure.md) for detailed multi-environment setup.

### Docker

#### Using Pre-built Images (Default)

```bash
# Run with docker-compose using images from registry
./docker-up.sh up -d
```

#### Using Locally Built Images

```bash
# Build and run with locally built images
./docker-local.sh up -d --build

# Or manually:
cd docker
docker compose -f docker-compose.local.yml --env-file ../.env up -d --build
```

#### Building Images Separately

```bash
# Build images individually
docker build -f docker/proxy/Dockerfile -t claude-nexus-proxy:local .
docker build -f docker/dashboard/Dockerfile -t claude-nexus-dashboard:local .
```

### Production

See the [Deployment Guide](docs/03-Operations/deployment/) for production deployment options.

## Documentation

Comprehensive documentation is available in the [docs](docs/) directory:

### 📚 Getting Started

- [Quick Start Guide](docs/00-Overview/quickstart.md) - Get up and running in 5 minutes
- [Installation](docs/01-Getting-Started/installation.md) - Detailed installation instructions
- [Configuration](docs/01-Getting-Started/configuration.md) - All configuration options

### 🔧 User Guides

- [API Reference](docs/02-User-Guide/api-reference.md) - Complete API documentation
- [Authentication](docs/02-User-Guide/authentication.md) - Auth setup and troubleshooting
- [Dashboard Guide](docs/02-User-Guide/dashboard-guide.md) - Using the monitoring dashboard
- [Claude CLI](docs/02-User-Guide/claude-cli.md) - CLI integration guide

### 🚀 Operations

- [Deployment](docs/03-Operations/deployment/) - Docker and production deployment
- [Security](docs/03-Operations/security.md) - Security best practices
- [Monitoring](docs/03-Operations/monitoring.md) - Metrics and observability
- [Backup & Recovery](docs/03-Operations/backup-recovery.md) - Data protection

### 🏗️ Architecture

- [System Architecture](docs/00-Overview/architecture.md) - High-level design
- [Internals](docs/04-Architecture/internals.md) - Deep implementation details
- [ADRs](docs/04-Architecture/ADRs/) - Architecture decision records

### 🔍 Troubleshooting

- [Common Issues](docs/05-Troubleshooting/common-issues.md) - FAQ and solutions
- [Performance](docs/05-Troubleshooting/performance.md) - Performance optimization
- [Debugging](docs/05-Troubleshooting/debugging.md) - Debug techniques

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) first.

## License

[MIT License](LICENSE)

## Support

- 📖 [Full Documentation](docs/README.md)
- 🐛 [Issue Tracker](https://github.com/yourusername/claude-nexus-proxy/issues)
- 💬 [Discussions](https://github.com/yourusername/claude-nexus-proxy/discussions)
- 📊 [Changelog](docs/06-Reference/changelog.md)
