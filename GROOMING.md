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
bun run build
```

## Overview

Repository grooming is a regular maintenance activity to ensure code quality, reduce technical debt, and maintain consistency across the codebase. Our goal is to maintain a clean, secure, and consistent codebase that is easy for all contributors to work with.

## Recent Grooming Activities

### 2025-07-21

- **feature-plan-ai-analysis.md deletion**: Removed outdated AI analysis feature planning document
  - Deleted `docs/04-Architecture/feature-plan-ai-analysis.md` as the feature has been fully implemented
  - Feature is properly documented in ADR-018 (architectural decision) and AI Analysis Implementation Guide
  - Updated ADR-018 to remove broken link to the deleted feature plan
  - Validated with Gemini-2.5-pro (10/10 confidence) - aligns with "documentation as code" best practices
  - Rationale: Prevents documentation debt, ensures architecture folder reflects current state not historical planning
  - Impact: Cleaner repository, reduced confusion, single source of truth for AI analysis feature

- **ADR-017 grooming**: Enhanced MCP Prompt Sharing Implementation documentation
  - Added acceptance date (2024-12-10) and updated status to "Accepted and Implemented"
  - Enhanced context section with clear problem statement
  - Added comprehensive "Alternatives Considered" section documenting why file-based approach was chosen over database-backed (ADR-016)
  - Improved consequences section with more detailed positive/negative impacts
  - Added implementation details section referencing key source files
  - Updated references to remove potentially broken GitHub PR links
  - Added both Mermaid and ASCII diagrams for better architecture visualization
  - Validated with Gemini-2.5-pro and O3-mini - aligned with Michael Nygard's ADR best practices
  - Rationale: Improves documentation clarity, provides better decision traceability, follows ADR standards
  - Impact: Better understanding of architectural decisions, clearer guidance for maintainers

- **.github directory cleanup**: Streamlined CI/CD workflows for production readiness
  - Deleted `.github/workflows/typecheck.yml` - Functionality duplicated in code-quality.yml
  - Deleted `.github/PRETTIER_CI_SETUP.md` - Referenced non-existent auto-format.yml workflow
  - Removed redundant type checking from ci.yml (already in code-quality.yml)
  - Deleted `.github/workflows/claude.yml` - Undocumented experimental workflow with critical security vulnerabilities
  - Verified all workflows use consistent bun@v2 and dependency installation
  - Validated with Gemini-2.5-flash (9/10) and O3-mini (9/10) - strong consensus
  - Rationale: Reduces CI/CD redundancy, improves maintainability, addresses security concerns
  - Impact: Faster CI runs, clearer workflow responsibilities, improved developer experience

- **ADR-002 grooming**: Updated separate Docker images ADR to reflect current implementation
  - Removed outdated Dockerfile code examples that didn't match actual implementation
  - Added links to actual Dockerfile implementations and build scripts
  - Created ADR-041 to document the Claude CLI Docker image addition (extending original 2-image to 3-image architecture)
  - Preserved historical context while removing misleading implementation details
  - Validated approach with Gemini-2.5-flash and O3-mini - aligned with ADR best practices
  - Rationale: Maintains ADR accuracy without losing historical decision context
  - Impact: Clearer documentation, reduced confusion for new contributors

### 2025-07-20

- **Deleted services/dashboard/preload.js**: Removed dead code file
  - File was a CommonJS script for loading .env files before ES modules
  - Not used anywhere in the codebase (no imports or references)
  - Dashboard's main.ts already contains comprehensive environment loading logic
  - Project has migrated to ES modules (package.json has "type": "module")
  - Was listed in eslint ignore patterns as legacy file
  - Validated deletion with Gemini-2.5-flash and O3-mini (both confirmed removal)
  - Removed reference from eslint.config.js ignore list
  - Dashboard starts successfully without the file
  - Rationale: Dead code elimination following clean code principles

- **Deleted services/dashboard/src/types/storage-service.ts**: Removed unused interface file
  - File contained `StorageServiceEnhancements` interface that was never used in codebase
  - `getConversationById` method already implemented in storage reader
  - `getConversationSummariesPaginated` method not implemented or needed
  - Validated deletion with Gemini-2.5-pro (9/10 confidence)

- **Cleaned up services/dashboard/package.json**: Simplified scripts and added missing dependency
  - Added explicit `@claude-nexus/shared` dependency (was used but not declared)
  - Removed redundant scripts: `dev:direct`, `dev:watch` (duplicates of `dev`)
  - Removed redundant scripts: `build:check` (duplicate of `build:production`)
  - Kept `build:production` as alias for backward compatibility (used by Docker and root scripts)
  - Removed `NODE_ENV=production` from `start:prod` (handled by wrapper)
  - Validated refactoring plan with Gemini-2.5-pro (9/10 confidence)
  - All build commands and dev server tested successfully
  - Rationale: Explicit dependencies and simplified scripts improve maintainability
  - Build and tests pass after deletion
  - Rationale: Dead code elimination following clean code principles

- **Minimal refactoring of services/dashboard/src/storage/reader.ts**: Applied targeted improvements to deprecated file
  - Added @deprecated JSDoc annotation with clear migration guidance to ProxyApiClient
  - Extracted type-safe cache key generation utility (`getCacheKey`) to replace error-prone string concatenation
  - Added comprehensive documentation to complex SQL queries explaining their purpose and performance optimizations
  - Added TODO comment for type interfaces that should ideally be in shared package
  - Added consistent error handling comments explaining why methods return empty arrays
  - Rationale: Applied minimal refactoring approach as recommended by AI models (Gemini-2.5-flash and o3-mini) since file is marked for removal in Phase 3
  - Key decision: Avoided major structural changes (splitting class, extracting SQL, adding streaming) to minimize risk for deprecated code
  - All existing functionality preserved and tested - dashboard starts successfully

- **Refactored services/dashboard/src/utils/formatters.ts**: Improved code quality and maintainability
  - Removed unused `formatTimestamp` function that was not imported anywhere
  - Extracted constants for magic numbers (MILLION, THOUSAND, MS_PER_SECOND, etc.)
  - Added comprehensive JSDoc examples for all functions
  - Consolidated duplicate `formatNumber` function from analytics.ts into shared utility
  - Added null check to `formatNumber` to match removed duplicate's behavior
  - Note: Did not consolidate `formatNumber` from chart-helpers.ts as it serves different purpose (locale formatting)
  - Validated refactoring plan with Gemini-2.5-pro (9/10 confidence)
  - All formatters tested and working correctly
  - Build succeeds despite unrelated TypeScript errors in other files
  - Rationale: Improves code maintainability, removes dead code, follows DRY principle

- **Deleted services/dashboard/src/utils/html.ts**: Removed duplicate HTML escaping utilities
  - File contained `escapeHtml`, `escapeHtmlArray`, and `safeHtml` functions
  - `escapeHtml` was duplicated in `formatters.ts` with slightly different implementation
  - Most imports (5 files) already used `formatters.ts`, only 2 files imported from `html.ts`
  - `safeHtml` function was not used anywhere in the codebase
  - Added `escapeHtmlArray` to `formatters.ts` before deletion as it was used by `analysis.ts`
  - Updated imports in `analysis.ts` and `prompts.ts` to use `formatters.ts`
  - Validated with Gemini-2.5-pro (9/10 confidence) who strongly endorsed the consolidation
  - Rationale: Eliminates code duplication, centralizes HTML escaping in one place, removes dead code

- **Deleted services/dashboard/src/errors/index.ts**: Removed unused barrel export file
  - File contained only `export * from './HttpError.js'` but was never imported
  - All 8 files needing HttpError import it directly from './HttpError.js'
  - Also removed empty `__tests__` directory in the same folder
  - Validated deletion with Gemini-2.5-pro who confirmed barrel files can cause circular dependencies and harm tree-shaking
  - Build and existing type checks continue to pass after deletion
  - Rationale: Dead code elimination and alignment with project's direct import pattern

- **Deleted services/dashboard/src/layout/**tests**/theme-test-utils.ts**: Removed unused test utility file
  - File was not imported anywhere in the codebase
  - Both test files using theme functionality have their own inline implementations
  - Functions like mockLocalStorage, extractCSSVariables, createMockElement were never used
  - Validated deletion with Gemini-2.5-pro (10/10) and O3-mini (10/10) who both strongly endorsed removal
  - Tests continue to pass after deletion

- **Deleted services/dashboard/run-dev.sh**: Removed redundant development script
  - Script duplicated functionality already in package.json's "dev" script: `bun --watch src/main.ts`
  - Bun automatically loads .env files, making manual environment loading redundant
  - File was not referenced anywhere in the codebase
  - Only dashboard had this script - proxy service doesn't have equivalent, showing inconsistency
  - Project uses npm scripts consistently for all other dev commands
  - Validated deletion with Gemini-2.5-pro (9/10 confidence)
  - Dashboard dev command (`bun run dev`) continues to work correctly after deletion
  - Rationale: Dead code elimination, enforces project consistency, removes anti-pattern

- **Refactored services/dashboard/src/layout/index.ts**: Improved code organization and maintainability
  - Extracted theme toggle JavaScript to new file `layout/theme-toggle.ts` for better separation of concerns
  - Moved 140+ lines of inline CSS styles to `layout/styles.ts` as `jsonViewerStyles` section
  - Improved type safety by changing `content` parameter from `any` to `string | Promise<string>`
  - Added comprehensive JSDoc documentation for the layout function
  - Added inline comments explaining CSRF token implementation for security clarity
  - Fixed related test in `dark-mode.integration.test.ts` to check for actual CSS instead of removed comment
  - Validated refactoring plan with both Gemini-2.5-flash and O3-mini models
  - Rationale: The file had accumulated technical debt with mixed inline styles/scripts. This refactoring improves maintainability while preserving all functionality

- **Deleted services/dashboard/src/routes/partials/analytics-conversation.ts**: Removed unused analytics route
  - Route `/partials/analytics/conversation/:conversationId` was registered but never used anywhere in the UI
  - No HTMX calls, fetch requests, or any references to this endpoint existed
  - File contained 400+ lines of dead code with inline JavaScript charts
  - Had duplicate helper functions from `analytics.ts` and outdated hardcoded pricing
  - Validated deletion with Gemini-2.5-flash who confirmed it as dead code best removed during cleanup
  - Removed import and route registration from `app.ts`
  - Rationale: Dead code increases maintenance burden and confuses developers. The sprint goal is cleaning for production

- **services/dashboard/src/routes/sse.ts**: Improved incomplete SSE implementation
  - Added comprehensive TODO documentation explaining the incomplete state
  - Enhanced type safety with proper interfaces (SSEConnection, SSEMessage)
  - Added connection limit protection (MAX_CONNECTIONS_PER_DOMAIN = 100)
  - Improved error handling and logging throughout
  - Added proper JSDoc documentation for all functions
  - Kept implementation as the feature is documented but not yet integrated
  - Validated with Gemini-2.5-pro (9/10) and O3-mini (9/10) who recommended completing the feature
  - Rationale: The SSE feature is documented in multiple places but not registered in routes. Rather than delete potentially valuable code or complete a cross-service integration during grooming, improved code quality and documented the incomplete state for future implementation

- **Deleted services/dashboard/src/routes/sse-simple.ts**: Removed deprecated fallback SSE implementation
  - File had critical missing imports (logger, MAX_CONNECTIONS_PER_DOMAIN, connectionId)
  - Not used anywhere in the codebase (no imports)
  - Marked as "deprecated fallback implementation" in recent commit
  - Duplicated functionality already present in sse.ts
  - Validated deletion with Gemini-2.5-flash who agreed it adds confusion and maintenance burden

- **Deleted services/dashboard/src/routes/dashboard.ts**: Removed obsolete monolithic dashboard implementation
  - File was not imported or used anywhere in the codebase
  - Represented an older monolithic version (530 lines) replaced by modular architecture
  - Dashboard functionality has been properly split into focused modules (auth.ts, overview.ts, requests.ts, etc.)
  - Contained anti-patterns: ~200 lines of inline CSS, hardcoded HTML templates, mixed concerns
  - Validated deletion with Gemini-2.5-pro (10/10 confidence) who confirmed it aligns with best practices (YAGNI, Boy Scout Rule)
  - Rationale: Keeping dead code only adds technical debt and confusion. The modular architecture is superior and already fully implemented
  - Updated technical debt documentation to reflect removal

- **services/dashboard/src/components/spark-feedback.ts**: Removed unused duplicate Spark feedback component
  - File exported `renderSparkRecommendation()` but was never imported anywhere
  - Duplicate of actively used `spark-recommendation-inline.ts` component
  - Contained security concerns (hardcoded port 3000) and anti-patterns (370+ lines of inline CSS/JS)
  - Validated with Gemini-2.5-flash (9/10 confidence) and O3-mini (9/10 confidence)
  - Rationale: Removing unused duplicate code improves maintainability and eliminates security risks

- **services/dashboard/public/message-selection.js**: Removed unused JavaScript file
  - File was not referenced anywhere in the codebase
  - Message selection functionality already implemented inline in request-details.ts
  - Created documentation for preserved feature ideas: message range selection and shift+click
  - Documented in `docs/03-Operations/feature-ideas/message-range-selection.md`
  - Rationale: Removing dead code improves maintainability and reduces confusion

- **services/dashboard/public/styles.css**: Removed obsolete CSS file and empty public directory
  - Dashboard uses inline CSS from `src/layout/styles.ts`, not static CSS files
  - Static file serving was explicitly removed per `app.ts` comment
  - No references to this file found anywhere in the codebase
  - Validated with Gemini-2.5-flash and O3-mini who confirmed deletion as best practice
  - Rationale: Removing unused files reduces confusion and aligns with the dashboard's inline CSS architecture

### 2025-01-20

- **services/proxy/tests/domain-extractor.test.ts**: Refactored domain extractor tests for improved maintainability and coverage
  - Extracted helper function `makeRequest` to eliminate code duplication across test cases
  - Added TypeScript type definitions (SuccessResponse, ErrorResponse) for better type safety
  - Organized test data into named constants (INVALID_HOST_HEADERS, IPV4_TEST_CASES, etc.) for clarity
  - Migrated to `it.each` pattern for parameterized tests, improving test output and debugging
  - Added comprehensive IPv6 test coverage including compressed forms and edge cases
  - Improved test descriptions to be more specific and descriptive
  - Maintained 100% compatibility with existing tests while reducing code from 179 to ~200 lines with better organization
  - All 30 tests continue to pass without modification to the middleware
  - Rationale: This critical middleware test file needed better organization and completeness. The refactoring improves maintainability through DRY principles while adding missing IPv6 coverage that's essential for modern network environments

- **services/proxy/tests/ai-analysis-db.test.ts**: Groomed AI analysis database tests for production readiness
  - Fixed TypeScript import paths by removing incorrect `.js` extensions
  - Improved type safety by replacing all `any` types with proper TypeScript types
  - Added type imports for Mock and ConversationAnalysis from shared types
  - Created test constants (TEST_JOB_ID, TEST_CONVERSATION_ID, etc.) to avoid magic numbers
  - Implemented factory functions (createMockJob, createMockAnalysisData) for consistent test data
  - Standardized mocking patterns using Bun's Mock type for better type safety
  - Added missing test coverage for null analysis data and database pool unavailability
  - Improved error assertions to verify logger calls and error details
  - Ensured all tests use configuration constants from AI_WORKER_CONFIG
  - Rationale: Tests need to be maintainable, type-safe, and follow DRY principles to prevent regressions and make the codebase easier to understand

- **services/proxy/src/mcp/McpServer.ts**: Refactored MCP server implementation for production readiness
  - Removed unused variables (\_params) that were assigned but never used
  - Improved type safety by replacing `any` types with proper zod validation schemas
  - Replaced console.error with structured logging using the middleware logger
  - Created dedicated McpError class for consistent error handling instead of throwing raw objects
  - Added RPC method name constants to prevent typos and centralize API definition
  - Implemented proper parameter validation with zod schemas that handle backward compatibility
  - Documented the multi-parameter support (promptId/id/name) for Claude Code compatibility
  - Updated JsonRpcHandler to properly handle McpError instances
  - All changes maintain backward compatibility and existing MCP functionality
  - Created new errors.ts file with McpError class following error handling best practices
  - Rationale: The MCP server is a production component that needed better error handling, type safety, and observability for debugging and maintenance

- **services/proxy/src/services/slack.ts**: Refactored Slack notification service to eliminate global state and improve code quality
  - Removed duplicate SlackConfig interface (now imported from credentials.ts) following DRY principle
  - Converted from module-level global variables to a class-based SlackService for better testability and encapsulation
  - Improved type safety by replacing `any` with `unknown` and adding proper type guards
  - Consolidated duplicate initialization logic between `initializeSlack` and `initializeDomainSlack`
  - Added named constants for magic values (MAX_CONTENT_LENGTH, DEFAULT_USERNAME, etc.)
  - Maintained backward compatibility with existing API through wrapper functions
  - Fixed TypeScript non-null assertion warnings with proper null checks
  - Updated NotificationService.ts to use the new SlackService class
  - All existing tests pass without modification
  - Rationale: The Slack service is used by multiple consumers (global and domain-specific). Moving to a class-based architecture prevents state pollution between consumers, improves testability, and follows Node.js/TypeScript best practices for services with configuration state

### 2025-01-20

- **services/proxy/src/middleware/domain-extractor.ts**: Refactored domain extraction middleware for improved code quality and security
  - Removed unnecessary else block after early return for cleaner code flow
  - Added IPv6 support alongside existing IPv4 detection
  - Replaced manual JSON error responses with standardized `createErrorResponse` utility
  - Added explicit return type annotation for better type safety
  - Extracted regex patterns as named constants for clarity and reusability
  - Implemented Host header validation to prevent injection attacks
  - Added helper functions (`isValidHostHeader`, `extractDomain`) for better code organization
  - Enhanced inline documentation explaining port preservation logic
  - Added comprehensive test coverage for Host header validation
  - Rationale: This middleware is critical infrastructure used globally across all routes. The refactoring improves security posture, maintainability, and consistency while preserving all existing behavior

### 2025-01-20

- **services/proxy/src/routes/health.ts**: Refactored health check endpoints for production readiness
  - Added proper TypeScript interfaces replacing `any` types
  - Implemented comprehensive error logging for database failures
  - Replaced magic numbers with HTTP_STATUS constants
  - Standardized response structures across all endpoints
  - Added requestId to all responses for better observability
  - Enhanced database health check using pg_catalog query instead of basic SELECT 1
  - Extracted repeated database check logic into DRY helper function
  - Added comprehensive JSDoc documentation for all endpoints
  - Clearly distinguished between liveness (no deps) and readiness (with deps) probes
  - Rationale: Health endpoints are critical for container orchestration and monitoring. The refactoring improves type safety, error visibility, and maintainability while maintaining compatibility with existing Docker/Kubernetes configurations

### 2025-01-19

- **client-setup/.claude.json**: Removed user-specific Claude configuration from version control
  - Created `.claude.json.example` template with generic values
  - Added actual `.claude.json` to .gitignore to prevent future commits
  - Updated documentation to explain the setup process
  - Rationale: User-specific data (userID, usage stats) should not be in public repositories

- **client-setup/.gitkeep**: Deleted redundant file
  - The directory already contains tracked files (README.md, .claude.json.example, .credentials.json)
  - Git automatically tracks directories with files, making .gitkeep unnecessary
  - Follows Git best practices: .gitkeep should only exist in otherwise empty directories
  - Rationale: Removing redundant files improves repository hygiene and reduces clutter

- **client-setup/.credentials.json**: **CRITICAL SECURITY ISSUE** - Removed OAuth credentials from repository
  - File contained real OAuth tokens (access token, refresh token) and was committed to git history
  - Deleted the file and added to .gitignore to prevent future commits
  - Created `.credentials.json.example` with placeholder values
  - Updated README.md with proper setup instructions
  - Created ADR-020 documenting the security issue and remediation steps
  - **IMPORTANT**: Git history still contains the sensitive data (commit d88479428b8ef50ec19445c29474cc5c0c9a8045)
  - **ACTION REQUIRED**: Credentials must be revoked and git history should be rewritten using git-filter-repo

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

**IMPORTANT: Migration Immutability**

- **DO NOT** modify migration files that have been executed in production
- Executed migrations form an immutable historical record of schema evolution
- Modifying executed migrations can break database reproducibility for new environments
- Apply coding standards and improvements only to NEW migrations
- See [Migration Best Practices](#migration-best-practices) for details

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

````bash
# Run all migrations
for file in scripts/db/migrations/*.ts; do bun run "$file"; done

# Check analysis jobs
bun run scripts/check-analysis-jobs.ts


### Dependency Management

```bash
# Check for outdated dependencies
bun outdated

