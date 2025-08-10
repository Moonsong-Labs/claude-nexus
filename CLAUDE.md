# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## How to Contribute

This project is developed entirely by AI agents. Follow these contribution guidelines to maintain quality and consistency.

### Documentation First

- Keep documentation concise - reference ADRs for architectural details
- Update documentation before implementing features
- Remove temporary files, scripts, and test data before committing

### Consistency & Quality

- Follow existing code patterns and styles (check `package.json` for libraries)
- Run `bun run typecheck` before all commits
- Validate sources and provide references for decisions
- Use established patterns found in neighboring files

### Architectural Decisions

Always reference or create ADRs (docs/04-Architecture/ADRs/) for technical decisions:

- **ADR-001**: Monorepo structure with shared packages
- **ADR-013**: TypeScript project references for type safety
- **ADR-012**: Database schema evolution strategy
- **ADR-019**: Dashboard security (critical: DASHBOARD_API_KEY required)
- **ADR-021**: E2E testing with Playwright

### AI Agent Rules

- Never commit secrets or API keys
- Ensure `credentials/` directory is in .gitignore (never commit credentials)
- Test all changes before committing
- Create ADRs for non-trivial architectural changes
- Follow [Repository Grooming](docs/01-Getting-Started/repository-grooming.md) for maintenance

## Project Description

Claude Nexus Proxy - High-performance proxy for Claude API with real-time monitoring dashboard. Built with Bun and Hono framework.

### Repository Structure

```
claude-nexus-proxy/
├── packages/shared/     # Shared types and utilities
├── services/
│   ├── proxy/          # API proxy service (Port 3000)
│   └── dashboard/      # Monitoring UI (Port 3001)
├── scripts/            # Utility scripts
├── docker/             # Container configurations
├── docs/               # Documentation and ADRs
└── credentials/        # Domain credentials
```

### Services

**Proxy Service** (Port 3000): Forwards requests to Claude API

- Multi-auth support (API keys, OAuth with auto-refresh)
- Conversation tracking with branching (see [ADR-003](docs/04-Architecture/ADRs/adr-003-conversation-tracking.md))
- Token usage monitoring (see [ADR-005](docs/04-Architecture/ADRs/adr-005-token-usage-tracking.md))

**Dashboard Service** (Port 3001): Real-time monitoring interface

- Request history and analytics
- Conversation visualization with branch support
- **⚠️ CRITICAL**: `DASHBOARD_API_KEY` is REQUIRED in production environments. Without it, dashboard runs unauthenticated (see [ADR-019](docs/04-Architecture/ADRs/adr-019-dashboard-read-only-mode-security.md))

### How It Works

Client → Proxy (auth, tracking) → Claude API → Response → Storage (PostgreSQL) → Dashboard

### Data & Configuration

- **Storage**: PostgreSQL with TypeScript migrations (see [ADR-012](docs/04-Architecture/ADRs/adr-012-database-schema-evolution.md))
- **Environment**: See [docs/06-Reference/environment-vars.md](docs/06-Reference/environment-vars.md) for all variables
- **Scripts**: See [scripts/README.md](scripts/README.md) for utility scripts

### Interfaces

- REST API on port 3000 (proxy)
- Web UI on port 3001 (dashboard)
- MCP prompts on /mcp (see [ADR-017](docs/04-Architecture/ADRs/adr-017-mcp-prompt-sharing.md))

### Maintenance

Follow [Repository Grooming](docs/01-Getting-Started/repository-grooming.md) for weekly maintenance tasks.

## Project Development

### Prerequisites

- Bun runtime (exclusive - no Node.js)
- PostgreSQL 12+
- Environment variables configured (`.env` file with `DATABASE_URL`)

### Essential Commands

```bash
# Installation (2 commands)
bun install                           # Install dependencies
bun run scripts/init-database.ts      # Initialize database (requires DATABASE_URL in .env)

# Development (3 commands)
bun run dev                          # Run both services
bun run dev:proxy                    # Run proxy only (port 3000)
bun run dev:dashboard                # Run dashboard only (port 3001)

# Build & Test (3 commands)
bun run build                        # Build all packages
bun test                             # Run unit tests
bun run test:e2e:smoke              # Run E2E smoke tests

# Docker (2 commands)
./docker/build-images.sh            # Build Docker images
./docker-up.sh up -d                 # Run full stack with Docker
```

### Pre-commit Checks

Automatic via Husky:

- ESLint fixes for TypeScript/JavaScript
- Prettier formatting for all files
- Note: TypeScript checking is not automated - run manually as noted above

### Debugging

- Set `DEBUG=true` for verbose logging
- Set `DEBUG_SQL=true` for SQL query logging
- See [docs/05-Troubleshooting/debugging.md](docs/05-Troubleshooting/debugging.md) for more

### Additional Resources

- **All ADRs**: [docs/04-Architecture/ADRs/](docs/04-Architecture/ADRs/)
- **Environment Variables**: [docs/06-Reference/environment-vars.md](docs/06-Reference/environment-vars.md)
- **API Reference**: [docs/02-User-Guide/api-reference.md](docs/02-User-Guide/api-reference.md)
- **Deployment Guide**: [docs/03-Operations/deployment/](docs/03-Operations/deployment/)
