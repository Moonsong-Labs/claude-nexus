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

**Note**: Do not manually edit lockfiles (bun.lock, package-lock.json, yarn.lock, etc.). These are auto-generated files that ensure reproducible builds.

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

### 2025-07-18 - Claude Monitor Integration Documentation Refactoring

**Files Modified:**

- `docker/claude-cli/CLAUDE_MONITOR_INTEGRATION.md`
- `docker/claude-cli/README.md`

**Changes Made:**

1. **Refactored CLAUDE_MONITOR_INTEGRATION.md**
   - Removed redundant content already covered in README.md, ADR-010, and CLAUDE.md
   - Focused on monitor-specific technical implementation details
   - Added cross-references to related documentation
   - Reduced file from ~120 lines to ~58 lines while preserving unique content

2. **Updated README.md**
   - Added reference to CLAUDE_MONITOR_INTEGRATION.md in files list
   - Added monitor and ccusage to Dockerfile description
   - Added Token Monitoring section with usage examples
   - Added link to CLAUDE.md for more examples

**Rationale:**

- The original file contained significant duplication with other documentation
- Refactoring follows DRY principle while preserving valuable technical details
- Monitor integration is actively used (as shown in CLAUDE.md) and needs documentation
- Technical implementation details are now clearly separated from usage instructions

### 2025-07-19 - Dockerfile.local Cleanup

**Files Modified:**

- Removed: `docker/claude-cli/Dockerfile.local`

**Changes Made:**

1. **Removed Unused File**
   - Deleted `docker/claude-cli/Dockerfile.local` which was not referenced anywhere in the codebase
   - The main `Dockerfile` in the same directory serves the same purpose and is actively used
   - Reduces maintenance burden and prevents confusion about which Dockerfile to use

**Analysis Findings:**

- Dockerfile.local contained outdated configurations (Node 20 vs 24 in main Dockerfile)
- Had unnecessary complexity (proxy settings, hardcoded Alpine mirrors, complex builder pattern)
- Both AI models (Gemini-2.5-flash and O3-mini) validated the deletion as the correct approach
- No functionality loss as docker-compose.yml correctly references the main Dockerfile

### 2025-07-18 - Test Sample Collection Script Refactoring

**Files Modified:**

- Moved: `test-sample-collection.sh` from root to `scripts/dev/test/`
- Refactored: Complete rewrite for production readiness

**Changes Made:**

1. **Relocated File**
   - Moved from project root to `scripts/dev/test/` alongside other test scripts
   - Aligns with project structure conventions

2. **Added Production Features**
   - Comprehensive documentation header with purpose, prerequisites, and usage
   - Error handling with `set -eo pipefail` for strict execution
   - Prerequisite validation (curl, jq, API key, proxy status)
   - Configurable proxy URL via argument or environment variable
   - Interactive safety prompt before removing existing samples
   - Colored output for better user experience
   - Proper exit codes for CI/CD integration (0-4)

3. **Improved User Experience**
   - Clear status messages throughout execution
   - Helpful error messages with remediation hints
   - Sample content preview with jq formatting
   - Detailed file listing of collected samples

**Rationale:**

- Script was a development utility at the wrong location with no error handling
- Refactoring makes it CI/CD ready and follows shell scripting best practices
- Gemini-2.5-pro validated the plan with 10/10 confidence score
- Essential for automated testing of the proxy's test sample collection feature

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

### 2025-07-19 - Orphaned Test Script Cleanup

**Files Modified:**

- Removed: `test-integration.sh` (root directory)
- Removed: `test-api.sh` (root directory)

**Changes Made:**

1. **Removed Orphaned Test Scripts**
   - Deleted two redundant curl-based test scripts from the project root
   - Both scripts performed identical basic health checks on the proxy and dashboard
   - No references to these files existed in CI/CD, package.json, or documentation
   - The actual integration test runner is `scripts/test-integration.sh` (different file)

**Analysis Findings:**

- `test-integration.sh` and `test-api.sh` were nearly identical (only minor wording differences)
- Both files contained simple curl commands to test basic API endpoints
- Proper TypeScript integration tests exist in `tests/integration/`
- The package.json references `./scripts/test-integration.sh`, not the root files
- Git history showed minimal commits, suggesting they were quick verification scripts

**Rationale:**

These orphaned scripts represented technical debt that could cause confusion. They duplicated functionality, were in the wrong location (should be in `scripts/dev/test/` if needed), and provided no value over the existing comprehensive test infrastructure. Their removal simplifies the repository structure and eliminates potential confusion about which test scripts to use.

**Validation:**

- Gemini 2.5 Pro: 9/10 confidence score
- O3: 9/10 confidence score
- Integration tests continue to pass after removal

### 2025-07-18 - Docker Test Environment File Cleanup

**Files Modified:**

- Removed: `docker/.env.test`

**Changes Made:**

1. **Removed Orphaned File**
   - Deleted `docker/.env.test` which was not referenced anywhere in the codebase
   - File contained test environment variables that were never used
   - All Docker configurations correctly use the root `.env` file via `docker-up.sh`

**Analysis Findings:**

- No scripts, CI/CD workflows, or test configurations referenced this file
- Docker Compose explicitly loads `.env` from project root using `--env-file` flag
- Test scripts use the main `.env` file for configuration
- File appeared to be leftover from earlier development

