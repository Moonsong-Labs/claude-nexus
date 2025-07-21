# ADR-051: MCP Documentation Consolidation

## Date

2025-01-21

## Status

Accepted

## Context

During the file grooming sprint, we identified that the MCP (Model Context Protocol) implementation was documented in multiple places:

1. **ADR-016**: Original MCP implementation plan (marked as superseded)
2. **ADR-017**: Accepted MCP implementation using file-based approach
3. **mcp-server-actual-implementation.md**: Separate architecture document describing the implementation
4. **mcp-server-original-plan.md**: Another separate document with the original plan

This created several problems:

- Documentation redundancy and potential for drift
- Confusion about which document is authoritative
- Increased maintenance burden
- Violation of the single source of truth principle

## Decision

We will consolidate all MCP architectural documentation into the ADR system and remove redundant files:

1. **Delete** `docs/04-Architecture/mcp-server-actual-implementation.md` - Content is already covered in ADR-017
2. **Delete** `docs/04-Architecture/mcp-server-original-plan.md` - Content is already covered in ADR-016 (superseded)
3. **Keep** ADR-016 and ADR-017 as the historical record of decisions

Before deletion, we verified that ADR-017 contains all essential information from the actual implementation file. Some operational details unique to the implementation file (like sync behavior specifics) are already documented in:

- `CLAUDE.md` - Configuration and usage instructions
- `docs/00-Overview/features.md` - Feature overview including MCP

## Consequences

### Positive

- **Single source of truth**: ADRs become the authoritative source for architectural decisions
- **Reduced maintenance**: No need to synchronize multiple documents
- **Clearer documentation structure**: Developers know to look in ADRs for architecture
- **Follows best practices**: Adheres to DRY principle and ADR pattern

### Negative

- None identified. The unique operational details are preserved in appropriate locations.

### Neutral

- Future MCP documentation updates should go into ADRs or operational documentation as appropriate

## References

- [ADR-016: MCP Server Implementation (Superseded)](./adr-016-mcp-server-implementation.md)
- [ADR-017: MCP Prompt Sharing Implementation (Accepted)](./adr-017-mcp-prompt-sharing.md)
- Grooming sprint guidelines in `GROOMING.md`
