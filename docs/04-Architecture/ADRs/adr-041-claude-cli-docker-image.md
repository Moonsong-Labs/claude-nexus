# ADR-041: Claude CLI Docker Image Addition

## Status

Accepted

## Context

Following the decision to use separate Docker images for each service (ADR-002), the project evolved to include Claude CLI functionality. This required integrating the official Claude CLI tool into our Docker-based deployment environment. The CLI provides direct interaction with Claude through the proxy, enabling command-line based conversations and monitoring capabilities.

## Decision Drivers

- **User Experience**: Need for command-line interface alongside web dashboard
- **Integration**: Seamless integration with existing proxy infrastructure
- **Monitoring**: Real-time token usage tracking and conversation monitoring
- **Isolation**: Maintain service separation principles established in ADR-002

## Decision

We will add a third Docker image specifically for Claude CLI integration:

- `claude-nexus-cli`: Contains Claude CLI with proxy integration and monitoring tools

This extends the architecture established in ADR-002 while maintaining the principle of service separation.

### Implementation Details

The Claude CLI Docker image ([`docker/claude-cli/Dockerfile`](../../../docker/claude-cli/Dockerfile)) includes:

- Official Claude CLI tool
- Custom monitoring scripts (`ccusage`, `monitor`)
- Integration with the proxy service for authentication
- Alpine Linux base for consistency with other images

### Integration Approach

- The CLI container connects to the proxy service via Docker networking
- Shares credential volume with proxy for authentication
- Provides both interactive CLI access and monitoring capabilities
- Supports real-time token usage tracking

## Consequences

### Positive

- **Complete User Experience**: Offers both CLI and web interfaces
- **Monitoring Capabilities**: Real-time usage tracking through `monitor` command
- **Docker Compose Integration**: Easy local development and testing
- **Consistent Architecture**: Follows established service separation pattern

### Negative

- **Additional Image**: One more Docker image to build and maintain
- **Complexity**: Requires careful orchestration in Docker Compose

### Risks and Mitigations

- **Risk**: Version synchronization between CLI and proxy
  - **Mitigation**: Pin Claude CLI version in Dockerfile

- **Risk**: Credential sharing complexity
  - **Mitigation**: Use Docker volumes for secure credential access

## Links

- [ADR-002: Separate Docker Images](./adr-002-separate-docker-images.md) - Original decision this extends
- [Claude CLI Dockerfile](../../../docker/claude-cli/Dockerfile)
- [Docker Compose Configuration](../../../docker/docker-compose.yml)
- [ADR-010: Docker-Based Claude CLI Integration](./adr-010-docker-cli-integration.md)

## Notes

This decision extends the original two-image architecture to three images, maintaining the benefits of service separation while adding CLI capabilities. The implementation demonstrates how architectural decisions can evolve while preserving core principles.

---

Date: 2025-01-21
Authors: Development Team
