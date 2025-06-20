# Claude Nexus Proxy

A high-performance proxy for Claude API with comprehensive monitoring, conversation tracking, and dashboard visualization.

## Features

- 🚀 **High-Performance Proxy** - Built with Bun and Hono for minimal latency
- 🔀 **Conversation Tracking** - Automatic message threading with branch support
- 📊 **Real-time Dashboard** - Monitor usage, view conversations, and analyze patterns
- 🔐 **Multi-Auth Support** - API keys and OAuth with auto-refresh
- 📈 **Token Tracking** - Detailed usage statistics per domain
- 🔄 **Streaming Support** - Full SSE streaming with chunk storage
- 🐳 **Docker Ready** - Separate optimized images for each service

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
bun run db:migrate:init

# Start development servers
bun run dev
```

The proxy runs on `http://localhost:3000` and dashboard on `http://localhost:3001`.

## Configuration

### Environment Variables

Essential configuration:

```bash
# Claude API (optional if using domain credentials)
CLAUDE_API_KEY=sk-ant-...

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/claude_nexus

# Dashboard Authentication
DASHBOARD_API_KEY=your-secure-key

# Optional Features
STORAGE_ENABLED=true
DEBUG=false
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

See [CONFIGURATION.md](docs/CONFIGURATION.md) for complete options.

### Domain Credentials

Create domain-specific credentials:

```bash
# Generate secure API key
bun run auth:generate-key

# Create credential file
cat > credentials/example.com.credentials.json << EOF
{
  "type": "api_key",
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

### Docker

```bash
# Build images
docker build -f docker/proxy/Dockerfile -t claude-nexus-proxy .
docker build -f docker/dashboard/Dockerfile -t claude-nexus-dashboard .

# Run with docker-compose
docker-compose up -d
```

### Production

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production deployment guide.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - System design and components
- [Configuration](docs/CONFIGURATION.md) - All configuration options
- [Development](docs/DEVELOPMENT.md) - Development setup and guidelines
- [API Reference](docs/API.md) - API endpoints and usage
- [Deployment](docs/DEPLOYMENT.md) - Production deployment guide
- [Security](docs/SECURITY.md) - Security considerations
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Common issues and solutions

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) first.

## License

[MIT License](LICENSE)

## Support

- 📖 [Documentation](docs/)
- 🐛 [Issue Tracker](https://github.com/yourusername/claude-nexus-proxy/issues)
- 💬 [Discussions](https://github.com/yourusername/claude-nexus-proxy/discussions)