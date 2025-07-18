# Repository Grooming Guide

This document outlines the grooming process for maintaining a clean and healthy Claude Nexus Proxy repository.

## Quick Start / Common Commands

```bash
# Install dependencies
bun install

# Run type checking
bun run typecheck

# Run tests
bun test

# Format code
bun run format

# Start development servers
bun run dev

# Build for production
bun run build:production
```

## Overview

Repository grooming is a regular maintenance activity to ensure code quality, reduce technical debt, and maintain consistency across the codebase. Our goal is to maintain a clean, secure, and consistent codebase that is easy for all contributors to work with.

## Grooming Checklist

### 1. Code Quality

- [ ] Run `bun run typecheck` and fix all TypeScript errors
- [ ] Run `bun run format` to ensure consistent formatting
- [ ] Run `bun run lint` for workspace-specific linting (if available)
- [ ] Remove or fix any console.log statements (use proper logging)
- [ ] Check for and remove unused imports and dead code
- [ ] Ensure pre-commit hooks are enabled (`bun install` installs them automatically)

### 2. Technical Debt

- [ ] Review `docs/04-Architecture/technical-debt.md`
- [ ] Prioritize and fix HIGH priority items first
- [ ] Update technical debt register with resolution dates
- [ ] Document any new technical debt discovered

### 3. Database & Migrations

- [ ] Ensure `scripts/init-database.sql` reflects all schema changes
- [ ] Verify all migrations in `scripts/db/migrations/` are documented
- [ ] Check that migrations are idempotent (safe to run multiple times)
- [ ] Update database documentation if schema changes

### 4. Security & Privacy

- [ ] Review code for exposed secrets or credentials
- [ ] Ensure sensitive data is properly masked in logs
- [ ] Verify API keys are hashed before storage (check `API_KEY_SALT` configuration)
- [ ] Check that test sample collection sanitizes data
- [ ] Review OAuth token handling and refresh mechanisms
- [ ] Verify environment variables are documented and secure
- [ ] Check for dependency vulnerabilities with `bun audit` (when available)

### 5. Performance

- [ ] Look for N+1 query patterns
- [ ] Check for memory leaks (especially in Maps/Sets)
- [ ] Review SQL queries for missing indexes
- [ ] Monitor slow query logs

### 6. Documentation

- [ ] Update ADRs for any architectural decisions
- [ ] Keep CLAUDE.md current with latest changes
- [ ] Ensure all new features are documented
- [ ] Update API documentation for endpoint changes

### 7. Dependencies

- [ ] Review and update outdated dependencies
- [ ] Check for security vulnerabilities with `bun audit`
- [ ] Remove unused dependencies
- [ ] Document any new dependencies added

### 8. Testing

- [ ] Ensure critical paths have test coverage
- [ ] Update test samples if request/response formats change
- [ ] Verify CI/CD pipeline passes all checks
- [ ] Add tests for any bug fixes

## Grooming Process

### Before Starting

1. Create a new branch: `git checkout -b grooming/YYYY-MM-DD`
2. Review recent PRs and issues for context
3. Check CI/CD status for any failing checks

### During Grooming

1. Work through the checklist systematically
2. Create separate commits for different types of changes
3. Document significant changes in commit messages
4. Update relevant documentation as you go

### After Grooming

1. Create a PR with title: `[grooming] <summary of changes>`
2. Include a summary of all changes in the PR description
3. Reference any issues resolved
4. Request review from team members

## Frequency

- **Weekly**: Quick checks (linting, formatting, obvious issues)
- **Bi-weekly**: Full grooming including technical debt review
- **Monthly**: Comprehensive grooming including dependency updates

## Tools & Commands

### Development Commands

```bash
# Type checking
bun run typecheck
bun run typecheck:proxy    # Proxy service only
bun run typecheck:dashboard # Dashboard service only

# Formatting
bun run format

# Linting
bun run lint  # Runs workspace-specific linting

# Testing
bun test                    # All tests
bun test:unit              # Unit tests only
bun test:integration       # Integration tests
bun test:coverage          # With coverage report

# Pre-commit hooks (auto-installed)
bun install  # Installs Husky hooks automatically
```