# Update dependencies (use with caution)
bun update
````

### AI Analysis Tools

```bash
# Check AI worker configuration
bun run scripts/check-ai-worker-config.ts

# Inspect analysis content
bun run scripts/check-analysis-content.ts <conversation-id>
```

## Migration Best Practices

### Migration Immutability Principle

Once a migration has been executed in any shared environment (staging, production), it becomes part of the immutable database history and **MUST NOT** be modified. This principle ensures:

1. **Reproducible Database State**: New developers and CI/CD systems can recreate the exact database state
2. **Deployment Reliability**: Database setups won't fail due to modified migrations
3. **Historical Accuracy**: The migration history accurately reflects how the schema evolved

### What NOT to Do

Even for code quality improvements, **DO NOT** modify executed migrations by:

- Adding dotenv configuration loading
- Improving error handling or logging
- Adding type safety or interfaces
- Changing console output formatting
- Refactoring code structure
- Adding dry-run modes or statistics

### What TO Do Instead

1. **Leave executed migrations untouched** - They are historical artifacts
2. **Apply standards to NEW migrations** - Use improved patterns going forward
3. **Document patterns in the migrations README** - Update `scripts/db/migrations/README.md`
4. **Create migration templates** - Provide boilerplate for new migrations with best practices

### Identifying Executed Migrations

