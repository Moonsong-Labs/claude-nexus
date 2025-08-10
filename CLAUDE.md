# CLAUDE.md

This file provides essential guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

Claude Nexus Proxy - High-performance proxy for Claude API with real-time monitoring dashboard. Built with Bun and Hono framework.

## 10 Essential Commands

### 1. `bun install`

**Why**: Installs all dependencies using Bun's fast package manager  
**When**: First setup or after pulling changes with package.json updates  
**Decision**: Bun chosen for 3x faster installs than npm (see ADR-001)

### 2. `bun run scripts/init-database.ts`

**Why**: Creates required database schema for conversation tracking  
**When**: Initial setup or after database schema changes  
**Decision**: PostgreSQL for JSONB support and conversation branching (ADR-003)

### 3. `bun run dev`

**Why**: Starts both proxy (port 3000) and dashboard (port 3001) with hot reload  
**When**: Local development and testing  
**Decision**: Concurrent services for independent scaling (ADR-002)

### 4. `bun run typecheck`

**Why**: Validates TypeScript across monorepo with project references  
**When**: Before EVERY commit to prevent type errors  
**Decision**: Type safety enforced via project references (ADR-013)

### 5. `bun run build`

**Why**: Builds production-optimized bundles for all packages  
**When**: Before deployment or testing production builds  
**Decision**: Multi-stage Docker builds for minimal images (ADR-002)

### 6. `bun test`

**Why**: Runs unit tests with Bun's native test runner  
**When**: After code changes, before commits  
**Decision**: Bun test runner for speed and TypeScript support

### 7. `bun run test:e2e:smoke`

**Why**: Quick E2E validation of critical user paths  
**When**: Before merging PRs, after major changes  
**Decision**: Playwright for reliable cross-browser testing (ADR-021)

### 8. `docker-compose up -d`

**Why**: Runs full stack (proxy, dashboard, PostgreSQL) in containers  
**When**: Testing production-like environment locally  
**Decision**: Docker Compose for consistent environments

### 9. `gh pr create`

**Why**: Creates pull request with proper formatting  
**When**: After completing feature/fix on branch  
**Decision**: All changes via PR for review and CI validation

### 10. `bun run db:backup`

**Why**: Creates timestamped PostgreSQL backup  
**When**: Before migrations or major changes  
**Decision**: Regular backups for data protection

## Critical Architectural Decisions

- **ADR-001**: Monorepo structure with shared packages
- **ADR-003**: Conversation tracking with branching support
- **ADR-013**: TypeScript project references for type safety
- **ADR-019**: Dashboard security (⚠️ DASHBOARD_API_KEY required in production)
- **ADR-021**: E2E testing strategy with Playwright

## Core Development Rules

1. **Never commit secrets** - Use environment variables and `.env` files
2. **TypeScript strict mode** - All code must pass `bun run typecheck`
3. **Test before commit** - Run relevant tests for changed code
4. **Follow existing patterns** - Check neighboring files for conventions
5. **Document decisions** - Create ADRs for architectural changes

## Repository Structure

```
claude-nexus-proxy/
├── packages/shared/     # Shared types and utilities
├── services/
│   ├── proxy/          # API proxy service (Port 3000)
│   └── dashboard/      # Monitoring UI (Port 3001)
├── scripts/            # Utility scripts
├── docker/             # Container configurations
└── docs/               # Documentation and ADRs
```

## Quick Reference

- **Environment Variables**: [docs/06-Reference/environment-vars.md](docs/06-Reference/environment-vars.md)
- **API Documentation**: [docs/02-User-Guide/api-reference.md](docs/02-User-Guide/api-reference.md)
- **All ADRs**: [docs/04-Architecture/ADRs/](docs/04-Architecture/ADRs/)
- **Troubleshooting**: [docs/05-Troubleshooting/common-issues.md](docs/05-Troubleshooting/common-issues.md)

## Important Reminders

- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary
- ALWAYS prefer editing existing files over creating new ones
- NEVER proactively create documentation (\*.md) unless explicitly requested
