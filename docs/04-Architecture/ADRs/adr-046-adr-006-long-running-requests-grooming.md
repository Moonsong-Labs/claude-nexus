# ADR-046: ADR-006 Long-Running Requests Grooming

## Status

Accepted

## Context

During the file grooming sprint, ADR-006 (Support for Long-Running Requests) was identified as containing several issues that needed cleanup:

1. **Broken/placeholder links**: The ADR referenced non-existent resources like PR #16 pointing to "your-org/claude-nexus-proxy" and configuration guides that don't exist in the project
2. **Unimplemented pseudo-code**: A streaming heartbeat implementation example that doesn't match the actual codebase
3. **Speculative content**: A "Future Enhancements" section with ideas that belong in an issue tracker, not an architectural decision record

These issues undermined the ADR's value as an accurate record of the implemented architecture.

## Decision Drivers

- **Documentation accuracy**: ADRs should reflect decisions that were made, not speculation
- **Developer trust**: Broken links and unimplemented examples confuse developers
- **Maintenance burden**: Keeping speculative content up-to-date adds unnecessary work
- **Best practices**: Following docs-as-code principles for clean, accurate documentation

## Decision

We will refactor ADR-006 to:

1. Remove all broken and placeholder links
2. Remove pseudo-code examples that aren't implemented
3. Remove the speculative "Future Enhancements" section
4. Simplify implementation notes to focus on what exists
5. Update references to point to valid documentation

### Changes Made

1. **Removed streaming heartbeat pseudo-code**: This was never implemented and could mislead developers
2. **Simplified error handling section**: Replaced unimplemented code example with high-level description
3. **Removed PR #16 reference**: This was a placeholder link
4. **Removed Future Enhancements section**: Speculative features belong in issue trackers
5. **Updated links**: Now references actual existing documentation (environment-vars.md)

## Consequences

### Positive

- **Improved accuracy**: ADR now reflects the actual implementation
- **Better developer experience**: No more confusion from broken links or phantom features
- **Easier maintenance**: Less content to keep synchronized with code
- **Sets good precedent**: Reinforces importance of accurate architectural records

### Negative

- **Loss of ideas**: Future enhancement ideas are removed (but they can be tracked in issues)
- **Less detailed examples**: Removed code examples (but they weren't real anyway)

## Validation

This refactoring plan was validated using the consensus tool with Gemini-2.5-pro, which gave it a 10/10 confidence score, emphasizing that:

- The changes are technically trivial with no risk
- It aligns with industry best practices for documentation
- It's a low-effort, high-impact improvement
- ADRs should document decisions that WERE made, not what MIGHT be made

---

Date: 2025-01-21
Authors: File Grooming Sprint Team
