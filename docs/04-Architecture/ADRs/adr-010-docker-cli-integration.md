# ADR-010: Docker-Based Claude CLI Integration

## Status

Superseded by [ADR-041: Claude CLI Docker Image Addition](./adr-041-claude-cli-docker-image.md)

## Supersession Note

This ADR has been superseded by ADR-041, which documents the current implementation of Claude CLI Docker integration. The implementation details and code examples in this document are outdated and should not be used. This document is preserved for historical context only.

## Context

Users wanted to use the official Claude CLI tool through the proxy for:

- Interactive Claude sessions with proxy benefits
- Token tracking for CLI usage
- Consistent authentication across tools
- Integration with existing workflows

The challenge was integrating a third-party CLI tool while maintaining security, usability, and the proxy's tracking capabilities.

## Decision Drivers

- **Official Tool Support**: Use Anthropic's official CLI
- **Security**: Isolate CLI from host system
- **Usability**: Simple commands for users
- **Token Tracking**: Maintain usage visibility
- **File Access**: Support file operations
- **Environment Consistency**: Same setup across platforms

## Considered Options

1. **Native Installation**
   - Description: Users install CLI directly
   - Pros: Direct access, full performance
   - Cons: Installation complexity, version mismatches

2. **Proxy CLI Wrapper**
   - Description: Custom CLI that wraps proxy API
   - Pros: Full control, tailored features
   - Cons: Maintenance burden, missing CLI features

3. **Docker Container**
   - Description: CLI in container with proxy config
   - Pros: Consistent environment, easy setup
   - Cons: Docker requirement, file access complexity

4. **Shell Script Wrapper**
   - Description: Script that configures and runs CLI
   - Pros: Simple, no Docker needed
   - Cons: Platform differences, configuration issues

## Decision

We will provide **Docker-based Claude CLI integration** with pre-configured containers.

### Implementation Approach

The implementation used Docker containers to provide:

- Isolated CLI environment
- Consistent cross-platform experience
- Integration with proxy authentication
- Volume mounts for file access

For current implementation details, see [ADR-041](./adr-041-claude-cli-docker-image.md).

## Consequences

### Positive

- **Zero Installation**: No local CLI setup required
- **Version Control**: Consistent CLI version via Docker tags
- **Isolated Environment**: No system pollution
- **Token Tracking**: Full visibility of CLI usage
- **Cross-Platform**: Works identically on all Docker platforms
- **File Access**: Volume mounts enable file operations

### Negative

- **Docker Dependency**: Requires Docker installation
- **Performance Overhead**: Container startup time
- **File Path Complexity**: Must understand volume mounts
- **Network Isolation**: Container networking knowledge needed

### Risks and Mitigations

- **Risk**: File permissions issues with volumes
  - **Mitigation**: Document UID/GID considerations
  - **Mitigation**: Use consistent workspace directory

- **Risk**: Credential exposure in container
  - **Mitigation**: Mount credentials read-only
  - **Mitigation**: Use environment variables for sensitive data

## Historical Note

This ADR documented the initial decision to integrate Claude CLI via Docker containers. The approach evolved and was refined in ADR-041, which contains the current implementation details and usage patterns.

---

Date: 2024-06-25
Authors: Development Team
