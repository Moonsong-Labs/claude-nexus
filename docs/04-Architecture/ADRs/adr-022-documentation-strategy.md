# ADR-022: Documentation Strategy - DRY Principle for Technical Docs

## Status

Accepted

## Context

During the file grooming sprint (July 2025), we discovered significant documentation duplication across the project:

- `docker/README.md` contained ~70% duplicated content from other documentation files
- Multiple files documented the same Docker commands, environment variables, and procedures
- Inconsistencies arose from maintaining the same information in multiple places
- Updates often missed some locations, leading to outdated or conflicting information

Specific example:

- `docker/README.md` (169 lines) duplicated content from:
  - `docs/03-Operations/deployment/docker.md` (comprehensive Docker deployment)
  - `docs/03-Operations/deployment/docker-compose.md` (Docker Compose specifics)
  - Main `README.md` and `CLAUDE.md`

## Decision

We will follow the DRY (Don't Repeat Yourself) principle for all technical documentation:

1. **Single Source of Truth**: Each piece of information should have exactly one authoritative location
2. **Quick References**: Create minimal quick-reference files that link to comprehensive documentation
3. **Clear Hierarchy**: Establish a clear documentation hierarchy:
   - Quick references in tool directories (e.g., `docker/README.md`)
   - Comprehensive guides in `docs/` directory
   - Architecture decisions in ADRs

## Implementation Example

The `docker/README.md` refactoring demonstrates this approach:

**Before**: 169 lines with extensive duplication
**After**: 76 lines focused on essential commands with links to detailed docs

Key changes:

- Removed all duplicated content
- Added clear links to comprehensive documentation
- Focused only on most-used commands
- Maintained consistent command conventions (e.g., `./docker-up.sh`)

## Consequences

### Positive

- **Reduced Maintenance**: Update information in one place only
- **Consistency**: Eliminates conflicting information
- **Clarity**: Users know where to find authoritative information
- **Discoverability**: Quick references guide users to detailed documentation

### Negative

- **Additional Navigation**: Users may need to follow links for detailed information
- **Initial Setup**: Requires restructuring existing documentation

### Mitigation

- Ensure quick references contain the most essential information
- Use descriptive link text to help users find what they need
- Maintain a clear, logical documentation structure

## References

- [Docker README Refactoring](https://github.com/claude-nexus-proxy/pull/XXX)
- [DRY Principle](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself)