**Validation:**

- Gemini-2.5-pro endorsed deletion with 10/10 confidence score
- Confirmed as standard "code gardening" best practice
- Aligns with Principle of Least Astonishment

**Rationale:**
Removing orphaned configuration files eliminates developer confusion and reduces maintenance burden. This cleanup reinforces the project's clear configuration pattern of using a single root `.env` file for all environments. The deletion has negligible risk since the file was completely unused, while providing high value by simplifying the project structure for current and future developers.

### 2025-07-19 - Empty .claude Directory Cleanup

**Files Modified:**

- Removed: `.claude` directory from project root

**Changes Made:**

1. **Removed Empty Directory**
   - Deleted empty `.claude` directory that served no purpose in the project
   - Directory was already listed in `.gitignore` (line 170)
   - No code references this directory (all Docker references use `/home/claude/.claude`)

**Analysis Findings:**

- Directory was completely empty with no files
- Already gitignored, suggesting it might have been for local development
- Could cause confusion with Docker's `/home/claude/.claude` configuration directory
- Appeared only in test fixtures as an example of untracked git status

**Validation:**

- Gemini-2.5-pro endorsed removal with 10/10 confidence score
- Classified as "textbook example of good repository hygiene"
- Recommended performing a safety check for `/.claude` references (completed, none found)

**Rationale:**
Removing empty, unused directories is standard repository maintenance that improves code clarity and prevents developer confusion. The directory served no documented purpose and its removal has zero functional impact while eliminating potential confusion with the Docker container's Claude configuration directory.

### 2025-07-19 - bun.lock File Assessment

**Files Modified:**

- Updated: `GROOMING.md` to add lockfile guidance

**Changes Made:**

1. **Added Lockfile Documentation**
   - Added note in Dependencies section clarifying that lockfiles should not be manually edited
   - Ensures future grooming efforts don't attempt to modify auto-generated files

**Analysis Findings:**

- `bun.lock` is a 104KB text-based lockfile (not the older binary bun.lockb format)
- Contains exact dependency versions for reproducible builds
- Already follows all best practices: tracked in git, proper format, correct location
- No grooming actions needed for lockfiles as they are auto-generated

**Validation:**

- Perplexity research confirmed lockfile best practices
- Model consensus attempted but encountered technical issues
- Decision based on established lockfile management standards

**Rationale:**
Lockfiles are critical infrastructure files that ensure consistent dependency installation across all environments. They should never be manually edited or "groomed" as this would break the project's dependency management. The only action needed was to document this in GROOMING.md to prevent future confusion.

### 2025-07-19 - MCP Prompts Documentation Fix

**Files Modified:**

- `prompts/README.md` - Updated to reflect actual implementation

**Changes Made:**

1. **Fixed Documentation Mismatch**
   - Removed incorrect format showing `id`, `arguments`, `content` fields
   - Updated to show actual implementation: `name`, `description`, `template` fields
   - Changed syntax examples from `{arg1}` to `{{arg1}}` Handlebars syntax
   - Added Handlebars conditional examples to match test-generator.yaml usage

2. **Clarified Implementation Details**
   - Documented that `name` field is ignored (filename is used)
   - Added notes about Handlebars templating features
   - Provided example matching actual prompt files

**Analysis Findings:**

- Investigation revealed `test-generator.yaml` was already correct
- The PromptRegistryService.ts uses Handlebars templating (not simple string replacement)
- Implementation only supports `template` field, not the documented `content` field
- No argument validation exists - the documented `arguments` array is not implemented
- Both Gemini-2.5-pro and O3-mini confirmed fixing documentation was the right approach

**Rationale:**

Rather than break working functionality by changing the implementation or the working prompt files, updating the documentation to match reality was the most sensible approach. This maintains backward compatibility while eliminating confusion for future contributors. The test-generator.yaml file required no changes as it was already correctly formatted for the current implementation.

### 2025-07-19 - Obsolete MCP Prompt File Cleanup

**Files Modified:**

- Removed: `prompts/grooming.md`

**Changes Made:**

1. **Removed Obsolete File**
   - Deleted `prompts/grooming.md` which was incompatible with MCP implementation
   - File was in Markdown format while all other prompts are YAML
   - Contained XML-like tags and shell commands instead of proper YAML structure
   - Not referenced anywhere in the codebase

**Analysis Findings:**

- All other files in `prompts/` directory are YAML files (code-review.yaml, test-generator.yaml)
- MCP implementation expects YAML files with `name`, `description`, and `template` fields
- The file contained shell command executions with `!` that are incompatible with Handlebars templating
- Comprehensive grooming documentation already exists in GROOMING.md
- The `/nexus:crys-file-grooming` command appears to be the actual grooming implementation

**Validation:**

- Gemini-2.5-flash: 10/10 confidence score for deletion
- O3-mini: 9/10 confidence score for deletion
- Type checking passes after deletion

**Rationale:**

The file represented technical debt that could cause confusion about MCP prompt format and functionality. Its removal simplifies the prompts directory structure and ensures all prompt files follow the consistent YAML format expected by the MCP implementation. The grooming functionality is properly documented in GROOMING.md and appears to be implemented elsewhere in the system.