A migration is considered "executed" if:

- It's documented in the migrations README
- It's referenced in CLAUDE.md or other documentation
- It has a creation date older than the last deployment
- It exists in the main branch

When in doubt, assume the migration has been executed and leave it unchanged.

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

### 2025-07-19 - Test Script Cleanup

**Files Deleted:**

- `scripts/test-max-retry-failure.ts`
- Removed `ai:test-max-retry` script from package.json

**Rationale:**

1. **Production Database Pollution** - The script created test data directly in the production database, violating best practices
2. **Temporary Verification Script** - This was a one-off script to verify max retry functionality, not a reusable utility
3. **Redundant Functionality** - The `fail-exceeded-retry-jobs.ts` script already handles failing jobs that exceed max retries
4. **No Proper Tests** - Instead of ad-hoc scripts, proper unit/integration tests should be written for the AI analysis worker

**Consensus Decision:**

Both Gemini 2.5 Pro and O3-mini unanimously agreed (10/10 confidence) that deletion was the correct approach, citing:

- Elimination of production risk
- Alignment with industry best practices
- Reduction of technical debt
- Proper separation of test and production code

### 2025-07-19 - Conversation Linking Test Fixture Cleanup

**Files Deleted:**

- `packages/shared/src/utils/__tests__/fixtures/conversation-linking/10-general-linking.json`

**Changes Made:**

1. **Deleted misplaced test fixture** - The fixture contained data from an unrelated "DataHaven operator" project (Ethereum benchmarks, InvalidMessage errors) instead of Claude Nexus Proxy conversation linking test data
2. **Verified test integrity** - Confirmed all conversation linking tests pass after deletion

### 2025-07-19 - Subtask Linking Test Fixture Cleanup

**Files Modified:**

- `packages/shared/src/utils/__tests__/fixtures/subtask-linking/05-subtask-follow.json`

**Changes Made:**

1. **Removed unrelated project data** - The fixture contained data from an unrelated "Agrosken" agricultural technology project instead of Claude Nexus Proxy test data
2. **Simplified fixture structure** - Aligned with the pattern of other fixtures in the same directory (e.g., `01-subtask-matched.json`)
3. **Fixed test data** - Created proper test data for the "subtask follow" scenario with:
   - Correct task invocation structure
   - Matching prompt between parent and child
   - Appropriate timestamps and metadata
   - Expected branch ID of "subtask_1"
