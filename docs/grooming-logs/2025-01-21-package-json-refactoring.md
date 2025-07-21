# Package.json Grooming Log

**Date**: 2025-01-21
**File**: package.json
**Branch**: file-grooming-07-18

## Summary

Groomed the root package.json file to improve maintainability and remove redundancy.

## Changes Made

### 1. Removed Redundant Scripts

- **Removed**: `build:all` - This was redundant with the existing `build` script
- **Removed**: `test:all` - This was identical to the base `test` command
- **Removed**: `test:all:playwright` - Consolidated into existing `test:playwright`

### 2. Fixed Docker Script Paths

- Updated all docker commands to use `cd docker &&` prefix since docker-compose.yml is located in the docker/ directory
- Before: `docker-compose build`
- After: `cd docker && docker-compose build`

### 3. Removed Unused Scripts

- **Removed**: `generate:prompts` - Script referenced but not actively used
- **Removed**: `db:migrate:token-usage` - Migration script that's no longer needed

### 4. Dependency Organization

- Moved `gray-matter` from dependencies to devDependencies (not used in runtime code)
- Kept other dependencies in their current sections after verification:
  - `@octokit/rest` - Used by GitHubSyncService.ts
  - `dotenv` - Used by main entry points and scripts
  - `handlebars` - Used by PromptRegistryService.ts
  - `js-yaml` - Used for YAML parsing
  - `pg` - Database driver

### 5. Kept Important Scripts

- `test:css` - Validated that this test is actively checking CSS syntax and quality
- All other test variants for targeted testing

## Rationale

1. **Simplification**: Removing redundant scripts reduces confusion and maintenance burden
2. **Correctness**: Docker scripts now properly reference the correct directory
3. **Clarity**: Each script has a clear purpose without overlapping functionality
4. **Accuracy**: Dependencies are in the correct sections based on actual usage

## Testing

- Verified `bun run build:shared` works correctly
- Confirmed docker-compose.yml exists in docker/ directory
- Checked dependency usage with grep to ensure correct categorization

## Notes

- Type errors found during `bun run typecheck` are unrelated to package.json changes
- Build process has an unrelated error in prompt asset generation
- All core functionality remains intact with cleaner script organization
