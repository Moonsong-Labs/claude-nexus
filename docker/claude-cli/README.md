# Claude CLI Docker Service

This Docker service runs Claude CLI connected to the Claude Nexus Proxy.

## How It Works

1. The container installs the official `@anthropic-ai/claude-code` package
2. On startup, it configures Claude to use the proxy endpoint (`http://proxy:3000/v1`)
3. Authentication is handled via Bearer token using the `CLAUDE_API_KEY` environment variable
4. The project directory is mounted at `/workspace` for file access

## Configuration

The setup script (`setup.sh`) creates two configuration files:

### `.claude.json`
```json
{
  "version": "1.0",
  "api": {
    "endpoint": "http://proxy:3000/v1"
  },
  "settings": {
    "theme": "dark",
    "telemetry": false
  }
}
```

### `.claude/.credentials.json`
```json
{
  "claudeAiOauth": {
    "accessToken": "${CLAUDE_API_KEY}",
    "refreshToken": "",
    "expiresAt": "2099-12-31T23:59:59Z"
  }
}
```

The `accessToken` field is populated with your `CLAUDE_API_KEY` environment variable, which is used as a Bearer token for authentication.

## Usage

See the main [Claude CLI documentation](../../docs/CLAUDE_CLI.md) for usage instructions.