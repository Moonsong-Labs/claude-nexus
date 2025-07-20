# ADR-022: Remove Bun Publish Workflow

**Date**: 2025-01-20  
**Status**: Accepted  
**Author**: Claude Nexus Proxy Team

## Context

The project had a GitHub Actions workflow (`bun-publish.yml`) configured to publish packages to npm on GitHub release events. However, investigation revealed:

1. The root `package.json` has `"private": true`, indicating this is a private monorepo not intended for npm publishing
2. The project uses Docker for deployment (via `push-images.sh` script to Docker Hub), not npm package distribution
3. No references to this workflow exist anywhere in the codebase (except in test fixtures)
4. The workflow serves no purpose in the current architecture
5. A similar unused workflow (`docker-publish.yml`) was recently removed per ADR-021
6. The dashboard package was missing the `"private": true` field, creating a risk of accidental publishing

## Decision

Remove the `bun-publish.yml` workflow entirely and add `"private": true` to the dashboard package.json to prevent any accidental publishing attempts.

## Consequences

### Positive

- Eliminates confusion about the project's distribution method
- Reduces maintenance burden by removing unused code
- Prevents accidental npm publishing of private packages
- Aligns CI/CD workflows with actual deployment practices (Docker)
- Maintains consistency across all packages in the monorepo

### Negative

- None identified - the workflow was completely unused

## Alternatives Considered

1. **Keep the workflow for future use**: Rejected because there are no plans to publish this private monorepo to npm, and keeping unused code violates the YAGNI principle

2. **Repurpose for Docker publishing**: Rejected because the project already has a working deployment process via `push-images.sh` script that provides better control over releases

## Implementation Notes

- Deleted `.github/workflows/bun-publish.yml`
- Added `"private": true` to `services/dashboard/package.json`
- No other changes required as the workflow was completely unused
