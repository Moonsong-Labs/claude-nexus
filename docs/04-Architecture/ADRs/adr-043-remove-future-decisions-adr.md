# ADR-043: Remove Future Decisions ADR

## Status

Accepted

## Context

ADR-011 "Future Architectural Decisions" was created in June 2024 to track pending architectural decisions that might need to be made in the future. However, several issues have emerged:

1. **Outdated Content**: The file hasn't been updated since creation, despite the project evolving significantly with 40+ new ADRs
2. **Duplication**: The technical debt register (`docs/04-Architecture/technical-debt.md`) already serves as the proper place to track pending technical work
3. **Anti-Pattern**: Using ADRs to track future possibilities violates the core principle that ADRs should document decisions that have been made, not hypothetical future ones
4. **Maintenance Burden**: Having two places to track future technical work creates confusion and requires double maintenance

## Decision

Remove ADR-011 entirely and rely on the technical debt register as the single source of truth for tracking pending technical decisions and future work.

When architectural decisions become necessary, proper ADRs will be created to document the chosen approach, following the established ADR pattern.

## Consequences

### Positive

- **Single Source of Truth**: Eliminates confusion by having only one place (technical debt register) to track pending technical work
- **Correct ADR Usage**: Reinforces that ADRs are for documenting decisions made, not future possibilities
- **Reduced Maintenance**: No need to maintain two separate tracking systems
- **Better Process Hygiene**: Aligns with industry best practices for architectural governance

### Negative

- Loss of historical record of what was considered important in June 2024 (mitigated by git history)

### Neutral

- Future architectural needs will be tracked in the technical debt register with proper prioritization
- Actual decisions will continue to be documented as new ADRs when made

## Implementation

1. Deleted `adr-011-future-decisions.md`
2. Updated references in:
   - `docs/04-Architecture/ADRs/README.md` - Removed entry from ADR list
   - `docs/00-Overview/features.md` - Changed reference from ADR-011 to technical debt register
   - `docs/04-Architecture/ADRs/adr-035-features-documentation-refactoring.md` - Updated references

## Validation

Both Gemini 2.5 Pro and O3-mini strongly endorsed this decision:

- Gemini 2.5 Pro: 10/10 confidence - "corrects a common anti-pattern and improves process hygiene"
- O3-mini: 9/10 confidence - "ensures repository reflects only finalized decisions"

## References

- Technical Debt Register: `docs/04-Architecture/technical-debt.md`
- ADR best practices by Michael Nygard
- Industry standards for architectural governance

---

Date: 2025-01-21
Authors: Development Team (via grooming process)