4. **Maintained test integrity** - All subtask-linker tests continue to pass after refactoring

**Rationale:**

The fixture was incorrectly populated with data from a different project, making it inconsistent with other test fixtures and potentially confusing for developers. The cleanup improves test clarity and maintainability while ensuring the fixture properly tests its intended scenario.

### 2025-07-19 - Model Limits Test Refactoring

**Files Modified:**

- `packages/shared/src/constants/__tests__/model-limits.test.ts`

**Changes Made:**

1. **Reduced test data repetition** by extracting common test data into constants (`MODEL_LIMITS`) and test fixtures (`TEST_MODELS`)
2. **Improved test organization** by grouping related tests using nested describes (by model family)
3. **Enhanced test readability** with:
   - More descriptive test names that include context
   - Table-driven tests using `forEach` for similar scenarios
   - Clear comments explaining test intent
4. **Added edge case coverage** including empty string model names and negative percentages
5. **Improved type safety** with const assertions on test data
6. **Better test structure** separating normal cases from edge cases

**Rationale:**
The test file was functional but had significant repetition and could be better organized. The refactoring makes tests easier to maintain, understand, and extend without changing any test logic or coverage.

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

### 2025-07-19 - Migration 001 Assessment and Documentation Update

**Files Modified:**

- Updated: `GROOMING.md` - Added migration immutability guidelines

**Changes Made:**

1. **Assessed Migration 001 for Grooming**
   - Identified inconsistencies with newer migrations (missing dotenv, error handling, formatting)
   - Consulted AI models (Gemini-2.5-pro) about refactoring approach
   - Received strong guidance about migration immutability principle

2. **Updated GROOMING.md Documentation**
   - Added warning in Database & Migrations checklist about not modifying executed migrations
   - Created new "Migration Best Practices" section explaining immutability principle
   - Documented what not to do and what to do instead for migration quality

**Analysis Findings:**

- Migration 001 has been executed in production (documented in multiple places)
- Modifying executed migrations violates database migration best practices
- Risk of breaking database reproducibility outweighs code quality benefits
- Industry consensus strongly supports treating executed migrations as immutable

**Validation:**

- Gemini-2.5-pro: 9/10 confidence score against modifying executed migrations
- Principle of migration immutability is a foundational best practice
- Confirmed as correct approach for maintaining reliable database schema evolution

**Rationale:**

While the migration file could benefit from code quality improvements, the principle of migration immutability takes precedence. Executed migrations form a historical record that ensures database state can be reliably reproduced. The best action is to document this principle for future grooming efforts and apply quality standards only to new migrations going forward.

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

- All other files in `prompts/` directory are YAML files:
  - code-review.yaml: Structured code review prompt with severity levels and actionable feedback
  - test-generator.yaml: Test case generation prompt with framework support
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

### 2025-07-19 - Misleading Credentials Unit Test Cleanup

**Files Modified:**

- Removed: `tests/unit/credentials.test.ts`

**Changes Made:**

1. **Removed Misleading Test File**
   - Deleted test file that only tested mock implementations, not actual code
   - Tests were using `require('fs').readFileSync` directly instead of importing from credentials module
   - No functions from `services/proxy/src/credentials.ts` were being tested
   - Critical functions like `refreshToken`, `getApiKey`, `validateCredentialMapping` had zero coverage

**Analysis Findings:**

- The test file existed in the correct location (`tests/unit/`)
- However, it provided false confidence without actual test coverage
- Tests were essentially testing Node.js fs module behavior, not our credentials logic
- No other unit tests exist for the credentials module
- Integration tests handle credential functionality at a higher level

**Validation:**

- Gemini-2.5-flash: 9/10 confidence score, strongly endorsed deletion
- Emphasized that misleading tests are worse than no tests (industry best practice)
- Highlighted critical need for proper unit tests as follow-up task

**Rationale:**

Mock tests that don't test actual functionality are anti-patterns that provide false confidence and can hide real bugs. Deleting this file makes the lack of test coverage explicit, which is preferable to maintaining misleading tests. The deletion is a pragmatic short-term fix that removes a negative element while clearly highlighting the need for proper unit tests for this security-critical module.

**Critical Follow-up Required:**

The credentials module handles sensitive authentication functionality and currently has zero unit test coverage. Creating proper unit tests for `credentials.ts` must be prioritized as a high-priority technical debt item.

### 2025-07-19 - Subtask Detection Test Refactoring

**Files Modified:**

- `packages/shared/src/utils/__tests__/subtask-detection.test.ts`

**Changes Made:**

1. **Extracted Mock Factory Functions**
   - Created `createMockLogger()`, `createMockQueryExecutor()`, etc. to eliminate duplication
   - Centralized mock creation logic with type-safe factory functions
   - Reduced code duplication by ~50 lines

2. **Improved Test Organization**
   - Combined JSON fixture tests into main describe block
   - Added nested describe blocks for better test organization
   - Grouped related tests under "Unit Tests > Basic Subtask Detection"

3. **Enhanced Type Safety**
   - Added explicit `MockLogger` type definition
   - Used typed factory functions with proper return types
   - Added const `DEFAULT_PARENT_REQUEST` for test data consistency

4. **Simplified Mock Setup**
   - Replaced verbose inline mock setup with clean `createLinker()` function
   - Moved mock data to module scope for better encapsulation
   - Removed redundant comments that stated the obvious

5. **Removed Dead Code**
   - Removed skip logic for non-existent `04-second-subtask.json` file
   - Cleaned up unnecessary filtering in JSON file tests

**Analysis Findings:**

- Original file had significant code duplication between two describe blocks
- Mock setup was repeated multiple times with identical logic
- JSON fixture tests were artificially separated causing redundant setup
- Test organization made it harder to understand test relationships

**Validation:**

- Gemini-2.5-flash: 9/10 confidence score, strongly endorsed refactoring plan
- O3-mini: 9/10 confidence score, suggested considering parameterized tests
- Both models confirmed alignment with DRY principle and testing best practices

**Rationale:**

The refactoring reduces technical debt, improves maintainability, and makes tests easier to understand and extend. By consolidating test setup and improving organization, future developers can more easily add new test cases and understand the test suite structure. The changes follow industry best practices for unit testing while maintaining 100% test compatibility.

### 2025-07-19 - Integration Test Anti-pattern Cleanup

**Files Modified:**

- Removed: `tests/integration/proxy-auth.test.ts`

**Changes Made:**

1. **Removed Test Anti-pattern File**
   - Deleted integration test that created a mock proxy server duplicating real authentication logic
   - The test was testing its own mock implementation instead of the actual proxy
   - Comprehensive unit tests already exist at `services/proxy/tests/client-auth.test.ts`

**Analysis Findings:**

- The test created a complete mock proxy server with hardcoded authentication logic
- This duplicated the real implementation, violating DRY principle
- Changes to actual auth logic wouldn't be tested by this integration test
- Unit tests for the actual middleware provide proper test coverage
- File used `any` types reducing type safety

**Validation:**

- Gemini-2.5-pro: 9/10 confidence score for deletion
- Confirmed as textbook testing anti-pattern
- Recommendation to follow Testing Pyramid principle

**Rationale:**

Testing a mock that duplicates production logic provides negative value by creating false confidence and maintenance burden. The existing unit tests properly validate the authentication middleware logic in isolation. For true end-to-end testing, integration tests should use the real proxy server, not a mock. This deletion corrects a fundamental testing anti-pattern and improves the overall test architecture.

### 2025-07-19 - Prettier Configuration Cleanup

**Files Modified:**

- `.prettierrc.json`

**Changes Made:**

