# ADR-019: Remove Unused Type Definitions

**Status**: Accepted

**Date**: 2025-01-20

**Context**: During a code grooming sprint, we identified the file `services/dashboard/src/types/api-types.ts` containing type definitions that were created as part of the AI analysis feature (PR #80) but were never used in the implementation.

**Decision**: Delete the file entirely as dead code.

**Rationale**:

1. **No Usage**: Comprehensive search confirmed these types are not imported or used anywhere
2. **Redundancy**: The existing `HttpError` class already handles error structures with better type safety
3. **Code Clarity**: Removing unused code reduces cognitive load and prevents confusion
4. **Maintenance**: Dead code adds unnecessary maintenance burden

**Consequences**:

- Positive: Cleaner codebase, reduced confusion for developers
- Negative: None identified - types were never used

**Implementation**:

- File deleted in commit as part of file grooming sprint
- No other code changes required as types were completely unused
