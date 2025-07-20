# Development Guide

This guide covers day-to-day development workflows for Claude Nexus Proxy.

> **Prerequisites**: See [Installation Guide](./installation.md) for initial setup.

## Quick Start

```bash
# Start both services (proxy on :3000, dashboard on :3001)
bun run dev

# Start individually
bun run dev:proxy
bun run dev:dashboard
```

## Development Workflow

### 1. Pre-commit Hooks

Git hooks are automatically installed via Husky:

```bash
# Hooks run automatically on commit
git commit -m "feat: your message"

# Skip hooks if needed (use sparingly)
git commit -m "fix: emergency" --no-verify
```

**What runs on commit:**

- ESLint fixes for TypeScript/JavaScript
- Prettier formatting
- Note: Type checking runs in CI, not pre-commit (for performance)

### 2. Type Safety

Always check types before pushing:

```bash
# Check all packages
bun run typecheck

# After changing shared types
bun run build:shared
```

The project uses TypeScript Project References for proper monorepo type checking (see ADR-013).

### 3. Testing

```bash
# Run all tests
bun test

# Test specific package
cd packages/shared && bun test

# Test specific file
bun test conversation-linker.test.ts

# Collect test samples (for test development)
COLLECT_TEST_SAMPLES=true bun run dev:proxy
```

## Common Development Tasks

### Working with Database

```bash
# Run migrations
for file in scripts/db/migrations/*.ts; do bun run "$file"; done

# Analyze conversations
bun run scripts/db/analyze-conversations.ts

# Rebuild conversation data
bun run scripts/db/rebuild-conversations.ts

# Check SQL performance
DEBUG_SQL=true SLOW_QUERY_THRESHOLD_MS=100 bun run dev
```

### Managing Credentials

```bash
# Generate secure API key
bun run scripts/auth/generate-api-key.ts

# Check OAuth status
bun run scripts/auth/check-oauth-status.ts

# Create test credentials
cat > credentials/test.local.credentials.json << EOF
{
  "type": "api_key",
  "accountId": "test_account",
  "api_key": "sk-ant-...",
  "client_api_key": "cnp_test_..."
}
EOF
```

### Debugging

```bash
# Enable comprehensive debug logging
DEBUG=true bun run dev:proxy

# SQL debugging only
DEBUG_SQL=true bun run dev:proxy

# Test with curl
curl -X POST http://localhost:3000/v1/messages \
  -H "Host: test.local" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cnp_test_..." \
  -d '{"model": "claude-3-sonnet-20240229", "messages": [{"role": "user", "content": "Hello!"}]}'
```

### AI Worker Development

Enable the AI analysis worker:

```bash
# In .env
AI_WORKER_ENABLED=true
GEMINI_API_KEY=your-key

# Check worker configuration
bun run scripts/check-ai-worker-config.ts

# Monitor analysis jobs
bun run scripts/check-analysis-jobs.ts
```

## Project Structure

- `packages/shared/` - Shared types and utilities
- `services/proxy/` - Proxy API service
- `services/dashboard/` - Dashboard web service
- `scripts/` - Utility scripts (auth, db, dev)
- `docs/ADRs/` - Architecture Decision Records

## Making Changes

### 1. Update Shared Types

Edit in `packages/shared/src/types/`, then:

```bash
bun run build:shared
```

### 2. Add New Features

1. Define types in `packages/shared`
2. Implement in appropriate service
3. Add tests
4. Update relevant documentation

### 3. Database Changes

1. Create migration in `scripts/db/migrations/`
2. Follow naming: `XXX-description.ts`
3. Test migration locally
4. Document in ADR if architectural change

## Troubleshooting

### Port Already in Use

```bash
lsof -i :3000
kill -9 <PID>
```

### Type Errors After Changes

```bash
# Rebuild shared types
bun run build:shared

# Clean and reinstall
rm -rf node_modules
bun install
```

### Database Issues

```bash
# Check connection
psql $DATABASE_URL -c "SELECT 1"

# Verify schema
psql $DATABASE_URL -c "\dt"
```

## Contributing Guidelines

1. **Before PR**: Run `bun run typecheck` and `bun test`
2. **Commit format**: Use conventional commits (feat:, fix:, docs:, etc.)
3. **Documentation**: Update docs for new features
4. **ADRs**: Create ADR for architectural decisions

## Additional Resources

- [CLAUDE.md](../../CLAUDE.md) - AI assistant instructions
- [Configuration Guide](./configuration.md) - Environment variables
- [Docker Deployment](../03-Operations/deployment/docker.md) - Container setup
- [Architecture ADRs](../04-Architecture/ADRs/) - Technical decisions