1. **Removed Redundant JSON Override Settings**
   - Removed `"semi": false` from JSON override (redundant with root setting)
   - Removed `"singleQuote": false` from JSON override (matches Prettier's default for JSON)
   - Kept only `"trailingComma": "none"` which is necessary for JSON compatibility

**Analysis Findings:**

- Best practices research confirmed keeping explicit settings even if they match defaults
- This provides stability across Prettier version upgrades and serves as documentation
- JSON files in JavaScript ignore the `singleQuote` setting by design
- The remaining overrides (JSON trailing comma, Markdown prose wrap) are intentional deviations

**Validation:**

- Gemini-2.5-pro: Endorsed keeping explicit root settings for stability
- O3-mini: Confirmed current Prettier defaults and recommended explicit configuration
- Prettier format check passes with updated configuration

**Rationale:**

The cleanup removes unnecessary redundancy in the JSON override section while maintaining explicit root settings for clarity and version stability. This follows the principle of being explicit about style choices in shared projects, especially monorepos, while eliminating genuinely redundant configuration that adds no value.

### 2025-07-19 - Conversation Linking Test Fixture Cleanup

**Files Modified:**

- `packages/shared/src/utils/__tests__/fixtures/conversation-linking/08-weird-review.json` → `08-tool-response-linking.json`

**Changes Made:**

1. **Renamed File for Clarity**
   - Changed from `08-weird-review.json` to `08-tool-response-linking.json`
   - New name clearly describes what the test case validates

2. **Improved Test Description**
   - Updated from generic "Test linking between [ID1] and [ID2]"
   - New description: "Test conversation linking with TodoWrite tool response in parent - verifies that tool invocations in responses don't affect conversation continuity"

3. **Simplified Fixture Data**
   - Removed verbose system prompts containing unrelated project information
   - Simplified system prompt to: "You are Claude Code, Anthropic's official CLI for Claude. You help with software engineering tasks."
   - Removed system reminder content blocks that were irrelevant to testing
   - Kept only essential TodoWrite tool invocation in response to test the specific scenario

4. **Maintained Test Integrity**
   - Preserved all necessary fields for conversation linking (hashes, IDs, etc.)
   - Tests continue to pass after refactoring
   - File size reduced from ~36KB to ~4KB

**Analysis Findings:**

- Fixture was testing that TodoWrite tool invocations in parent responses don't break conversation linking
- Original data contained unrelated Rust SDK upgrade content from a different project
- The verbose system prompts were unnecessary for testing conversation linking logic

**Validation:**

- Gemini-2.5-flash: Recommended focusing on minimal viable data for test fixtures
- O3-mini: Suggested investigating the "weird" naming convention and endorsed cleanup
- All conversation linker tests pass after changes

**Rationale:**

Test fixtures should contain the minimum necessary data to validate their specific scenario. The original fixture was bloated with irrelevant project data that obscured the test's purpose. The cleanup improves test maintainability, readability, and clearly communicates what aspect of conversation linking is being tested.

### 2025-07-19 - Dangerous Reset Script Removal

**Files Deleted:**

- `scripts/reset-stuck-analysis-jobs.ts`

**Changes Made:**

1. **Deleted Dangerous Script**
   - Removed script that reset retry_count to 0 for stuck analysis jobs
   - This approach violates the "fail fast" principle and could cause infinite retry loops
   - No transaction support, confirmation prompts, or dry-run mode
   - The better alternative `fail-exceeded-retry-jobs.ts` already exists

2. **Updated Documentation**
   - Removed references from package.json (npm script)
   - Updated CLAUDE.md to remove the script reference
   - Updated GROOMING.md to remove the example command

**Rationale:**

The script implemented a dangerous anti-pattern by resetting retry counters, which could:

- Hide underlying systemic issues
- Lead to resource exhaustion through infinite loops
- Violate resilient system design principles

The existing `fail-exceeded-retry-jobs.ts` script properly handles stuck jobs by failing them, which is the industry-standard approach for jobs that repeatedly fail after exhausting retries.

**Validation:**

- Gemini-2.5-pro: 10/10 confidence score for deletion
- Confirmed alignment with "fail fast" principle
- Type checking and all tests pass after deletion

### 2025-07-19 - Conversation Analysis Script Refactoring

**Files Modified:**

- `scripts/db/analyze-conversations.ts`

**Changes Made:**

1. **Replaced Memory-Intensive Approach with Batch Processing**
   - Changed from loading all requests into memory to processing in configurable batches (default 10K)
   - Added streaming capabilities to handle databases of any size without OOM issues
   - Implemented progress tracking during batch processing

2. **Eliminated Code Duplication**
   - Removed custom conversation linking logic that duplicated production code
   - Now uses the production `ConversationLinker` from `packages/shared`
   - Ensures consistency with actual conversation tracking behavior

3. **Improved Type Safety**
   - Fixed all TypeScript type issues
   - Replaced `any` types with proper interfaces
   - Added complete type definitions for all data structures

4. **Added Configuration Options**
   - `--batch-size <number>`: Control memory usage for large databases
   - `--format <json|console>`: Choose output format
   - `--help`: Show usage information
   - Made the script more flexible for different use cases

5. **Enhanced Code Quality**
   - Extracted magic numbers into named constants
   - Simplified complex nested logic
   - Added proper error handling
   - Improved code organization and readability

**Rationale:**

The original script was functional but had significant technical debt:

- Would crash on large databases due to loading all data into memory
- Duplicated conversation tracking logic that could diverge from production
- Poor type safety with `any` types
- No configuration options for different use cases

The refactoring was validated by AI models (Gemini-2.5-pro and O3-mini) who confirmed that reusing production utilities was the correct approach. This ensures the analysis script accurately reflects what the production system does while handling databases of any size efficiently.

**Technical Notes:**

- The script maintains backward compatibility with existing npm scripts
- Import paths use `.js` extensions per TypeScript ESM conventions
- Batch processing prevents memory issues on large production databases
- JSON output format enables integration with other tools

### 2025-07-19 - System Prompts Extract Script Cleanup

**Files Deleted:**

- `scripts/db/extract-system-prompts.ts`

**Changes Made:**

1. **Deleted One-Time Debugging Script**
   - Removed script with hardcoded request IDs (b5068a6b-ccfb-465b-a524-6dfb7f5233fb, d83ea021-04f2-4ab1-9344-68a454e5a0f2)
   - Script was created for specific debugging session in commit ba4c90d
   - Not referenced anywhere in the codebase
   - Functionality now covered by `analyze-request-linking.ts`

**Rationale:**

The script was a one-time debugging utility created to investigate conversation hash stability issues. According to repository best practices:

- One-time debugging scripts should not be kept in the codebase
- Hardcoded values specific to a debugging session add clutter
- The more comprehensive `analyze-request-linking.ts` provides the same functionality with CLI arguments
- Git history preserves the script for reference if needed

**Validation:**

- Gemini-2.5-pro: 10/10 confidence score, identified as "textbook example of technical debt"
- Confirmed deletion aligns with industry standards for code maintenance
- No functionality loss as better tooling exists

### 2025-07-19 - Database Timestamp Verification Script to Test Transformation

**Files Modified:**

- Deleted: `scripts/db/verify-timestamp-types.ts`
- Created: `packages/shared/src/db/__tests__/schema-validation.test.ts`

**Changes Made:**

1. **Transformed One-Time Verification Script to Automated Test**
   - Converted the verification logic into a proper test suite
   - Moved from scripts directory to shared package test structure
   - Added comprehensive test coverage for all tables with timestamp columns
   - Included specific column existence tests for core tables

2. **Improved Test Structure**
   - Added proper test setup/teardown with database connection handling
   - Gracefully skips tests when DATABASE_URL is not set (e.g., in CI without DB)
   - Better error messages with specific column violations
   - Added test for expected timestamp columns in core tables

3. **Enhanced Code Quality**
   - Uses Bun's test framework for consistency
   - Proper async/await handling
   - Clear test descriptions
   - Improved type safety

**Rationale:**

Following the grooming guideline that "scripts generated to verify features should be removed or transformed to test if really needed", this transformation provides long-term value:

- Acts as an "architectural fitness function" preventing regression
- Ensures all future schema changes maintain TIMESTAMPTZ standard
- Prevents timezone-related bugs in production
- Aligns with industry best practices for production systems

**Validation:**

- Gemini-2.5-pro: 9/10 confidence score, strongly recommended transformation over deletion
- Emphasized that automated tests are crucial for maintaining architectural constraints
- Test passes successfully with current database schema

### 2025-07-19 - Migration 003 Assessment - Applying Migration Immutability Principle

**Files Assessed:**

- `scripts/db/migrations/003-add-subtask-tracking.ts` (NO CHANGES MADE)

**Analysis Findings:**

1. **Migration Purpose**: Adds subtask tracking columns and retroactively processes existing Task tool invocations
2. **Code Quality Issues Identified**:
   - Missing dotenv configuration loading (present in newer migrations)
   - Basic error handling without specific error types
   - No dry-run mode support
   - Lacks rollback functionality
   - TODO comment on line 207 about handling multiple subtasks per parent
   - Complex nested queries that could be simplified

3. **Migration Immutability Applied**:
   - File is documented in migrations README.md as executed
   - Following GROOMING.md guidelines: "DO NOT modify migration files that have been executed in production"
   - Modifying would break database reproducibility across environments

**Validation:**

- Gemini-2.5-pro: 10/10 confidence - "Never modify executed migrations"
- O3-mini: 10/10 confidence - "Preserve historical integrity"
- Both models unanimously recommended Option C: Create new migrations for any fixes

**Action Taken:**

- **NO MODIFICATIONS** made to the migration file per immutability principle
- Documented assessment in GROOMING.md for future reference
- TODO on line 207 remains for potential future migration if functionality is needed

**Rationale:**

While the migration has code quality issues compared to newer standards, the principle of migration immutability takes precedence. Executed migrations form a historical record that ensures database state can be reliably reproduced. The industry consensus is that modifying executed migrations is a critical anti-pattern that introduces unacceptable risk of database inconsistencies.

**Future Guidance:**

- Apply improved standards (dotenv, rollback, dry-run) to NEW migrations only
- If the TODO functionality is needed, create a new migration (e.g., 013-complete-subtask-linking.ts)
- Consider creating a migration template with current best practices

### 2025-07-19 - Storage Behavior Test Script Cleanup

**Files Deleted:**

- `scripts/dev/test/test-storage-behavior.sh`

**Changes Made:**

1. **Removed Redundant Test Script**
   - Deleted manual verification script that tested storage behavior based on system message count
   - Core logic (system message counting) is already comprehensively unit tested in `request-type-identification.test.ts`
   - Storage skipping for query_evaluation requests is already implemented and tested
   - Script had no error handling, hardcoded values, and didn't validate results

**Analysis Findings:**

- The script tested whether requests with different system message counts were stored in the database
- Requests with ≤1 system messages are classified as `query_evaluation` and skipped from storage
- Comprehensive unit tests already cover all edge cases of system message counting
- No integration test framework exists for this specific behavior

**Validation:**

- Gemini-2.5-pro: 9/10 confidence for transformation to integration test
- O3-mini: 8/10 confidence for deletion to reduce maintenance burden
- Unit tests continue to pass after deletion (15/15 tests passing)
- Type checking passes without issues

**Rationale:**

Following GROOMING.md guidelines that "scripts generated to verify features should be removed or transformed to test if really needed", the script was deleted rather than transformed. The behavior is already well-tested at the unit level, and creating integration test infrastructure for this single edge case would add unnecessary complexity. This aligns with the project's grooming history where similar verification scripts were removed to reduce technical debt.

### 2025-07-19 - Redundant Manual Subtask Test Script Cleanup

**Files Deleted:**

- `scripts/create-fresh-task-and-test.ts`

**Changes Made:**

1. **Removed Redundant Manual Test Script**
   - Deleted script that manually tested subtask linking functionality
   - Functionality already covered by existing unit tests (`subtask-database.test.ts`, `subtask-detection.test.ts`)
   - Script created/deleted test data directly in database, posing risk if used on wrong environment
   - Not referenced anywhere in codebase or integrated into test suite

**Analysis Findings:**

- Script tested parent-child linking between Task invocations and subtask requests
- Created test data with hardcoded values and direct database manipulation
- Existing test coverage includes 25 passing tests for subtask functionality
- Script appeared to be a one-off debugging/verification tool

**Validation:**

- Gemini-2.5-flash: Encountered error but analysis proceeded
- O3-mini: 9/10 confidence for deletion, citing redundancy and database manipulation risks
- All subtask tests continue to pass after deletion
- Type checking passes without issues

**Rationale:**

Manual test scripts that duplicate existing automated test coverage and directly manipulate database state are anti-patterns that increase maintenance burden and create potential risks. The comprehensive unit test suite already validates the subtask linking functionality in a safe, repeatable manner. Deletion aligns with modern testing best practices favoring automated tests over ad-hoc manual scripts.

### 2025-07-19 - AI Analysis Prompts Test Script Removal

**Files Deleted:**

- `scripts/test-ai-analysis-prompts.ts`

**Changes Made:**

1. **Removed Redundant Manual Test Script**
   - Deleted manual test script for AI analysis prompt functionality
   - All functionality already covered by unit tests in `packages/shared/src/prompts/__tests__/analysis.test.ts`
   - Test script was not referenced anywhere in the codebase
   - Manual scripts in scripts folder violate project testing structure

**Analysis Findings:**

- Script tested truncation, token counting, prompt assembly, and response parsing
- Comprehensive unit tests exist with 15 passing tests covering all scenarios
- Manual test scripts create maintenance overhead with duplicate test logic
- Proper tests are integrated with test runner and CI/CD pipeline

**Validation:**

- Gemini-2.5-pro: High confidence in deletion decision
- O3-mini: 10/10 confidence, confirmed redundancy and project structure alignment
- All related unit tests pass after deletion
- Type checking completes successfully

**Rationale:**

The file represented complete redundancy with existing comprehensive unit tests. Manual test scripts in the scripts folder violate the project's testing structure and create maintenance overhead. The deletion simplifies the codebase while maintaining full test coverage through the proper test suite. This aligns with best practices of maintaining a single source of truth for test logic.

### 2025-01-19 - Script Refactoring Notes Consolidation

**Files Modified:**

- Merged: `scripts/REFACTORING_NOTES.md` content into `GROOMING.md`
- Deleted: `scripts/REFACTORING_NOTES.md`

**Changes Made:**

1. **Consolidated Documentation**
   - Moved unique refactoring documentation from misplaced `scripts/REFACTORING_NOTES.md` into the Grooming Log
   - Preserved valuable refactoring examples for `fail-exceeded-retry-jobs.ts` and `copy-conversation.ts`
   - Deleted the misplaced file to maintain single source of truth for grooming documentation

**Validation:**

- Gemini-2.5-flash: 9/10 confidence score for Option 1 (merge and delete)
- O3-mini: 9/10 confidence score for Option 1
- Both models emphasized industry best practices for documentation consolidation

**Rationale:**

Following the consensus of both AI models, consolidating refactoring notes into GROOMING.md:

- Reinforces single source of truth principle
- Reduces documentation fragmentation and maintenance burden
- Improves discoverability of grooming-related information
- Aligns with established project documentation patterns

The detailed refactoring examples below demonstrate the project's commitment to continuous code improvement.

### 2025-01-19 - fail-exceeded-retry-jobs.ts Refactoring

**Summary:**

Refactored the `fail-exceeded-retry-jobs.ts` script to align with project standards and improve safety/usability.

**Changes Made:**

1. **Added TypeScript Type Safety**
   - Imported `ConversationAnalysisJob` type from the AI worker
   - Used `ConversationAnalysisStatus` enum from shared types
   - Added proper typing for Pool, PoolClient, and query results
   - Created `FailureError` interface for consistent error structure

2. **Implemented CLI Arguments**
   - Added `--dry-run` flag to preview changes without database updates
   - Added `--force` flag to skip confirmation prompt (useful for automation)
   - Simple argument parsing using `process.argv`

3. **Enhanced Error Handling**
   - Added DATABASE_URL validation with proper exit code
   - Proper exit codes: 0 for success, 1 for errors
   - Comprehensive error handling with transaction rollback
   - Top-level catch handler for unhandled errors

4. **Added Transaction Support**
   - All database operations wrapped in a transaction
   - Automatic rollback on errors
   - Ensures atomicity of batch updates

5. **Improved Logging**
   - Added script header with timestamp and configuration
   - Clear visual separation with Unicode box characters
   - Detailed job information display
   - Progress indicators and success/error messages

6. **Better Code Organization**
   - Extracted helper functions: `getExceededJobs()` and `failJobs()`
   - Clear separation of concerns
   - Constants defined at the top
   - Consistent error message schema

7. **Standardized Error Storage**
   - Stores errors as JSON strings (matching TEXT column type)
   - Includes metadata: script name, timestamp, retry counts
   - Consistent with AI worker error handling patterns

**Refactoring Rationale:**

- **Safety**: Dry-run mode prevents accidental data loss
- **Automation**: Force flag enables CI/CD integration
- **Reliability**: Transactions ensure data consistency
- **Maintainability**: TypeScript types catch errors at compile time
- **Consistency**: Follows patterns from other maintenance scripts

**Future Considerations:**

As suggested by Gemini's analysis, the long-term goal should be to integrate this logic directly into the AI worker to automatically fail jobs that exceed retry limits, making this script a fallback for edge cases only.

### 2025-01-19 - Conversation Copy Script Refactoring

**Overview:**

This section outlines the refactoring applied to the `copy-conversation.ts` script to improve code quality, maintainability, and type safety.

**Key Improvements:**

**1. Decomposed Main Function**

Before: 120-line main() function handling everything
After: Main function reduced to ~40 lines with clear, focused steps:

- `parseCliArguments()`
- `validateEnvironment()`
- `createDatabaseClients()`
- `connectDatabases()`
- `startTransactions()`
- `validateTables()`
- `analyzeTableStructures()`
- `getConversationRequests()`
- `executeInDryRunMode()` or `executeCopy()`
- `commitTransactions()` or `rollbackTransactions()`
- `closeDatabaseConnections()`

**2. Type Safety**

Before: Using `any` types

```typescript
async function tableExists(client: any, tableName: string): Promise<boolean>
```

After: Proper TypeScript interfaces

```typescript
interface Config {
  conversationId: string
  sourceTable: string
  destTable: string
  destDbUrl: string
  dryRun: boolean
  includeChunks: boolean
  verbose: boolean
}

interface ApiRequest {
  request_id: string
  conversation_id: string
  timestamp: Date
  model?: string
  domain?: string
  [key: string]: any
}
```

**3. Extracted Constants**

Before: Magic strings and numbers scattered throughout

```typescript
if (error.code === '42P01') {
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
```

After: Named constants

```typescript
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ERROR_CODES = {
  UNDEFINED_TABLE: '42P01',
  UNDEFINED_COLUMN: '42703',
} as const

const QUERIES = {
  TABLE_EXISTS: `...`,
  GET_COLUMNS: `...`,
  // etc.
} as const
```

**4. Improved Error Handling**

Before: Duplicate error handling patterns
After: Centralized in focused functions with consistent patterns

**5. Better Organization**

The refactored version is organized into clear sections:

- Type Definitions
- Constants
- CLI Handling
- Environment Validation
- Database Operations
- Validation Functions
- Data Operations
- Execution Functions
- Main Function

**6. Separation of Concerns**

Each function now has a single, clear responsibility:

- `validateEnvironment()` - Only checks DATABASE_URL
- `connectDatabases()` - Only establishes connections
- `validateTables()` - Only checks table existence
- `analyzeTableStructures()` - Only compares columns
- `executeCopy()` - Only performs the copy operation

**Benefits:**

1. **Testability**: Each function can be tested independently
2. **Maintainability**: Changes are localized to specific functions
3. **Readability**: Clear function names express intent
4. **Type Safety**: Compile-time error checking
5. **Reusability**: Functions can be extracted to modules

**Next Steps for Production Use:**

1. Split into multiple files (cli.ts, database.ts, types.ts, etc.)
2. Add unit tests for each function
3. Implement proper logging instead of console.log
4. Add progress indicators for large copies
5. Implement batch processing for better performance

### 2025-01-19 - generate-conversation-test-fixture.ts Refactoring

**Summary:**

This script was refactored as part of the file grooming sprint to improve code quality, maintainability, and developer experience.

**Key Improvements:**

1. **Type Safety with Zod Validation**
   - Added Zod schema validation for database query results
   - Ensures data structure integrity before processing
   - Provides clear error messages for invalid data

2. **Configuration via Environment Variables**
   - Added `TEST_FIXTURE_DIR` environment variable support
   - Allows customization of output directory without code changes
   - Maintains backward compatibility with default location

3. **Enhanced Command Line Interface**
   - Added `--dry-run` flag for previewing fixtures without writing
   - Added `--verbose` flag for detailed output
   - Added `--quiet` flag for minimal output
   - Improved help message with clear examples

4. **Code Quality Improvements**
   - Removed commented-out imports
   - Extracted magic strings into named constants
   - Added structured logging with levels (info, error, verbose)
   - Improved error handling with specific error types and messages

5. **Documentation**
   - Updated scripts/README.md with comprehensive usage guide
   - Added environment variable documentation
   - Included npm script usage example

**Technical Details:**

- **Dependencies**: Uses existing Zod from packages/shared
- **Backward Compatibility**: All existing functionality preserved
- **Performance**: No performance impact; validation adds minimal overhead
- **Security**: Maintains existing data sanitization

**Benefits:**

- **Developer Experience**: Better CLI with preview mode and output control
- **Reliability**: Type validation prevents runtime errors from schema changes
- **Flexibility**: Environment-based configuration for different environments
- **Maintainability**: Cleaner code with constants and better organization

**Future Considerations:**

- Could add JSON schema export for fixture validation in tests
- Could add batch processing for multiple fixture generation
- Could add fixture comparison/diff functionality

**Validation:**

The refactoring plan was validated with Gemini 2.5 Pro, which gave it a 10/10 confidence score, calling it "a textbook example of valuable refactoring effort."

### 2025-01-19 - Playwright Configuration TypeScript Improvements

**Files Modified:**

- `playwright.config.ts`

**Changes Made:**

1. **Added Type Safety**
   - Added explicit `PlaywrightTestConfig` type import and annotation
   - Ensures configuration follows Playwright's type contract

2. **Extracted Magic Numbers**
   - Created named constants: `DASHBOARD_PORT`, `DEFAULT_DASHBOARD_URL`, `DEV_SERVER_TIMEOUT_MS`
   - Improved readability and maintainability

3. **Added Environment Variable Support**
   - Added `PLAYWRIGHT_BASE_URL` environment variable support for flexible test targeting
   - Maintains default to localhost:3001 for backward compatibility

4. **Removed Unused Mobile Configurations**
   - Deleted Mobile Chrome and Mobile Safari projects
   - E2E tests only test desktop functionality, reducing unnecessary test matrix

5. **Improved Documentation**
   - Enhanced comments explaining environment variables and their effects
   - Better section organization with clear headers
   - Added runtime validation message for CI environments

6. **Fixed Playwright Configuration**
   - Removed conflicting `url` property in webServer (kept only `port` as required)
   - Ensures compatibility with Playwright's webServer requirements

**Rationale:**

The refactoring improves the configuration's robustness, flexibility, and maintainability while removing unused complexity. Environment variable support enables running tests against different environments without code changes, which is essential for CI/CD pipelines.

**Validation:**

- Gemini-2.5-pro: 10/10 confidence score, strongly endorsed all improvements
- Suggested using dotenv for local environment management (future consideration)
- TypeScript compilation passes without errors
- Configuration follows Playwright best practices

### .husky Directory (2025-01-19)

**Changes Made:**

1. **Re-initialized Husky Setup**
   - Removed and reinstalled Husky to ensure clean v9 configuration
   - Eliminated legacy artifacts and deprecated husky.sh warnings
   - Fixed file permissions (pre-commit hook now properly executable)

2. **Maintained Minimal Hook Configuration**
   - Kept single pre-commit hook running `bunx lint-staged`
   - Preserved existing lint-staged configuration for ESLint and Prettier
   - No additional hooks added (following project's performance-first approach)

3. **Fixed Permission Issues**
   - Pre-commit hook changed from 644 to 755 (executable)
   - Ensures consistent behavior across different environments

**Rationale:**

The .husky directory had accumulated legacy artifacts from an older installation, including a deprecation warning about v10 that was misleading. Re-initialization provides a clean, modern Husky v9 setup that will work reliably for all team members. The minimal hook configuration aligns with the project's documented approach of keeping pre-commit checks fast by excluding TypeScript compilation.

**Validation:**

- Tested pre-commit hook execution successfully
- Verified lint-staged runs correctly on staged files
- Confirmed with Gemini-2.5-pro and O3-mini that re-initialization was the correct approach
- No functionality changes, only cleanup and permission fixes

### 2025-07-19 - JSON Viewer Test Files Cleanup

**Files Deleted:**

- `test-arrow-size.html`
- `test-collapse-fix.html`
- `test-inspect-arrows.html`

**Rationale:**

1. **Manual Test Artifacts** - These were temporary HTML files for manually testing JSON viewer component styling
2. **Root Directory Pollution** - Test files don't belong at the project root
3. **Not Part of Test Suite** - These files weren't referenced by any automated tests or other code
4. **Technical Debt** - Manual test files should not be committed to version control

**Consensus Decision:**

Gemini 2.5 Pro strongly validated the deletion with 10/10 confidence, citing:

- Alignment with software engineering best practices
- Improved repository hygiene and reduced cognitive load
- Proper approach is automated testing (visual regression/snapshot tests)
- Sets positive precedent for code quality standards

**Impact:**

- No impact on functionality - the dashboard uses the same JSON viewer library but with its own configuration
- Cleaner repository structure
- Encourages development of proper automated tests for UI components

### 2025-07-20 - Claude API Types Consolidation

**Files Modified:**

- Deleted: `services/proxy/src/types/claude.ts`
- Created: `packages/shared/src/types/conversation.ts`
- Updated: Multiple proxy service files to use shared types
- Updated: `packages/shared/src/types/claude.ts` (added missing fields)
- Updated: `packages/shared/src/types/index.ts` (exported conversation types)

**Changes Made:**

1. **Eliminated Type Duplication**
   - Removed duplicate Claude API type definitions from proxy service
   - All services now use types from `@claude-nexus/shared` package
   - Ensures consistency across the monorepo

2. **Created Dedicated Conversation Types**
   - Moved `ConversationData` interface to new `conversation.ts` file
   - Added comprehensive JSDoc documentation
   - Removed duplicate definition from `MetricsService.ts`

3. **Updated Shared Types**
   - Added `thinking` field to `ClaudeMessagesRequest`
   - Added cache token fields to `ClaudeUsage` interface
   - Ensures shared types are complete and up-to-date

4. **Fixed All Import Paths**
   - Updated 7 files to import from `@claude-nexus/shared`
   - Consistent import pattern across the proxy service

**Rationale:**

This refactoring addresses a critical anti-pattern in the monorepo where types were duplicated between packages. Following DRY principle and monorepo best practices:

- Single source of truth for all Claude API types
- Prevents type drift between services
- Improves maintainability and reduces bugs
- Aligns with TypeScript project reference architecture (ADR-013)

**Validation:**

- Gemini-2.5-pro: 10/10 confidence score - "textbook example of valuable refactoring"
- Build and type checking pass successfully
- No functionality changes, only improved code organization

### 2025-07-20 - Build Script Consolidation

**Files Modified:**

- Deleted: `services/proxy/scripts/build-bun.ts`
- Deleted: `services/proxy/scripts/build-bun.js`
- Updated: `services/proxy/package.json` - Changed build script to use build-production.ts

**Changes Made:**

1. **Removed Redundant Build Scripts**
   - Deleted `build-bun.ts` and its compiled `.js` version
   - These scripts provided a simple build without production optimizations
   - The `build-production.ts` script already handles all build cases with better features

2. **Updated package.json**
   - Changed `"build"` script from `build-bun.ts` to `build-production.ts`
   - Ensures all builds are production-ready with optimizations

**Rationale:**

Following the DRY principle and reducing technical debt:

- Single source of truth for build process
- Ensures consistent production-ready builds
- Eliminates confusion about which build script to use
- The production script includes source maps, external dependencies, and proper entry points

**Validation:**

- Gemini-2.5-pro: 9/10 confidence score for consolidation
- Build tested successfully with `bun run build`
- No functionality lost, only improved consistency

### 2025-07-20 - Spark Utilities Type Safety and Code Quality Improvements

**Files Modified:**

- Refactored: `services/dashboard/src/utils/spark.ts`

**Changes Made:**

1. **Improved Type Safety**
   - Replaced all `any` types with proper TypeScript interfaces
   - Created specific types for `ToolUseContent`, `ToolResultContent`, `TextContent`
   - Added type guards (`isValidSparkApiResponse`, `isValidToolUseContent`) for runtime validation
   - Used `unknown` instead of `any` for better type checking

2. **Extracted Constants**
   - Created `SPARK_TOOL_NAME` constant for 'mcp**spark**get_recommendation'
   - Created `NONE_VALUE` constant for 'None' string
   - Eliminated all magic strings from the code

3. **Enhanced Error Handling**
   - Added structured logging with console.warn for specific failure cases
   - Improved error messages to indicate what validation failed
   - Maintained backward compatibility by returning null on errors

4. **Added Comprehensive Documentation**
   - Added JSDoc comments for all functions with parameter and return type descriptions
   - Added module-level documentation
   - Documented all interfaces with clear field descriptions

5. **Code Organization Improvements**
   - Added helper functions for type validation
   - Improved function organization with clear separation of concerns
   - Simplified complex array operations in `extractSparkSessionIds`
   - Used Set for unique URL collection in `getRecommendationSources`

6. **Performance Optimizations**
   - Optimized `extractSparkSessionIds` to avoid duplicate session IDs
   - Improved regex handling in source extraction

**Rationale:**

The spark.ts file is actively used by multiple dashboard components for handling Spark AI recommendations. The refactoring addresses critical technical debt:

- Type safety prevents runtime errors in production
- Proper error handling improves debugging
- Documentation helps future developers understand the code
- Backward compatibility ensures no breaking changes

**Validation:**

- Gemini-2.5-pro: 9/10 confidence score - "Essential for production readiness"
- Build and type checking pass successfully
- Dashboard service starts without errors
- Maintained 100% backward compatibility with existing code

- **Comprehensive refactoring of services/dashboard/README.md**: Achieved consistency with proxy service documentation
  - Expanded from minimal 76 lines to comprehensive 350+ lines matching proxy README structure
  - Added detailed architecture section explaining dependency injection and service patterns
  - Added comprehensive feature lists covering all actual functionality
  - Added Docker deployment instructions with examples
  - Added testing section with unit and integration test guidance
  - Added troubleshooting section for common issues
  - Added performance optimization guidance
  - Updated all API endpoints with examples and proper authentication headers
  - Removed outdated information and aligned with CLAUDE.md
  - Added cross-references to related documentation
  - Validated refactoring plan with Gemini-2.5-pro (10/10 confidence score)
  - Rationale: Critical for production readiness and developer onboarding - addresses major inconsistency between service documentation

### 2025-07-21 - Changelog Refactoring

**File Updated:**

- `docs/06-Reference/changelog.md`

**Changes Made:**

1. **Added Contributor Guidelines**
   - Added comprehensive comment section at the top with clear instructions for maintaining the changelog
   - Included examples of proper changelog entries
   - Added step-by-step release process instructions

2. **Consolidated Unreleased Section**
   - Transformed 30+ granular implementation details into 4 user-focused feature descriptions
   - Grouped AI analysis features into single comprehensive entry with ADR link
   - Removed internal jargon and technical implementation details

3. **Added Breaking Changes Section**
   - Added explicit Breaking Changes section to v2.0.0 for runtime and architecture changes
   - Clarified impact on users upgrading from v1.0.0

4. **Fixed Issues**
   - Removed broken link to non-existent `docs/MIGRATION.md` file
   - Improved consistency in formatting across all versions
   - Enhanced readability with bolded feature names

**Rationale:**

The changelog is a critical user-facing document that was suffering from:

- Implementation detail overload making it hard to understand actual changes
- Missing breaking changes section for major version upgrade
- Broken documentation link
- Lack of contributor guidance

**Validation:**

- Gemini-2.5-pro: Provided comprehensive refactoring example and best practices
- O3-mini: Confirmed approach and suggested additional improvements (Deprecated section, version compare links)
- Maintained Keep a Changelog format compliance
- Enhanced user value while reducing maintenance burden
