# ADR-001: Monorepo Structure

## Status

Accepted

## Context

The Claude Nexus Proxy project consists of multiple interconnected services: a proxy API service, a monitoring dashboard, shared utilities, and various scripts. We need to decide how to organize these components in a way that promotes code reuse, simplifies dependency management, and maintains clear boundaries between services.

## Decision Drivers

- **Code Reuse**: Share common types, utilities, and configurations
- **Independent Deployment**: Services should be deployable separately
- **Developer Experience**: Easy to understand and navigate
- **Build Performance**: Efficient builds and hot reloading
- **Type Safety**: Maintain TypeScript types across services

## Considered Options

1. **Separate Repositories**
   - Description: Each service in its own Git repository
   - Pros: Complete independence, clear boundaries, separate CI/CD
   - Cons: Complex dependency management, code duplication, harder to maintain consistency

2. **Single Application**
   - Description: All code in one application with different entry points
   - Pros: Simple structure, easy sharing
   - Cons: Can't deploy services independently, mixing concerns, larger deployment artifacts

3. **Monorepo with Workspaces**
   - Description: Single repository with separate packages using Bun workspaces
   - Pros: Code sharing, independent services, unified tooling, atomic commits
   - Cons: More complex initial setup, requires workspace-aware tooling

## Decision

We will use a **monorepo structure with Bun workspaces**, organizing the codebase as follows:

```
claude-nexus-proxy/
├── packages/shared/      # Shared types and utilities
├── services/
│   ├── proxy/           # Proxy API service
│   └── dashboard/       # Dashboard web service
├── scripts/             # Utility scripts
├── docker/              # Docker configurations
└── docs/               # Documentation
```

### Implementation Details

The monorepo is configured using Bun workspaces with the following structure:

- **Workspace Configuration**: `["packages/*", "services/*"]` in root package.json
- **Shared Package**: `@claude-nexus/shared` provides common types, utilities, and configurations
- **Build Order**: Managed through TypeScript Project References (see [ADR-013](./adr-013-typescript-project-references.md))
- **Development Scripts**: Concurrent execution of services via `concurrently` package
- **Type Safety**: Cross-package type checking via TypeScript Project References

## Consequences

### Positive

- **Shared Code**: Types, configurations, and utilities are easily shared via `@claude-nexus/shared`
- **Independent Services**: Each service can be built and deployed separately
- **Unified Development**: Single `bun install` installs all dependencies
- **Atomic Changes**: Related changes across services can be committed together
- **Type Safety**: TypeScript types flow naturally between packages using project references
- **Consistent Standards**: Shared linting, formatting, and build configurations across all packages

### Negative

- **Initial Complexity**: Developers need to understand workspace structure
- **Build Order Dependencies**: Shared packages must be built before services (mitigated by TypeScript Project References - see [ADR-013](./adr-013-typescript-project-references.md))
- **Tooling Requirements**: Some tools may not fully support workspaces
- **TypeScript Compilation**: Initial challenges with circular dependencies resolved through project references

### Risks and Mitigations

- **Risk**: Accidental coupling between services
  - **Mitigation**: Enforce that services only communicate via APIs, not direct imports

- **Risk**: Large repository size over time
  - **Mitigation**: Use Git LFS for large files, regularly clean up old artifacts

## Links

- [Bun Workspaces Documentation](https://bun.sh/docs/workspaces)
- [ADR-002: Separate Docker Images](./adr-002-separate-docker-images.md)
- [ADR-013: TypeScript Project References](./adr-013-typescript-project-references.md) - Addresses TypeScript compilation challenges in the monorepo

## Notes

This structure allows us to maintain separate Docker images for each service while sharing code effectively. The monorepo approach has proven successful for many large-scale projects and aligns well with our need for rapid development while maintaining service independence.

**Evolution**: Since the initial decision, we've successfully implemented TypeScript Project References to resolve compilation order issues, demonstrating the flexibility of the monorepo approach to adapt to challenges while maintaining its core benefits.

---

**Date**: 2024-01-15  
**Last Updated**: 2025-01-21  
**Authors**: Development Team
