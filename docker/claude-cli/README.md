# Claude CLI Docker Integration

Minimal setup for using Claude CLI through the proxy.

## Architecture

```
Claude CLI Container
    ↓ (ANTHROPIC_BASE_URL=http://proxy:3000)
Proxy Service
    ↓ (Bearer token auth)
Claude API
```

## Files

- `Dockerfile` - Builds Claude CLI container with Node.js, ccusage, and monitor
- `entrypoint.sh` - Routes commands to appropriate tools
- `claude-wrapper.sh` - Sets API key from credentials file
- `monitor-wrapper.sh` - Configures environment for usage monitor
- `../../claude` - Helper script to run Claude from project root
- `CLAUDE_MONITOR_INTEGRATION.md` - Technical implementation details for monitor integration

## Configuration

The container expects credentials at:

- `/workspace/client-setup/.credentials.json` - OAuth/API credentials

Environment:

- `ANTHROPIC_BASE_URL=http://proxy:3000` - Routes through proxy

## Usage

### Claude CLI

```bash
# From project root
./claude "Your question here"

# From docker directory
docker compose exec claude-cli /usr/local/bin/claude-cli "Hello"
```

### Token Monitoring

```bash
# Real-time usage monitor
docker compose exec claude-cli monitor

# Daily usage statistics
docker compose exec claude-cli ccusage daily
```

See [CLAUDE.md](../../CLAUDE.md) for more usage examples.
