# ADR-047: ADR-008 CI/CD Strategy Grooming

## Status

Accepted

## Context

During the file grooming sprint (January 2025), ADR-008 (CI/CD Strategy with GitHub Actions) was identified as requiring updates. The ADR documented the original CI/CD strategy from June 2024 but had been superseded by ADR-032 in January 2025, which consolidated and optimized the workflow.

The ADR contained:

- Outdated YAML examples that no longer matched the current implementation
- A broken GitHub PR link placeholder
- An "Accepted" status despite being superseded
- Implementation details that could mislead developers

## Decision

We groomed ADR-008 to:

1. **Update Status**: Changed from "Accepted" to "Superseded by ADR-032"
2. **Add Supersession Notice**: Added a prominent note at the top directing readers to ADR-032
3. **Remove Outdated Code**: Removed YAML examples that no longer reflect reality
4. **Fix Broken Links**: Removed the placeholder PR link
5. **Preserve Historical Context**: Kept the decision rationale and consequences for historical value
6. **Update Cross-References**: Added proper links to ADR-032 throughout

## Implementation Details

### Changes Made

1. **Status Section**: Added supersession notice with link to ADR-032
2. **Implementation Details**: Replaced detailed YAML with high-level summary
3. **Implementation Notes**: Renamed to "Historical Implementation Notes" with supersession reference
4. **Links Section**: Removed broken PR link, added ADR-032 reference

### Validation

The refactoring plan was validated with AI models (Gemini-2.5-pro) which confirmed:

- Marking as "Superseded" follows ADR best practices (Michael Nygard standard)
- Removing outdated code examples prevents confusion
- Preserving historical context maintains valuable project history
- This is a low-risk, high-value documentation improvement

## Consequences

### Positive

- **Clarity**: Developers immediately understand ADR-008's historical status
- **Accuracy**: Removes misleading implementation details
- **Traceability**: Maintains the decision history while pointing to current state
- **Best Practice**: Follows established ADR lifecycle management patterns

### Negative

- None identified

## References

- ADR-008: Original CI/CD Strategy (now superseded)
- ADR-032: Current CI/CD Workflow Consolidation
- [Michael Nygard's ADR Guidelines](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)

---

Date: 2025-01-21
Authors: Development Team (via grooming process)
