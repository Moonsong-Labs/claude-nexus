# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Claude Nexus Proxy project.

## What is an ADR?

An Architecture Decision Record captures an important architectural decision made along with its context and consequences.

## ADR Template

All ADRs in this project follow this template:

```markdown
# ADR-XXX: [Title]

## Status

[Proposed | Accepted | Deprecated | Superseded]

## Context

What is the issue that we're seeing that is motivating this decision or change?

## Decision

What is the change that we're proposing and/or doing?

## Consequences

What becomes easier or more difficult to do because of this change?
```

## Current ADRs

| ADR                                                      | Title                                                      | Status                 | Date       |
| -------------------------------------------------------- | ---------------------------------------------------------- | ---------------------- | ---------- |
| [ADR-001](./adr-001-monorepo-structure.md)               | Monorepo Structure                                         | Accepted               | 2024-01-15 |
| [ADR-002](./adr-002-separate-docker-images.md)           | Separate Docker Images for Each Service                    | Accepted               | 2024-01-20 |
| [ADR-003](./adr-003-conversation-tracking.md)            | Conversation Tracking with Message Hashing                 | Accepted               | 2024-02-01 |
| [ADR-004](./adr-004-proxy-authentication.md)             | Proxy-Level Authentication with Domain-Specific API Keys   | Accepted               | 2024-06-25 |
| [ADR-005](./adr-005-token-usage-tracking.md)             | Comprehensive Token Usage Tracking                         | Accepted               | 2024-06-25 |
| [ADR-006](./adr-006-long-running-requests.md)            | Support for Long-Running Requests                          | Accepted               | 2024-06-25 |
| [ADR-007](./adr-007-subtask-tracking.md)                 | Sub-task Detection and Tracking                            | Accepted               | 2024-06-25 |
| [ADR-008](./adr-008-cicd-strategy.md)                    | CI/CD Strategy with GitHub Actions                         | Superseded by ADR-032  | 2024-06-25 |
| [ADR-009](./adr-009-dashboard-architecture.md)           | Dashboard Architecture with HTMX and Server-Side Rendering | Accepted               | 2024-06-25 |
| [ADR-010](./adr-010-docker-cli-integration.md)           | Docker-Based Claude CLI Integration                        | Superseded by ADR-041  | 2024-06-25 |
| ADR-011                                                  | _(Number skipped)_                                         | -                      | -          |
| [ADR-012](./adr-012-database-schema-evolution.md)        | Database Schema Evolution Strategy                         | Accepted               | 2024-06-26 |
| [ADR-013](./adr-013-typescript-project-references.md)    | TypeScript Project References for Monorepo Type Checking   | Accepted & Implemented | 2024-06-27 |
| [ADR-014](./adr-014-sql-query-logging.md)                | SQL Query Logging for Development and Debugging            | Accepted               | 2024-06-30 |
| [ADR-015](./adr-015-subtask-conversation-migration.md)   | Subtask Conversation ID Migration                          | Accepted               | 2025-01-07 |
| [ADR-016](./adr-016-mcp-server-implementation.md)        | MCP Server Implementation                                  | Superseded             | 2024-12-10 |
| [ADR-017](./adr-017-mcp-prompt-sharing.md)               | MCP Prompt Sharing Implementation                          | Accepted & Implemented | 2024-12-10 |
| [ADR-018](./adr-018-ai-powered-conversation-analysis.md) | AI-Powered Conversation Analysis                           | Accepted               | 2025-01-08 |

### Duplicate ADR Numbers (Need Renumbering)

The following ADRs share duplicate numbers and should be renumbered in a future refactoring:

#### ADR-019 Series (10 files)

| File                                                                                           | Title                                            | Status   | Date       |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------- | ---------- |
| [adr-019-ai-analysis-db-refactoring.md](./adr-019-ai-analysis-db-refactoring.md)               | AI Analysis Database Module Refactoring          | Accepted | -          |
| [adr-019-ai-analysis-worker-refactoring.md](./adr-019-ai-analysis-worker-refactoring.md)       | AI Analysis Worker Module Refactoring            | Accepted | -          |
| [adr-019-mcp-proxy-refactoring.md](./adr-019-mcp-proxy-refactoring.md)                         | MCP Proxy Routes Refactoring                     | Accepted | -          |
| [adr-019-remove-redundant-start-dev-script.md](./adr-019-remove-redundant-start-dev-script.md) | Remove Redundant start-dev.sh Script             | Accepted | -          |
| [adr-019-remove-unused-pino-logger.md](./adr-019-remove-unused-pino-logger.md)                 | Remove Unused Pino Logger                        | Accepted | -          |
| [adr-019-remove-unused-type-definitions.md](./adr-019-remove-unused-type-definitions.md)       | Remove Unused Type Definitions                   | Accepted | 2025-01-20 |
| [adr-019-request-context-refactoring.md](./adr-019-request-context-refactoring.md)             | RequestContext Value Object Refactoring          | Accepted | -          |
| [adr-019-shared-types-refactoring.md](./adr-019-shared-types-refactoring.md)                   | Shared Types Refactoring for Type Safety         | Accepted | -          |
| [adr-019-single-composition-root.md](./adr-019-single-composition-root.md)                     | Single Composition Root for Dependency Injection | Accepted | -          |
| [adr-019-test-fixture-refactoring.md](./adr-019-test-fixture-refactoring.md)                   | Test Fixture Refactoring for Subtask Linking     | Accepted | -          |

