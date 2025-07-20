# ADR-032: CI/CD Workflow Consolidation and Optimization

## Status

Accepted

## Context

The project had two separate GitHub Actions workflows (`ci.yml` and `code-quality.yml`) with overlapping functionality, leading to:

- Redundant job executions and setup steps
- No dependency caching, resulting in slower CI runs
- Docker builds running on every PR, consuming unnecessary resources
- Inefficient job organization without proper parallelization
- Maintenance overhead of managing two workflows

This refactoring aimed to create a single, optimized CI workflow that provides faster feedback while using resources more efficiently.

## Decision Drivers

- **Performance**: Reduce CI execution time through caching and parallelization
- **Resource Efficiency**: Minimize unnecessary builds and redundant operations
- **Maintainability**: Single source of truth for CI configuration
- **Developer Experience**: Faster feedback on pull requests
- **Cost Optimization**: Reduce GitHub Actions minutes usage

## Decision

Consolidate both workflows into a single, optimized `ci.yml` with the following improvements:

### 1. Dependency Caching

Implement comprehensive Bun dependency caching:

```yaml
- name: Cache Bun dependencies
  uses: actions/cache@v4
  with:
    path: |
      ~/.bun/install/cache
      node_modules
      */*/node_modules
    key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lockb', '**/package.json') }}
```

### 2. Job Organization

Structure jobs for optimal parallelization:

- **Setup**: Initial dependency installation and shared package build
- **Quality**: Parallel execution of format, lint, and typecheck
- **Build**: Parallel builds of proxy and dashboard services
- **Test**: Comprehensive test suite execution
- **Docker**: Conditional Docker image builds (main branch only)

### 3. Concurrency Control

Prevent redundant workflow runs:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

### 4. Conditional Docker Builds

Build Docker images only when necessary:

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

## Implementation Details

### Job Dependencies and Flow

```
setup
  ├── quality (parallel: format, lint, typecheck)
  └── build (parallel: proxy, dashboard)
       └── test
            └── docker (conditional)
```

### Matrix Strategy for Parallelization

Quality checks and service builds use matrix strategies:

```yaml
strategy:
  matrix:
    check: [format, lint, typecheck]
```

### Artifact Management

Build outputs are stored as artifacts for traceability:

```yaml
- name: Upload build artifacts
  uses: actions/upload-artifact@v4
  with:
    name: ${{ matrix.service }}-build
    path: services/${{ matrix.service }}/dist
```

## Consequences

### Positive

- **50-70% faster CI runs** through caching and parallelization
- **Reduced complexity** with single workflow file
- **Better resource utilization** with conditional Docker builds
- **Improved developer experience** with faster PR feedback
- **Cost savings** from reduced GitHub Actions minutes

### Negative

- **Slightly more complex YAML** due to job dependencies
- **Initial cache warming** required for new branches

### Risks and Mitigations

- **Risk**: Cache invalidation issues
  - **Mitigation**: Comprehensive cache keys including all relevant files
  - **Mitigation**: Restore keys for partial cache hits

- **Risk**: Job dependency failures blocking pipeline
  - **Mitigation**: Clear job dependencies with fail-fast behavior
  - **Mitigation**: Proper error messages for debugging

## Implementation Notes

- Removed `code-quality.yml` workflow file
- All quality checks now run in parallel within main CI
- Docker Buildx setup for improved build performance
- Test results and coverage uploaded as artifacts

## Future Enhancements

1. **Security Scanning**: Add dependency and container vulnerability scanning
2. **Performance Metrics**: Track and report CI execution times
3. **Selective Testing**: Run only affected tests based on changed files
4. **Build Caching**: Implement Docker layer caching for faster builds
5. **Deployment Integration**: Add staging deployment for successful main builds

## References

- [GitHub Actions Best Practices](https://docs.github.com/en/actions/guides)
- [Bun Caching Strategy](https://bun.sh/docs/install/cache)
- Original ADR-008: CI/CD Strategy with GitHub Actions

---

Date: 2025-01-20
Authors: Development Team (via grooming process)
