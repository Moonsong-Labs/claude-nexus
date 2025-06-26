# Changelog

All notable changes to Claude Nexus Proxy will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Conversation branching visualization in dashboard
- Message count tracking at database level for performance
- Branch-specific statistics in conversation view
- Database backup script with timestamp support
- Comprehensive migration system with TypeScript support

### Changed

- Improved conversation tree rendering with squared arrows for branches
- Optimized dashboard queries using message_count column
- Reorganized scripts into categorized subdirectories
- Consolidated documentation into organized docs/ folder
- Updated request information display for better density

### Fixed

- Branch parent resolution for conversations with hash collisions
- Conversation tree pointing to incorrect parent requests
- Message count display showing 0 for existing conversations
- Conversation UI now properly displays messages with multiple tool_use or tool_result blocks

## [2.0.0] - 2024-01-15

### Added

- Monorepo structure with separate proxy and dashboard services
- Real-time dashboard with SSE updates
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

- Node.js dependency (now Bun-only)
- Single container deployment (now uses separate containers)

## [1.0.0] - 2023-12-01

### Added

- Initial proxy implementation
- Basic request forwarding to Claude API
- Simple logging and monitoring
- Docker support
- Environment-based configuration

---

_For detailed migration guides between versions, see [docs/MIGRATION.md](docs/MIGRATION.md)_
