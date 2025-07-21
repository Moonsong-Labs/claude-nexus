# ADR-XXX: Short Descriptive Title

- **Status**: <!-- Proposed | Accepted | Deprecated | Superseded by ADR-YYY -->
- **Date**: <!-- YYYY-MM-DD -->
- **Authors**: <!-- Your Name, GitHub handle, or team -->

## Context

<!--
What is the issue that we're seeing that is motivating this decision or change?
Include relevant background information, constraints, and forces at play.
This section should be brief but provide enough context for readers to understand why this decision is needed.
-->

Write your context here...

## Decision Drivers

<!--
What are the key factors influencing this decision?
List the main requirements, constraints, or principles that guided the decision.
-->

- Performance requirements
- Security considerations
- Developer experience
- Maintainability concerns
- Cost implications

## Considered Options

<!--
What alternatives were evaluated? For each option, provide:
- A brief description
- Key advantages (pros)
- Key disadvantages (cons)
This demonstrates due diligence and helps future readers understand why other paths weren't taken.
-->

### Option 1: Name of First Option

- **Description**: Brief explanation of this approach
- **Pros**:
  - Advantage 1
  - Advantage 2
- **Cons**:
  - Disadvantage 1
  - Disadvantage 2

### Option 2: Name of Second Option

- **Description**: Brief explanation of this approach
- **Pros**:
  - Advantage 1
  - Advantage 2
- **Cons**:
  - Disadvantage 1
  - Disadvantage 2

## Decision

<!--
What is the change that we're proposing and/or doing?
Be specific and actionable. State clearly which option was chosen and why.
This is the "what" of the ADR.
-->

We will adopt [chosen solution] because [brief justification referencing the decision drivers and trade-offs].

### Implementation Details <!-- (Optional) -->

<!--
Include specific implementation details, code examples, or diagrams if they help clarify the decision.
This section is optional but recommended for technical decisions.
-->

```typescript
// Example code if relevant
```

## Consequences

<!--
What are the outcomes of this decision?
Consider all impacts: technical, organizational, and operational.
Include both immediate and long-term effects.
-->

### Positive

- Improved performance by X%
- Simplified deployment process
- Better developer experience

### Negative

<!--
Include any negative consequences and their mitigations.
Being transparent about downsides helps set realistic expectations.
-->

- Increased build time by 2 minutes
  - **Mitigation**: Investigate parallel build processes in Q2
- Additional complexity in configuration
  - **Mitigation**: Provide clear documentation and examples

## Links <!-- (Optional) -->

<!--
Include references to related materials:
- Other ADRs that this relates to or supersedes
- External documentation
- Relevant issues, PRs, or discussions
-->

- [ADR-YYY: Related Decision](./adr-yyy-title.md)
- [External Documentation](https://example.com)
- [GitHub Issue #123](https://github.com/org/repo/issues/123)

## Notes <!-- (Optional) -->

<!--
Any additional notes, future considerations, or things to watch out for.
This might include:
- Migration strategies
- Monitoring requirements
- Review timeline
-->

Additional considerations...