### Database Management

```bash
# Run all migrations
for file in scripts/db/migrations/*.ts; do bun run "$file"; done

# Check analysis jobs
bun run scripts/check-analysis-jobs.ts

# Reset stuck analysis jobs
bun run scripts/reset-stuck-analysis-jobs.ts
```

### Dependency Management

```bash
# Check for outdated dependencies
bun outdated

# Update dependencies (use with caution)
bun update
```

### AI Analysis Tools

```bash
# Check AI worker configuration
bun run scripts/check-ai-worker-config.ts

# Inspect analysis content
bun run scripts/check-analysis-content.ts <conversation-id>
```

## Common Issues & Fixes

### TypeScript Errors

- Missing types: Add proper type annotations
- Type mismatches: Update types or fix implementation
- Cannot find module: Check imports and tsconfig paths

### Performance Issues

- N+1 queries: Use joins or window functions
- Memory leaks: Add cleanup for Maps/Sets/Timers
- Slow queries: Add appropriate indexes

### Security Issues

- Exposed secrets: Move to environment variables
- Unmasked sensitive data: Add masking logic
- Missing validation: Add input validation

## Automated Grooming

### Using the File Grooming Slash Command

The `/nexus:crys-file-grooming` slash command provides automated file grooming capabilities:

1. **Purpose**: Automates the process of reviewing and refactoring individual files
2. **Usage**: Available in Claude Code when MCP is configured
3. **Process**:
   - Analyzes file purpose and functionality
   - Identifies improvement areas
   - Validates changes with AI models
   - Implements refactoring
   - Tests and commits changes

### Best Practices for Automated Grooming

- Focus on one file at a time
- Review AI-suggested changes carefully
- Always test after automated refactoring
- Document significant changes in commit messages

## Pre-commit Hooks

The project uses Husky and lint-staged for automated code quality checks:

- **Automatic Setup**: Hooks are installed automatically via `bun install`
- **What Runs**: ESLint fixes and Prettier formatting on staged files
- **Manual Setup** (if needed): `bunx husky init`

**Note**: TypeScript type checking is not included in pre-commit hooks for performance reasons but runs in CI/CD.

## Security Best Practices

### Secret Management

- **No secrets in code**: Use environment variables or credential files
- **API Key Security**: Configure `API_KEY_SALT` for proper hashing
- **OAuth Tokens**: Implement secure refresh mechanisms
- **Credential Files**: Store in `credentials/` directory (gitignored)

### Reporting Vulnerabilities

- Create confidential issues in GitHub
- Follow guidelines in SECURITY.md (if available)
- Document security fixes in ADRs

## Maintaining This Guide

This document should be reviewed:

- **Quarterly**: For comprehensive updates
- **Before major releases**: To ensure accuracy
- **When tools change**: Update commands and processes

Create a recurring issue to remind the team about guide maintenance.

## References

- [Technical Debt Register](docs/04-Architecture/technical-debt.md)
- [Database Documentation](docs/03-Operations/database.md)
- [Architecture Decision Records](docs/04-Architecture/ADRs/)
- [CLAUDE.md](CLAUDE.md) - AI Assistant Guidelines
- [ADR-012](docs/04-Architecture/ADRs/adr-012-database-schema-evolution.md) - Database Schema Evolution
- [ADR-018](docs/04-Architecture/ADRs/adr-018-ai-powered-conversation-analysis.md) - AI Analysis Architecture

---

Last Updated: 2025-07-19

## Grooming Log

### 2025-07-19 - Docker Compose Configuration Cleanup

**Files Modified:**

- `docker/docker-compose.yml`

**Changes Made:**

1. **Fixed Documentation**
   - Updated usage instructions to reflect correct filename (was referencing non-existent `docker-compose.local.yml`)
   - Added note about ensuring .env file exists before running

2. **Removed Dead Code**
   - Removed unused `claude_data` volume declaration that was never referenced by any service

