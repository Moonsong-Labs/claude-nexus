# ADR-002: Separate Docker Images for Each Service

## Status

Accepted

## Context

Given our monorepo structure (ADR-001), we need to decide how to package and deploy our services. The proxy and dashboard services have different requirements, dependencies, and scaling characteristics. We need a deployment strategy that supports independent scaling, security isolation, and optimal image sizes.

## Decision Drivers

- **Security**: Minimize attack surface for each service
- **Scalability**: Services may need different scaling strategies
- **Image Size**: Reduce deployment time and storage costs
- **Maintenance**: Easy to update individual services
- **Resource Usage**: Different services have different resource requirements

## Considered Options

1. **Single Combined Image**
   - Description: One Docker image containing both proxy and dashboard
   - Pros: Simple deployment, single artifact
   - Cons: Large image size, can't scale independently, security concerns

2. **Separate Images with Shared Base**
   - Description: Individual images extending a common base image
   - Pros: Some code reuse, smaller individual images
   - Cons: Base image maintenance overhead, limited benefit with Bun

3. **Completely Separate Images**
   - Description: Independent Docker images for each service
   - Pros: Maximum flexibility, optimal size, independent scaling
   - Cons: Multiple artifacts to manage

## Decision

We will use **completely separate Docker images** for each service:

- `claude-nexus-proxy`: Contains only the proxy service
- `claude-nexus-dashboard`: Contains only the dashboard service

### Implementation Details

The implementation uses multi-stage Docker builds with Alpine Linux for minimal image size and enhanced security. Each service has its own optimized Dockerfile:

- **Proxy Service**: [`docker/proxy/Dockerfile`](../../../docker/proxy/Dockerfile)
  - Multi-stage build with Alpine Linux
  - Production-optimized with `build:production` script
  - Includes runtime essentials only (credentials, dist, client-setup)
  - Exposed on port 3000

- **Dashboard Service**: [`docker/dashboard/Dockerfile`](../../../docker/dashboard/Dockerfile)
  - Multi-stage build with Alpine Linux
  - Production-optimized with `build:production` script
  - Includes pre-generated prompt assets
  - Exposed on port 3001

**Note**: The architecture was later extended to include a third Docker image for Claude CLI integration. See [ADR-041](./adr-041-claude-cli-docker-image.md) for details on this extension.

## Consequences

### Positive

- **Optimal Size**: Each image contains only necessary code and dependencies
- **Independent Scaling**: Can run multiple proxy instances with one dashboard
- **Security Isolation**: Compromised dashboard can't access proxy credentials
- **Faster Deployments**: Smaller images mean faster pulls and starts
- **Clear Boundaries**: Forces proper service separation

### Negative

- **Multiple Builds**: Need to build and maintain multiple Docker images
- **Registry Management**: More images to tag and push
- **Orchestration Complexity**: Need to coordinate multiple containers

### Risks and Mitigations

- **Risk**: Version mismatch between services
  - **Mitigation**: Use semantic versioning and coordinate releases

- **Risk**: Increased operational complexity
  - **Mitigation**: Use Docker Compose for local development, Kubernetes for production

- **Risk**: Duplicate build steps
  - **Mitigation**: Use build scripts to automate common tasks

## Links

- [ADR-001: Monorepo Structure](./adr-001-monorepo-structure.md)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Proxy Dockerfile](../../../docker/proxy/Dockerfile)
- [Dashboard Dockerfile](../../../docker/dashboard/Dockerfile)
- [Build Scripts](../../../docker/build-images.sh)
- [Docker Compose Configuration](../../../docker/docker-compose.yml)

## Notes

This approach aligns with microservices best practices and allows us to optimize each service independently. The additional complexity is manageable with proper tooling and actually reduces operational risks by isolating failures.

---

Date: 2024-01-20
Authors: Development Team