#### ADR-020 Series (3 files)

| File                                                                                                       | Title                                         | Status   | Date       |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------- | ---------- |
| [adr-020-remove-committed-credentials.md](./adr-020-remove-committed-credentials.md)                       | Remove Committed Credentials from Git History | Accepted | -          |
| [adr-020-shared-logger-grooming.md](./adr-020-shared-logger-grooming.md)                                   | Shared Logger Grooming                        | Accepted | -          |
| [adr-020-typescript-test-configuration-standards.md](./adr-020-typescript-test-configuration-standards.md) | TypeScript Test Configuration Standards       | Accepted | 2025-01-20 |

#### ADR-021 Series (6 files)

| File                                                                                                       | Title                                           | Status   | Date |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------- | ---- |
| [adr-021-credential-example-templates.md](./adr-021-credential-example-templates.md)                       | Credential Example Templates                    | Accepted | -    |
| [adr-021-environment-vars-documentation-refactor.md](./adr-021-environment-vars-documentation-refactor.md) | Environment Variables Documentation Refactoring | Accepted | -    |
| [adr-021-manage-nexus-proxies-refactoring.md](./adr-021-manage-nexus-proxies-refactoring.md)               | Refactoring manage-nexus-proxies.sh Script      | Accepted | -    |
| [adr-021-remove-ghcr-workflow.md](./adr-021-remove-ghcr-workflow.md)                                       | Remove GitHub Container Registry Workflow       | Accepted | -    |
| [adr-021-request-details-refactoring.md](./adr-021-request-details-refactoring.md)                         | Request Details Page Refactoring                | Accepted | -    |
| [adr-021-unified-build-script.md](./adr-021-unified-build-script.md)                                       | Unified Build Script for Dashboard Service      | Accepted | -    |

#### ADR-022 Series (2 files)

| File                                                                               | Title                                                     | Status   | Date |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------- | -------- | ---- |
| [adr-022-documentation-strategy.md](./adr-022-documentation-strategy.md)           | Documentation Strategy - DRY Principle for Technical Docs | Accepted | -    |
| [adr-022-remove-bun-publish-workflow.md](./adr-022-remove-bun-publish-workflow.md) | Remove Bun Publish Workflow                               | Accepted | -    |

#### ADR-023 Series (4 files)

| File                                                                                           | Title                             | Status   | Date |
| ---------------------------------------------------------------------------------------------- | --------------------------------- | -------- | ---- |
| [adr-023-conversation-hash-refactoring.md](./adr-023-conversation-hash-refactoring.md)         | Conversation Hash Refactoring     | Accepted | -    |
| [adr-023-development-guide-refactoring.md](./adr-023-development-guide-refactoring.md)         | Development Guide Refactoring     | Accepted | -    |
| [adr-023-rate-limit-middleware-refactoring.md](./adr-023-rate-limit-middleware-refactoring.md) | Rate Limit Middleware Refactoring | Accepted | -    |
| [adr-023-token-tracker-refactoring.md](./adr-023-token-tracker-refactoring.md)                 | Token Tracker Refactoring         | Accepted | -    |

### Continuing Sequential ADRs

