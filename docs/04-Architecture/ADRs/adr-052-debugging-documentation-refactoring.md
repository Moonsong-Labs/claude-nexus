# ADR-052: Debugging Documentation Refactoring

## Status

Accepted

## Context

The debugging.md documentation file had become outdated and inconsistent with the current project state:

- Referenced Node.js debugging options despite the project using Bun exclusively
- Missing documentation for SQL query logging features (DEBUG_SQL, SLOW_QUERY_THRESHOLD_MS) added in ADR-014
- Inconsistent code examples mixing JavaScript and TypeScript
- Used `docker compose` commands instead of the project's `docker-up.sh` wrapper
- Lacked documentation for newer features like AI worker debugging and MCP debugging
- Contained theoretical code examples rather than actual project code

This made the documentation confusing for developers and potentially led to debugging errors.

## Decision

We performed a comprehensive refactoring of the debugging.md file to:

1. **Remove all Node.js references** - Replace with Bun-specific debugging approaches
2. **Add SQL query logging section** - Document DEBUG_SQL and SLOW_QUERY_THRESHOLD_MS environment variables
3. **Standardize to TypeScript** - Convert all code examples to TypeScript with proper typing
4. **Update Docker commands** - Use `./docker-up.sh` throughout instead of `docker compose`
5. **Add new debugging sections**:
   - Quick Troubleshooting Checklist (at the top)
   - SQL Query Debugging
   - AI Worker Debugging
   - MCP Server Debugging
   - Common Pitfalls section
6. **Reorganize by task** - Structure content for better scannability (e.g., "Debugging the Proxy", "Debugging the Dashboard")
7. **Use actual project code** - Replace theoretical examples with real code from the project

## Consequences

### Positive

- **Improved developer experience** - Accurate, up-to-date documentation reduces debugging time
- **Reduced onboarding friction** - New contributors have clear, correct guidance
- **Better discoverability** - Task-based organization helps developers find solutions quickly
- **Prevents errors** - Removing incorrect Node.js references prevents confusion
- **Comprehensive coverage** - Includes all current debugging features

### Negative

- None identified - This is a documentation-only change with no runtime impact

## Implementation Notes

The refactoring was validated using Gemini-2.5-pro, which gave it a 9/10 confidence score as a high-impact, low-effort improvement that aligns with industry best practices.

Key changes included:

- Added a "Quick Troubleshooting Checklist" at the beginning for common issues
- Created dedicated sections for each service (Proxy, Dashboard, AI Worker, MCP)
- Included real SQL queries and bash commands used in the project
- Added a "Common Pitfalls" section covering frequent configuration errors
- Updated all internal documentation links
