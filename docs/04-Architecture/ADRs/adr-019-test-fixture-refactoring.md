# ADR-019: Test Fixture Refactoring for Subtask Linking

## Status

Accepted

## Context

During the file grooming sprint (2025-01-19), we identified inconsistencies in the subtask-linking test fixtures. The `01-subtask-matched.json` fixture had a simplified structure compared to newer fixtures, missing essential fields like `conversation_id` and `branch_id`.

## Decision

We decided to refactor test fixtures using a balanced approach:

1. Keep fixtures minimal for their specific test purpose ("happy path" testing)
2. Add essential fields required by the production system
3. Maintain consistency across fixtures without unnecessary complexity

## Consequences

### Positive

- Better alignment with production data structures
- Improved test reliability by including all required fields
- Maintained simplicity for basic test scenarios
- Consistent structure across all test fixtures

### Negative

- None identified

## Implementation Details

### Changes Made to `01-subtask-matched.json`:

1. Enhanced description to clarify it's a "basic happy path test"
2. Added missing fields to parent object:
   - `conversation_id`
   - `branch_id`
   - `current_message_hash`
   - `parent_message_hash`
3. Added `expectedBranchId` to test expectations
4. Kept the fixture minimal while ensuring structural consistency

### Rationale

The fixture serves as a canonical example of successful subtask linking. While programmatic tests in `subtask-linker.test.ts` provide comprehensive coverage, this fixture:

- Documents the expected data structure
- Provides a quick visual reference
- Acts as a regression test for the most basic scenario
- Helps with debugging by providing a concrete test case

## References

- [GROOMING.md](/home/crystalin/projects/claude-nexus-proxy/GROOMING.md) - Grooming guidelines
- [subtask-linker.test.ts](/home/crystalin/projects/claude-nexus-proxy/packages/shared/src/utils/__tests__/subtask-linker.test.ts) - Test implementation
