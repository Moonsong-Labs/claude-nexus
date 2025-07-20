# ADR-023: Development Guide Refactoring

**Status**: Accepted  
**Date**: 2025-01-20  
**Decision Makers**: Development Team

## Context

The `docs/01-Getting-Started/development.md` file had evolved into a comprehensive but unfocused document that duplicated content from other documentation files. This created maintenance burden and confusion for developers trying to find specific information.

### Issues Identified

1. **Content Duplication**: Significant overlap with README.md, installation.md, and CLAUDE.md
2. **Incorrect Information**: Placeholder GitHub URLs and non-existent commands
3. **Missing Topics**: No coverage of git hooks, TypeScript project references, or AI worker configuration
4. **Poor Organization**: Mixed levels of detail, making it hard to use as a quick reference

## Decision

Refactor `development.md` to be a focused, day-to-day developer guide that complements rather than duplicates other documentation.

### Key Changes

1. **Removed Duplicate Content**
   - Installation steps (now references installation.md)
   - Detailed project overview (available in README.md)
   - Comprehensive configuration (references configuration.md)

2. **Added Developer-Focused Content**
   - Git pre-commit hooks workflow
   - TypeScript project references usage
   - AI worker development setup
   - Common debugging scenarios

3. **Improved Organization**
   - Clear sections for different workflows
   - Quick reference format
   - Direct commands without excessive explanation
   - Links to detailed documentation where appropriate

4. **Updated Commands**
   - Fixed non-existent `bun run db:migrate`
   - Added actual migration command pattern
   - Included real utility scripts from the project

## Consequences

### Positive

- Developers can quickly find common commands and workflows
- Reduced documentation maintenance burden
- Clear separation of concerns between documentation files
- Better alignment with actual project structure

### Negative

- Developers must reference multiple files for complete information
- Some context removed in favor of brevity

## Implementation Notes

The refactored guide focuses on answering "How do I..." questions for developers already set up with the project. It assumes prerequisites are met and points to other documentation for initial setup and detailed configuration.
