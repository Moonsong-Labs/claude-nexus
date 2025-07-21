# Agent 2: Quick Fixes & Database Organization

## Overview

You are responsible for quick fixes (ADR numbering), script organization, and database utilities consolidation.

## Working Branch

- Work on: `feature/cleanup-scripts-database`
- Create from: `feature/repository-cleanup`

## Phase 1: Quick Fixes & Script Organization (Days 1-2)

### Task 1: Fix ADR-014 Numbering Conflict

1. Rename `/docs/04-Architecture/ADRs/adr-014-subtask-query-executor-pattern.md` to `adr-019-subtask-query-executor-pattern.md`
2. Update any references to this ADR in documentation or code
3. Commit with message: "fix: resolve ADR-014 numbering conflict"

### Task 2: Organize Scripts

1. Review all script files in service directories
2. Move database-related scripts to `/scripts/db/`
3. Move development utilities to `/scripts/dev/`
4. Move test utilities to `/scripts/test/`
5. Update any references in documentation

### Task 3: Script Cleanup

1. Check for duplicate script functionality
2. Consolidate similar scripts
3. Update script documentation in README files

## Phase 2: Database Utilities Consolidation (Days 3-4)

### Task 4: Create Database Package

1. Create `/packages/database/` directory structure
2. Move common database utilities:
   - Connection management
   - Query builders
   - Common database types
3. Consolidate from:
   - `/services/proxy/src/services/database.ts`
   - `/services/proxy/src/workers/ai-analysis/db.ts`
   - `/scripts/db/` utilities

### Task 5: Standardize Patterns

1. Create consistent query patterns
2. Standardize error handling
3. Add proper TypeScript types
4. Update all imports to use new database package

## Phase 3: Documentation Updates (Day 5)

### Task 6: Update Documentation

1. Update CLAUDE.md with new structure
2. Update relevant README files
3. Document the new database package
4. Create migration guide for developers

## Coordination Points

- Sync with Agent 1 before final merge
- Create separate PRs for each major change
- Test database changes thoroughly

## Success Criteria

- ADR numbering conflict resolved
- All scripts properly organized
- Database utilities consolidated
- Documentation updated
- All tests passing
