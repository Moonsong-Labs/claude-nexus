# ADR-045: ADR-014 Renumbering Resolution

## Status

Accepted

## Context

During repository grooming, it was discovered that there were two ADR files both numbered as ADR-014:

1. `adr-014-sql-query-logging.md` - SQL Query Logging for Development and Debugging
2. `adr-014-subtask-query-executor-pattern.md` - SubtaskQueryExecutor Pattern for Task Detection

This duplicate numbering created several issues:

- **Confusion**: Unclear which ADR-014 was being referenced
- **Missing Index Entry**: The SubtaskQueryExecutor Pattern ADR was not listed in the README.md index
- **Inconsistent Documentation**: The pattern is actively used in the codebase but wasn't properly indexed
- **Missing Metadata**: The SubtaskQueryExecutor Pattern ADR lacked date and author information

## Decision

We decided to:

1. Keep `adr-014-sql-query-logging.md` as ADR-014 (it was properly indexed)
2. Renumber `adr-014-subtask-query-executor-pattern.md` to `adr-044-subtask-query-executor-pattern.md`
3. Update all references from ADR-014 to ADR-044 for the SubtaskQueryExecutor Pattern
4. Add the missing metadata (date and authors)
5. Add the ADR to the index in README.md
6. Add cross-references to related ADRs

## Consequences

### Positive

- **Clear Numbering**: Each ADR now has a unique number
- **Complete Index**: All ADRs are properly indexed in README.md
- **Better Discoverability**: The SubtaskQueryExecutor Pattern is now easily findable
- **Consistent Documentation**: All ADRs follow the same format with metadata

### Negative

- **Historical References**: Any external documentation or discussions referencing "ADR-014 SubtaskQueryExecutor Pattern" will need to be aware of the renumbering

### Neutral

- **Git History**: The git history will show the file rename, preserving the evolution of the document

## Implementation

The following changes were made:

1. Renamed file: `adr-014-subtask-query-executor-pattern.md` → `adr-044-subtask-query-executor-pattern.md`
2. Updated internal ADR number from ADR-014 to ADR-044
3. Added metadata section with date (2025-01-21) and authors
4. Updated ADR-007 reference from ADR-014 to ADR-044
5. Added entry to ADR index in README.md
6. Added cross-references to ADR-007 and ADR-015

---

Date: 2025-01-21
Authors: Development Team
