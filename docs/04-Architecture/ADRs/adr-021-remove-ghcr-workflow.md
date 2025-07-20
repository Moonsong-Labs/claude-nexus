# ADR-021: Remove GitHub Container Registry Workflow

**Date**: 2025-01-21  
**Status**: Accepted  
**Author**: Claude Nexus Proxy Team

## Context

The project had a GitHub Actions workflow (`docker-publish.yml`) configured to publish Docker images to GitHub Container Registry (ghcr.io). However, investigation revealed:

1. The project actually uses Docker Hub for deployment (via `push-images.sh` script)
2. The CI workflow already builds Docker images as part of the testing process
3. The workflow created unnecessary duplication and was misconfigured for the wrong registry

## Decision

Remove the `docker-publish.yml` workflow entirely and continue using the existing deployment approach:

- CI workflow builds and tests Docker images on every push
- Manual deployment to Docker Hub via `push-images.sh` script for controlled releases

## Consequences

### Positive

- Eliminates confusion about which registry is being used
- Reduces code duplication and maintenance burden
- Aligns workflows with actual deployment practices
- Simplifies the CI/CD pipeline

### Negative

- No automated deployment on main branch merges (this is intentional for controlled releases)

## Alternatives Considered

1. **Refactor to use Docker Hub**: Could have updated the workflow to push to Docker Hub instead of ghcr.io
   - Rejected because manual deployment provides better control over releases
   - The `push-images.sh` script already handles Docker Hub deployment well

2. **Keep both registries**: Could have maintained both ghcr.io and Docker Hub
   - Rejected due to unnecessary complexity and maintenance overhead

## Implementation Notes

- Deleted `.github/workflows/docker-publish.yml`
- No other changes required as CI workflow continues to build images for testing
- Deployment continues via manual `push-images.sh` script as before
