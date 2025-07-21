# Claude CLI Integration

Use Claude CLI with the Claude Nexus Proxy for tracked usage and monitoring.

## Quick Start

### Using the Helper Script (Recommended)

```bash
# Run Claude from anywhere in the project
./claude "What is the purpose of this project?"

# Interactive mode
./claude
```

### Using Docker Commands

```bash
# Start services
./docker-up.sh up -d

# Access Claude CLI
./docker-up.sh exec claude-cli claude "Your query here"

# View token usage
./docker-up.sh exec claude-cli ccusage daily
```

## Common Usage Patterns

### Analyze Code

```bash
./claude "Review the code in services/proxy/src/app.ts"
```

### Monitor Token Usage

```bash
# Real-time monitoring
./docker-up.sh exec claude-cli monitor

# Usage reports
./docker-up.sh exec claude-cli ccusage weekly
```

### Work with Files

The project directory is mounted at `/workspace` in the container:

```bash
./claude "Analyze the architecture in /workspace/docs"
```

## Troubleshooting

### Claude not connecting?

- Check services: `./docker-up.sh ps`
- View logs: `./docker-up.sh logs claude-cli`

### Authentication issues?

- Verify credentials exist: `ls -la credentials/`
- Check proxy logs: `./docker-up.sh logs proxy | grep -i auth`

### Need detailed logs?

```bash
# Enable debug mode
DEBUG=true ./docker-up.sh up -d

# View detailed logs
./docker-up.sh logs -f proxy
```

## Learn More

For comprehensive technical documentation including configuration, architecture, and advanced troubleshooting, see:

- [Claude CLI Docker Integration](../../docker/claude-cli/README.md)
- [CLAUDE.md](../../CLAUDE.md) - Project conventions for Claude
