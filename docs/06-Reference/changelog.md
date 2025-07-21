# Changelog

<!--
Thank you for contributing to the changelog!

Please add all user-facing changes to the `[Unreleased]` section under the
appropriate heading (`Added`, `Changed`, `Fixed`, `Removed`, `Security`, `Breaking Changes`, `Deprecated`).

Keep entries concise and focused on the value to the user. Avoid implementation
details or internal jargon. Link to relevant ADRs or documentation where helpful.

Example:
- Real-time dashboard with SSE updates (see [ADR-005](../04-Architecture/ADRs/adr-005-xxx.md))

When cutting a new release:
1. Create a new version section: ## [X.Y.Z] - YYYY-MM-DD
2. Move relevant changes from [Unreleased] to the new version
3. Clear the [Unreleased] section for new changes
4. Update version links if using GitHub compare URLs
-->

All notable changes to Claude Nexus Proxy will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **AI-Powered Conversation Analysis**: Automated analysis of conversations with security features including PII redaction, rate limiting, and prompt injection protection (see [ADR-018](../04-Architecture/ADRs/adr-018-ai-powered-conversation-analysis.md))
- **Enhanced Dashboard Visualizations**: Conversation branching with visual indicators and branch-specific statistics
- **Database Management Improvements**: TypeScript-based migration system and timestamped backup utilities
- **Performance Optimizations**: Database-level message count tracking for faster dashboard queries

### Changed

- Improved conversation tree rendering with clearer visual indicators for branches
- Reorganized project structure: scripts categorized into subdirectories, documentation consolidated into `docs/` folder
- Enhanced request information display for better information density

### Fixed

- Conversation branch linking with hash collisions now resolves correctly
- Message count display for existing conversations
- Conversation UI correctly renders and deduplicates multiple `tool_use` or `tool_result` blocks
- System reminder text properly filtered from conversation display

## [2.0.0] - 2024-01-15

### Breaking Changes

- **Runtime Migration**: Project now requires Bun runtime; Node.js is no longer supported
- **Architecture Change**: Migrated from single service to microservices - deployment now requires separate containers for proxy and dashboard services

### Added

- Monorepo structure with separate proxy and dashboard services
- Real-time dashboard with Server-Sent Events (SSE) updates
- Conversation tracking with automatic message threading
- OAuth support with automatic token refresh
- Docker support with optimized separate images
- Comprehensive token usage tracking
- Branch detection for conversation forks

### Changed

- Complete rewrite using Bun runtime
- Migrated from single service to microservices architecture
- Improved streaming response handling
- Enhanced security with client API keys

### Removed

- Node.js dependency
- Single container deployment option

## [1.0.0] - 2023-12-01

### Added

- Initial proxy implementation
- Basic request forwarding to Claude API
- Simple logging and monitoring
- Docker support
- Environment-based configuration
