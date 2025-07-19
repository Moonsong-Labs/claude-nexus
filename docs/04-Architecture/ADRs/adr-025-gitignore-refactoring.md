# ADR-025: GitIgnore File Refactoring

## Status

Implemented

## Context

The project's `.gitignore` file was based on the standard Node.js gitignore template from GitHub. However, this project uses Bun (not Node.js) and the template included many irrelevant entries for frameworks and tools not used in this project. This created unnecessary clutter and maintenance overhead.

### Problems Identified

1. **Technology Mismatch**: Template was for Node.js but project uses Bun runtime
2. **Missing Entries**: Bun-specific file `bun.lockb` was not included
3. **Excessive Entries**: Included patterns for unused frameworks (Gatsby, Next.js, Nuxt.js, Vuepress, Docusaurus, etc.)
4. **Legacy Tool Entries**: Included patterns for outdated tools (Bower, Grunt, node-waf)
5. **Poor Organization**: Lacked clear sections and had duplicate entries
6. **Redundancy**: Multiple cache directories and duplicate `.cache` entries

## Decision

Refactor the `.gitignore` file to be project-specific and well-organized:

1. **Remove irrelevant entries** for frameworks and tools not used in the project
2. **Add Bun-specific entries** (`bun.lockb`)
3. **Organize into clear sections** with descriptive comments
4. **Consolidate duplicate patterns**
5. **Keep only essential entries** relevant to the project's technology stack

## Consequences

### Positive

- **Improved Clarity**: Developers can quickly understand what files are ignored and why
- **Reduced Maintenance**: Fewer irrelevant entries to maintain or confuse developers
- **Better Performance**: Smaller `.gitignore` file may improve Git performance marginally
- **Technology Alignment**: File now accurately reflects the project's Bun/TypeScript stack
- **Prevents Errors**: Explicitly ignoring `bun.lockb` prevents version conflicts

### Negative

- **Risk of Missing Patterns**: Removing entries could potentially expose files that should be ignored
  - Mitigated by testing with `git status` after changes
  - Team review recommended to ensure no critical patterns were removed

### Neutral

- File size reduced from 239 lines to 97 lines (59% reduction)
- No functional changes to the project, only development workflow improvements

## Implementation Details

### Key Changes Made

1. **Removed sections for**:
   - Grunt, Bower, node-waf
   - Framework-specific caches (Next.js, Nuxt.js, Gatsby, etc.)
   - Unused bundler caches (Parcel, Snowpack, FuseBox)
   - Server-specific directories (Serverless, DynamoDB)

2. **Added**:
   - `bun.lockb` to package manager section
   - Clear section headers with comments

3. **Reorganized into sections**:
   - Dependencies
   - Package manager files
   - Environment files
   - Build outputs
   - Logs
   - Testing & Coverage
   - Caches
   - IDE and Editor files
   - OS files
   - Temporary files
   - Project-specific

4. **Retained all project-specific patterns**:
   - Credentials directory patterns
   - Database backup patterns
   - Cloudflare Wrangler cache
   - MCP sync info
   - Playwright test artifacts

## References

- Gemini 2.5 Pro consensus analysis (10/10 confidence score)
- Git documentation on `.gitignore` best practices
- Bun documentation on `bun.lockb`
