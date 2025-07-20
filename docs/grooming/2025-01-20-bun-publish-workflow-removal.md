# Grooming Log: bun-publish.yml Workflow Removal

**Date**: 2025-01-20  
**File**: `.github/workflows/bun-publish.yml`  
**Status**: Removed

## Summary

Removed an unused GitHub Actions workflow that was configured to publish packages to npm on release events. This workflow was inappropriate for a private monorepo that uses Docker for deployment.

## Changes Made

1. **Deleted** `.github/workflows/bun-publish.yml`
2. **Added** `"private": true` to `services/dashboard/package.json`
3. **Created** ADR-022 documenting the removal decision

## Rationale

- The project is a private monorepo with `"private": true` in root package.json
- Project uses Docker for deployment, not npm package publishing
- No references to this workflow exist in the codebase
- Similar unused workflow (docker-publish.yml) was removed per ADR-021
- Dashboard package was missing private flag, creating risk of accidental publishing

## Impact

- No functional impact - workflow was completely unused
- Prevents accidental npm publishing of private packages
- Reduces maintenance burden and confusion
- Aligns CI/CD with actual deployment practices

## Related ADRs

- ADR-021: Remove GitHub Container Registry Workflow (similar cleanup)
- ADR-022: Remove Bun Publish Workflow (this change)
