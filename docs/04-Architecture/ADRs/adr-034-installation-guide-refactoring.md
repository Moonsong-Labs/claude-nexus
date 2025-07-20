# ADR-034: Installation Guide Refactoring

Date: 2025-01-20
Status: Accepted
Author: Claude (AI Assistant)

## Context

The `docs/01-Getting-Started/installation.md` file had several issues:

- Outdated repository URLs and Docker image references
- Non-existent database migration commands
- Node.js listed as a prerequisite despite Bun being used exclusively
- Significant overlap with quickstart.md and deployment guides
- Production deployment instructions that duplicated other guides
- Technical inaccuracies in database setup instructions

## Decision

Refactor the installation guide to:

1. Focus solely on local development setup
2. Remove all production deployment content (delegating to specialized guides)
3. Update all technical references to be accurate
4. Eliminate duplication with other documentation
5. Create clear separation between quickstart (what) and installation (how)

## Consequences

### Positive

- **Improved Developer Experience**: Accurate, focused instructions reduce setup friction
- **Reduced Maintenance Burden**: Single-purpose document is easier to keep updated
- **Clear Documentation Architecture**: Each guide has a distinct purpose
- **Better Navigation**: Clear references to appropriate guides for different needs

### Negative

- Users looking for production setup in installation.md must follow links to other guides
- Existing bookmarks to production sections will need updating

## Implementation Details

Changes made:

- Updated GitHub repository URL to `moonsong-labs/claude-nexus-proxy`
- Removed Node.js from prerequisites
- Fixed database initialization to reference actual `scripts/init-database.sql`
- Updated credential creation to use existing example files
- Removed Docker image references to external registries
- Added clear references to docker-up.sh script for Docker setup
- Removed entire production deployment section
- Added prominent links to deployment guides

## Validation

The refactoring was validated by:

- Consensus from Gemini-2.5-Pro (10/10 confidence) and O3-mini (9/10 confidence)
- Verification that all referenced files and guides exist
- Ensuring all links are valid and point to correct locations

## References

- [Installation Guide](../../01-Getting-Started/installation.md)
- [Docker Deployment Guide](../../03-Operations/deployment/docker.md)
- [Quick Start Guide](../../00-Overview/quickstart.md)