| ADR                                                                    | Title                                                        | Status                 | Date       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------- | ---------- |
| [ADR-024](./adr-024-logger-refactoring.md)                             | Logger Refactoring                                           | Accepted               | -          |
| [ADR-025](./adr-025-gitignore-refactoring.md)                          | GitIgnore File Refactoring                                   | Implemented            | -          |
| [ADR-026](./adr-026-tsconfig-base-separation.md)                       | TypeScript Base Configuration Separation                     | Accepted               | -          |
| [ADR-027](./adr-027-ops-documentation-refactoring.md)                  | Operations Documentation Refactoring                         | Accepted               | -          |
| [ADR-028](./adr-028-request-id-middleware-consolidation.md)            | Request ID Middleware Consolidation                          | Accepted               | 2025-01-20 |
| [ADR-029](./adr-029-credential-status-service-refactoring.md)          | CredentialStatusService Refactoring                          | Accepted               | -          |
| [ADR-030](./adr-030-container-refactoring.md)                          | Container Refactoring - Production-Ready DI Implementation   | Accepted               | 2025-01-20 |
| [ADR-031](./adr-031-dashboard-container-refactoring.md)                | Dashboard Container Refactoring - Optional Database Support  | Accepted               | 2025-01-20 |
| [ADR-032](./adr-032-cicd-workflow-consolidation.md)                    | CI/CD Workflow Consolidation and Optimization                | Accepted               | -          |
| [ADR-033](./adr-033-code-quality-yml-grooming-resolution.md)           | Code Quality YAML Grooming Resolution                        | Accepted               | 2025-01-20 |
| [ADR-034](./adr-034-installation-guide-refactoring.md)                 | Installation Guide Refactoring                               | Unknown                | 2025-01-20 |
| [ADR-035](./adr-035-features-documentation-refactoring.md)             | Features Documentation Refactoring                           | Accepted               | -          |
| [ADR-036](./adr-036-quickstart-removal.md)                             | Quick Start Guide Removal                                    | Unknown                | 2025-01-21 |
| [ADR-037](./adr-037-architecture-overview-refactoring.md)              | Architecture Overview Documentation Refactoring              | Accepted               | -          |
| [ADR-038](./adr-038-api-schemas-refactoring.md)                        | API Schemas Documentation Refactoring                        | Unknown                | 2025-01-21 |
| [ADR-039](./adr-039-dashboard-guide-refactoring.md)                    | Dashboard Guide Refactoring                                  | Accepted               | 2025-01-21 |
| [ADR-040](./adr-040-api-reference-refactoring.md)                      | API Reference Documentation Refactoring                      | Implemented            | 2025-01-21 |
| [ADR-041](./adr-041-claude-cli-docker-image.md)                        | Claude CLI Docker Image Addition                             | Accepted               | 2025-01-21 |
| [ADR-042](./adr-042-adr-001-monorepo-structure-grooming.md)            | ADR-001 Monorepo Structure Documentation Update              | Accepted               | 2025-01-21 |
| [ADR-043](./adr-043-remove-future-decisions-adr.md)                    | Remove Future Decisions ADR                                  | Accepted               | 2025-01-21 |
| [ADR-044](./adr-044-subtask-query-executor-pattern.md)                 | SubtaskQueryExecutor Pattern for Task Detection              | Accepted               | 2025-01-21 |
| [ADR-045](./adr-045-adr-014-renumbering-resolution.md)                 | ADR-014 Renumbering Resolution                               | Accepted               | 2025-01-21 |
| [ADR-046](./adr-046-adr-006-long-running-requests-grooming.md)         | ADR-006 Long-Running Requests Grooming                       | Accepted               | -          |
| [ADR-047](./adr-047-adr-008-cicd-strategy-grooming.md)                 | ADR-008 CI/CD Strategy Grooming                              | Accepted               | -          |
| [ADR-048](./adr-048-adr-013-typescript-project-references-grooming.md) | ADR-013 TypeScript Project References Documentation Grooming | Accepted & Implemented | 2024-06-26 |
| [ADR-049](./adr-049-adr-readme-grooming.md)                            | ADR README Grooming and Duplicate Number Resolution          | Accepted               | 2025-07-21 |

## Important Notice: ADR Numbering

There is currently a numbering collision issue with ADRs 019-023, where multiple ADRs share the same number. These should be renumbered in a future refactoring to maintain unique ADR identifiers. For now, they are listed with their full filenames to distinguish them.

## Creating a New ADR

1. Copy the template from `template.md`
2. Name it `adr-XXX-brief-description.md` where XXX is the next sequential number (currently 050)
3. Fill in all sections
4. Update this README with the new ADR
5. Submit PR for review

**Note**: Before creating a new ADR, check the directory to ensure you're using the next available number to avoid further numbering collisions.

## Reviewing ADRs

When reviewing an ADR, consider:

- Is the context clearly explained?
- Are alternatives considered?
- Are trade-offs documented?
- Are the consequences realistic?
- Is the decision actionable?

## Superseding ADRs

When an ADR is superseded:

1. Update the original ADR status to "Superseded by ADR-XXX"
2. Link to the new ADR
3. Explain in the new ADR why the original decision is being changed

## References

- [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) by Michael Nygard
- [ADR Tools](https://github.com/npryce/adr-tools)
- [MADR](https://adr.github.io/madr/) - Markdown Architectural Decision Records
