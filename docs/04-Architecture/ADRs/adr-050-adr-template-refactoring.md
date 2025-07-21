# ADR-050: ADR Template Refactoring

- **Status**: Accepted
- **Date**: 2025-07-21
- **Authors**: crystalin

## Context

During the file grooming process, it was discovered that the ADR template (`template.md`) had several usability issues that made it confusing for developers creating new ADRs:

1. **Unclear placeholders**: Used `[brackets]` for both instructions and example values
2. **Poor metadata visibility**: Date and Authors were only at the bottom of the template
3. **Redundant sections**: "Risks and Mitigations" was separate from "Negative Consequences"
4. **No guidance**: Lacked inline comments explaining when/how to use each section
5. **Optional sections unclear**: No clear marking of which sections were optional
6. **Inconsistent with README**: The README showed a simpler template structure

These issues led to confusion about what content to provide and inconsistent ADR formatting across the project.

## Decision Drivers

- Developer experience and ease of use
- Self-documenting templates reduce onboarding friction
- Consistency across all ADRs in the project
- Alignment with actual ADR usage patterns
- Clear guidance without being overly prescriptive

## Considered Options

### Option 1: Minimal Changes

- **Description**: Only fix the bracket confusion and move metadata to the top
- **Pros**:
  - Quick to implement
  - Minimal disruption to existing workflow
- **Cons**:
  - Doesn't address all usability issues
  - Misses opportunity for comprehensive improvement

### Option 2: Complete Overhaul

- **Description**: Redesign the entire template from scratch
- **Pros**:
  - Could incorporate latest ADR best practices
  - Fresh perspective on structure
- **Cons**:
  - High risk of breaking compatibility
  - May not align with existing ADRs
  - Time-consuming

### Option 3: Thoughtful Refactoring (Chosen)

- **Description**: Systematically improve each identified issue while maintaining compatibility
- **Pros**:
  - Addresses all identified problems
  - Maintains compatibility with existing ADRs
  - Incorporates feedback from AI models
- **Cons**:
  - Requires careful consideration of each change
  - More complex than minimal changes

## Decision

We will refactor the ADR template with the following improvements:

1. **Use HTML comments for guidance**: Replace `[bracketed text]` with `<!-- comments -->` for instructions
2. **Move metadata to top**: Status, Date, and Authors as the first elements after the title
3. **Merge redundant sections**: Combine "Risks and Mitigations" into "Negative Consequences"
4. **Add inline guidance**: Each section includes helpful comments explaining its purpose
5. **Mark optional sections**: Clear `<!-- (Optional) -->` markers on non-essential sections
6. **Provide realistic examples**: Use descriptive placeholders that show expected content format

### Implementation Details

The new template structure:

- Metadata at top for immediate visibility
- HTML comments provide guidance without appearing in rendered Markdown
- Sections flow logically from context → options → decision → consequences
- Optional sections clearly marked
- Examples show realistic content patterns

## Consequences

### Positive

- Reduced confusion for developers creating new ADRs
- Self-documenting template requires less external documentation
- Better consistency across ADRs in the project
- Easier onboarding for new team members
- Template serves as both guide and checklist

### Negative

- Existing ADRs don't match the new template format
  - **Mitigation**: Existing ADRs are not required to be updated; only new ADRs use the template
- Slightly longer template due to inline comments
  - **Mitigation**: Comments are hidden in rendered Markdown, so final ADRs remain clean

## Links

- [ADR README](./README.md) - Updated to reference the new template
- Original validation feedback from Gemini and O3-mini models

## Notes

This refactoring was validated with both Gemini-2.5-pro and O3-mini models, incorporating their suggestions for improvements such as:

- Using HTML comments for cleaner rendered output
- Ensuring the "Alternatives Considered" section (renamed to "Considered Options") remains prominent
- Structuring negative consequences to include mitigations inline
