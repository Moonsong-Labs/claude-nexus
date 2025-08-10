# Development Guide

Essential commands for developing Claude Nexus Proxy with Bun.

## Prerequisites

- Bun v1.0+ (exclusive - no Node.js)
- PostgreSQL 12+
- `.env` file with DATABASE_URL

## 10 Essential Development Commands

### 1. `bun install`

**Why**: Install all dependencies with Bun's fast package manager  
**Decision**: Bun chosen for 3x faster installs and native TypeScript  
**When**: After cloning or pulling package.json changes

### 2. `bun run scripts/init-database.ts`

**Why**: Initialize PostgreSQL schema for conversation tracking  
**Decision**: TypeScript migrations for type safety (ADR-012)  
**When**: First setup or schema changes

### 3. `bun run dev`

**Why**: Start proxy (3000) and dashboard (3001) with hot reload  
**Decision**: Concurrent services for independent development  
**When**: Daily development work

### 4. `bun run typecheck`

**Why**: Validate TypeScript across monorepo  
**Decision**: Project references ensure correct build order (ADR-013)  
**When**: Before EVERY commit - CI will fail without this

### 5. `bun run format`

**Why**: Apply Prettier formatting consistently  
**Decision**: Automated formatting prevents style debates  
**When**: Before commits (auto-run via Husky pre-commit hook)

### 6. `bun test`

**Why**: Run unit tests with Bun's native test runner  
**Decision**: Bun test for speed and built-in TypeScript  
**When**: After code changes, before pushing

### 7. `bun run test:e2e:smoke`

**Why**: Quick E2E validation of critical paths  
**Decision**: Playwright with data-testid selectors (ADR-021)  
**When**: Before merging PRs

### 8. `bun run build`

**Why**: Build production bundles for deployment  
**Decision**: Validates all TypeScript and creates optimized output  
**When**: Before deployment or testing production builds

### 9. `DEBUG=true bun run dev`

**Why**: Enable verbose logging for debugging  
**Decision**: Conditional logging prevents production noise  
**When**: Troubleshooting issues

### 10. `bun run db:backup`

**Why**: Create timestamped database backup  
**Decision**: Protect data before migrations or experiments  
**When**: Before database changes

## Project Structure

```
claude-nexus-proxy/
├── packages/shared/     # Shared types (build first!)
├── services/
│   ├── proxy/          # API proxy (port 3000)
│   └── dashboard/      # Web UI (port 3001)
└── scripts/            # Utility scripts
```

## Quick Tips

### Environment Setup

```bash
# Minimal .env for development
DATABASE_URL=postgresql://localhost/claude_nexus_dev
DASHBOARD_API_KEY=dev-key
DEBUG=true
```

### Common Issues

- **Type errors**: Run `bun run typecheck` and fix before commit
- **Build fails**: Ensure shared package built first
- **Database errors**: Check DATABASE_URL in .env
- **Port conflicts**: Kill existing processes on 3000/3001

## Next Steps

- [Environment Variables](../06-Reference/environment-vars.md) - Full configuration
- [API Reference](../02-User-Guide/api-reference.md) - Endpoint documentation
- [ADRs](../04-Architecture/ADRs/) - Architectural decisions