3. **Fixed Network Configuration**
   - Changed network from external to internal (managed by docker-compose)
   - Removed `external: true` flag that would cause startup failures if network didn't pre-exist

4. **Improved Security**
   - Made dashboard API key configurable via environment variable: `${DASHBOARD_API_KEY:-default_dev_key}`
   - Made pgAdmin credentials configurable: `${PGADMIN_DEFAULT_EMAIL:-admin@example.com}` and `${PGADMIN_DEFAULT_PASSWORD:-admin}`
   - Moved away from hardcoded credentials pattern

5. **Added Missing Configurations**
   - Added health check for dashboard service (HTTP check on port 3001)
   - Added logging configuration for dashboard service (matching other services)
   - Added container name for dashboard service: `claude-nexus-dashboard`
   - Added container name for pgAdmin service: `claude-nexus-pgadmin`
   - Added logging configuration for pgAdmin service

6. **Consistency Improvements**
   - Standardized container naming across all services
   - Ensured all services have proper logging configurations
   - Made configuration patterns consistent across services

**Rationale:**
These changes improve the local development experience by removing potential failure points (external network), improving security practices (no hardcoded credentials), and ensuring consistency in service configuration. The changes follow Docker Compose best practices while maintaining compatibility with the existing docker-up.sh wrapper script.

### 2025-07-18 - Docker Build Scripts Refactoring

**Files Modified:**

- `docker/build-images.sh`
- `docker/push-images.sh`

**Changes Made:**

1. **Enhanced Error Handling**
   - Added `set -euo pipefail` for strict error handling
   - Added prerequisite checks (Docker availability, Dockerfile existence)
   - Improved error reporting with clear messages

2. **Reduced Code Duplication**
   - Created reusable functions (`build_image`, `push_image`)
   - Used arrays to define services, eliminating repetitive code
   - Centralized helper functions for consistent output

3. **Improved Configuration**
   - Made Docker Hub username configurable via `DOCKER_REGISTRY_USER` environment variable
   - Added proper color code handling for non-terminal environments
   - Used readonly variables for immutability where appropriate

4. **Better User Experience**
   - Added build time tracking
   - Simplified and consolidated output messages
   - Enhanced help documentation with environment variable information
   - Added Docker version display at start

5. **Code Quality**
   - Fixed shellcheck compliance issues (proper variable quoting)
   - Used direct command checks instead of `$?`
   - Consistent function naming and structure

**Rationale:**
The refactoring aligns with industry best practices for shell scripting, making the scripts more maintainable, reliable, and flexible. The changes enable contributors to use their own Docker registries and provide better error handling for common failure scenarios.

### 2025-07-18 - Claude CLI Entrypoint Security Improvements

**Files Modified:**

- `docker/claude-cli/entrypoint.sh`

**Changes Made:**

1. **Enhanced Security**
   - Removed all `chown` operations that attempted to run as root
   - Leveraged the fact that container runs as 'claude' user for automatic correct file ownership
   - Added `set -euo pipefail` for fail-fast behavior on errors

2. **Improved Error Handling**
   - Script now exits immediately on any command failure
   - Prevents container from running in partially configured state
   - Aligns with container best practices for robust error handling

3. **Code Quality Improvements**
   - Added comprehensive documentation header explaining script purpose
   - Consistent use of CLAUDE_HOME environment variable
   - Removed redundant directory creation (already handled in Dockerfile)
   - Added comments for each major section

4. **Simplified Logic**
   - Removed unnecessary permission operations since files copied by 'claude' user have correct ownership
   - Used `${1:-}` pattern for safer parameter handling
   - Consistent formatting and structure

**Rationale:**
The primary driver for these changes was improving security by eliminating root-level operations in the runtime script. According to container best practices, all permission and directory setup should happen at build time (Dockerfile), not runtime. The changes also improve maintainability through better documentation and error handling. These modifications were validated by Gemini 2.5 Pro with 9/10 confidence, confirming alignment with industry standards for container entrypoints.
