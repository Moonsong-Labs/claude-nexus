# ADR-049: ADR README Grooming and Duplicate Number Resolution

## Status

Accepted

## Context

During the code grooming process, it was discovered that the ADR README.md file was severely outdated and contained multiple issues:

1. **Incomplete ADR listing**: The table only showed ADRs up to ADR-045, while the directory contained ADRs up to ADR-048
2. **Missing ADRs**: ADR-011 was referenced but doesn't exist, and ADR-016, ADR-017, ADR-018 were missing from the table
3. **Duplicate numbering**: Multiple ADRs shared the same numbers (ADR-019 through ADR-023), with up to 10 files sharing ADR-019
4. **Incorrect information**: ADR-008 was listed as "Accepted" but was actually "Superseded by ADR-032"
5. **Future dates**: Several ADRs had dates in 2025-06-XX which appeared to be typos

This situation made it difficult for developers to:

- Find the correct ADR for a given topic
- Understand which architectural decisions were current vs superseded
- Create new ADRs without causing further numbering conflicts

## Decision

We decided to comprehensively update the ADR README.md to accurately reflect the current state of all ADRs in the repository:

1. **Complete the ADR table**: Include all ADRs from ADR-001 through ADR-048
2. **Document duplicate numbers**: Create a separate section listing all duplicate-numbered ADRs with their full filenames to distinguish them
3. **Fix incorrect information**: Update statuses (e.g., ADR-008 to "Superseded") and correct dates
4. **Add missing entries**: Include ADR-011 as "Number skipped" and add all missing ADRs
5. **Improve documentation**: Add warnings about the numbering issue and guidance for creating new ADRs

The duplicate-numbered ADRs were kept with their current numbers rather than renumbering them immediately because:

- Renumbering would break historical references in commit messages and other documentation
- The files can still be distinguished by their descriptive filenames
- A future comprehensive renumbering effort can be planned separately

## Consequences

### Positive

- Developers can now find all ADRs through the README index
- The true status of each ADR is accurately reflected
- New ADRs can be created without accidentally reusing numbers
- The duplicate numbering issue is clearly documented for future resolution

### Negative

- The duplicate numbering issue remains (though now documented)
- The README is significantly longer due to the duplicate ADR sections
- Manual maintenance is still required to keep the README in sync

### Future Improvements

As suggested by Gemini during the validation process, we should consider:

1. Creating an automated script to generate the ADR index from the files
2. Implementing a pre-commit hook to ensure the README stays in sync
3. Planning a comprehensive ADR renumbering effort to resolve duplicates
