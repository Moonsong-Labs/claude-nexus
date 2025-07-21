# ADR-037: Architecture Overview Documentation Refactoring

## Status

Accepted

## Context

During the file grooming sprint (January 2025), we identified significant issues with `docs/00-Overview/architecture.md`:

1. **Content duplication** - Significant overlap with `docs/04-Architecture/internals.md`
2. **Outdated information** - Missing features (MCP server, AI analysis), referencing non-existent telemetry
3. **ADR-022 violation** - Duplicated configuration details from other documentation
4. **Poor focus** - Mixed high-level overview with detailed configuration (217 lines)
5. **Maintenance burden** - Multiple places to update for the same information

## Decision

Refactor `architecture.md` to be a focused, high-level overview following ADR-022 (DRY principle):

1. **Transform into quick reference** (~90 lines)
2. **Remove ALL duplicated content**
3. **Focus on "what" not "how"**
4. **Add clear links to detailed documentation**
5. **Update with current architecture features**

## Implementation

### Before (217 lines)

- Detailed environment variables
- Full deployment commands
- Duplicated database information
- Configuration examples
- Mixed abstraction levels

### After (90 lines)

- Clear system diagram with all components
- Bullet-point service descriptions
- Feature highlights only
- Links to comprehensive documentation
- Consistent abstraction level

### Key Changes

1. **Updated architecture diagram** to include:
   - Claude CLI as third client type
   - MCP server and AI analysis in proxy features
   - Clearer service relationships

2. **Removed sections**:
   - Environment variable listings (link to environment-vars.md)
   - Deployment commands (link to deployment guides)
   - Database details (link to database.md)
   - Development setup details (link to development.md)

3. **Added current features**:
   - MCP server for prompt management
   - AI-powered conversation analysis
   - Sub-task detection and tracking
   - OAuth with auto-refresh

## Consequences

### Positive

- **Reduced maintenance** - Single source of truth for each topic
- **Better clarity** - Clear separation of overview vs. details
- **Current accuracy** - Reflects actual system capabilities
- **Improved navigation** - Clear links to detailed information
- **59% size reduction** - More focused and scannable

### Negative

- Users must follow links for detailed information
- Initial learning curve for documentation structure

### Mitigation

- Clear, descriptive link text
- Logical grouping of related links
- Quick start section for immediate needs

## References

- ADR-022: Documentation Strategy - DRY Principle
- Gemini validation: 10/10 confidence score
- Original file: 217 lines → 90 lines (59% reduction)
