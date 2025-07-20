# ADR-035: Features Documentation Refactoring

## Status

Accepted

## Context

The `docs/00-Overview/features.md` file serves as comprehensive feature documentation for the Claude Nexus Proxy project. However, several issues were identified during the grooming process:

1. **Redundancy**: Many features were duplicated between features.md and README.md
2. **Missing Features**: Several important features mentioned in CLAUDE.md were not documented:
   - MCP (Model Context Protocol) Server with prompt management
   - Spark tool integration for recommendations
   - Database migration system
   - Test sample collection functionality
   - Sub-task tracking as a distinct feature
3. **Outdated Content**: The "Planned Features" section contained features that may already be implemented
4. **Poor Organization**: The feature comparison table at the end didn't add meaningful value
5. **Lack of Technical Depth**: Features were listed superficially without technical insights

## Decision

We refactored the features.md file to:

1. **Add Document Charter**: Added a clear purpose statement distinguishing it from README.md
2. **Include All Current Features**: Added comprehensive documentation for:
   - MCP Server with implementation details
   - Spark tool integration
   - Sub-task tracking as a separate feature section
   - Enhanced developer experience features
3. **Add Technical Depth**: Each feature section now includes:
   - Implementation notes referencing relevant ADRs
   - Technical details about how features work
   - Configuration options and environment variables
   - Performance characteristics where relevant
4. **Remove Redundancy**: Focused on technical documentation while README.md serves as the entry point
5. **Update Planned Features**: Reorganized with more realistic roadmap items and references to ADR-011
6. **Remove Feature Comparison Table**: Eliminated as it provided little value

## Consequences

### Positive

- Creates a single source of truth for feature specifications
- Reduces maintenance burden by eliminating redundancy (DRY principle)
- Provides developers with comprehensive technical reference
- Makes the project more professional and welcoming to contributors
- Establishes clear separation of concerns between documentation files

### Negative

- Requires ongoing maintenance to keep features up-to-date
- Initial effort to gather technical details for all features

### Neutral

- Sets precedent for maintaining high-quality technical documentation
- May require periodic review to ensure accuracy as features evolve

## Implementation Notes

The refactoring followed industry best practices for documentation:

- README.md serves as the "front door" with quick overview
- features.md provides comprehensive technical deep-dive
- Each feature section includes implementation details and references to relevant ADRs
- Technical accuracy was prioritized, especially for complex features like MCP Server and AI analysis

## References

- Gemini 2.5 Pro validation (10/10 confidence score)
- Industry best practices for open-source documentation
- ADR-011: Future Decisions (for planned features)
- ADR-022: Documentation Strategy
