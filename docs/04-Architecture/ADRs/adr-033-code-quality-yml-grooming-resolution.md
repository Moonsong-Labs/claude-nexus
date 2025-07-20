# ADR-033: Code Quality YAML Grooming Resolution

## Status

Accepted

## Context

During the file grooming process on 2025-01-20, a task was assigned to groom the file `.github/workflows/code-quality.yml`. Investigation revealed that this file no longer exists in the repository.

## Investigation Findings

1. **File Status**: The `code-quality.yml` file does not exist in the repository
2. **Root Cause**: The file was intentionally removed as part of ADR-032 (CI/CD Workflow Consolidation and Optimization)
3. **Current State**: All code quality checks (format, lint, typecheck) are now integrated into the consolidated `ci.yml` workflow

## Decision

No action is required. The file was properly removed as part of a documented architectural improvement.

## Rationale

ADR-032 documented the consolidation of `code-quality.yml` and `ci.yml` into a single optimized workflow, which:

- Reduced CI execution time by 50-70%
- Eliminated redundancy and duplicate setup steps
- Implemented comprehensive dependency caching
- Improved parallelization of quality checks
- Reduced GitHub Actions minutes usage and costs

The current `ci.yml` file contains all necessary code quality checks:

- `format` - Code formatting validation
- `lint` - ESLint checks
- `typecheck` - TypeScript type checking

These checks run in parallel using a matrix strategy, providing faster feedback than the previous separate workflow approach.

## Consequences

### Positive

- Confirms that the CI/CD optimization from ADR-032 is properly implemented
- Validates that no regression has occurred in code quality coverage
- Prevents unnecessary recreation of a redundant workflow file

### Negative

None

## Implementation Notes

- The grooming task for `code-quality.yml` can be marked as complete with no changes required
- Future grooming tasks should reference existing ADRs to avoid attempting to recreate intentionally removed files

## References

- ADR-032: CI/CD Workflow Consolidation and Optimization
- Current CI workflow: `.github/workflows/ci.yml`

---

Date: 2025-01-20
Authors: Development Team (via grooming process)
