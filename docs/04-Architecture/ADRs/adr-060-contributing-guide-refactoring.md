# ADR-060: Contributing Guide Refactoring

**Status**: Accepted  
**Date**: 2025-01-21  
**Author**: Claude Code (AI Assistant)

## Context

During the file grooming sprint for production readiness, the CONTRIBUTING.md file was reviewed and found to contain several issues that prevented it from being production-ready:

1. **Broken Link**: Referenced non-existent `docs/DEVELOPMENT.md` instead of the correct `docs/01-Getting-Started/development.md`
2. **Missing Security Contact**: Contained placeholder text "[security contact]" with no actual contact information
3. **Incomplete Repository Information**: Fork instructions didn't include the actual repository URL
4. **Outdated Test Documentation**: Only mentioned `bun test` without referencing the numerous test commands available
5. **Missing Key References**: No mention of important project documentation like CLAUDE.md, GROOMING.md, or TypeScript project references
6. **Placeholder Text**: Community chat reference had placeholder text "[if applicable]"
7. **Security Section Issues**: Exposed email requirement for security reports instead of using modern GitHub features

## Decision

We decided to refactor CONTRIBUTING.md with the following changes:

1. **Fix all broken links** - Updated to point to correct documentation paths
2. **Create SECURITY.md** - Following modern best practices for security vulnerability reporting using GitHub's private vulnerability reporting feature
3. **Add complete repository URL** - Added the actual GitHub repository URL (https://github.com/moonsong-labs/claude-nexus-proxy)
4. **Update test documentation** - Added references to all test commands (unit, integration, coverage)
5. **Add important references** - Added links to CLAUDE.md, GROOMING.md, and relevant ADRs
6. **Remove placeholder text** - Cleaned up all placeholder text and made content production-ready
7. **Streamline content** - Reduced duplication by referencing other documentation where appropriate

## Implementation

The refactoring included:

1. Creating a new SECURITY.md file with modern security reporting guidelines
2. Updating CONTRIBUTING.md to reference SECURITY.md instead of exposing email addresses
3. Fixing the development guide link to the correct path
4. Adding comprehensive test command documentation
5. Including references to architectural decision records and project-specific documentation
6. Removing all placeholder text and making the content ready for public consumption

## Consequences

### Positive

- **Lower barrier to entry** - Contributors can now find accurate information and working links
- **Better security practices** - Using GitHub's private vulnerability reporting instead of exposing emails
- **Comprehensive testing guidance** - Contributors understand all available test options
- **DRY principle** - Less duplication, more references to authoritative sources
- **Production ready** - No placeholder text or broken links

### Negative

- None identified - These are straightforward improvements with no downsides

## Alternatives Considered

1. **Keep security email** - Rejected because GitHub's private vulnerability reporting is the modern standard
2. **Duplicate all test information** - Rejected in favor of referencing package.json to avoid maintenance burden
3. **Leave as-is** - Rejected because broken links and placeholder text are not acceptable for a production project

## References

- [GitHub Private Vulnerability Reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
- [ADR-013: TypeScript Project References](./adr-013-typescript-project-references.md)
- [ADR-012: Database Schema Evolution](./adr-012-database-schema-evolution.md)
