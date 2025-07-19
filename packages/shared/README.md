# Claude Nexus Shared Package

Shared types, configurations, and utilities used by both proxy and dashboard services.

## Overview

This package provides a centralized collection of common code shared across the Claude Nexus monorepo, ensuring consistency and reducing duplication. All modules are accessible through three well-defined entry points.

## Installation

Within the monorepo, this package is automatically available through the workspace configuration.

## Usage

### Main Export

The main entry point provides all shared utilities, types, constants, and error classes:

```typescript
import {
  // Configuration
  config,
  validateConfig,

  // Types
  ClaudeMessagesRequest,
  ApiRequest,

  // Logger
  logger,

  // Validation utilities
  isValidUUID,
  maskSensitiveData,
  uuidSchema,

  // Constants
  MODEL_TOKEN_LIMITS,

  // Error utilities
  ProxyError,
  createErrorResponse,

  // Conversation utilities
  ConversationLinker,
  generateMessageHash,
} from '@claude-nexus/shared'
```

### Types Export

For TypeScript types and interfaces only:

```typescript
import type {
  ClaudeRequest,
  ClaudeResponse,
  ApiRequest,
  ConversationAnalysis,
} from '@claude-nexus/shared/types'
```

### Config Export

For configuration management:

```typescript
import { config, validateConfig } from '@claude-nexus/shared/config'

const apiKey = config.ANTHROPIC_API_KEY
const isValid = validateConfig()
```

## Available Modules

All of the following modules are accessible through the main export:

- **Types** - Claude API types, context types, error types, and AI analysis types
- **Configuration** - Centralized configuration management with validation
- **Logger** - Shared logging instance with data masking
- **Validation** - Comprehensive validation utilities (see [utils/README.md](src/utils/README.md))
- **Constants** - Model token limits and other shared constants
- **Error Utilities** - Custom error classes and error response helpers
- **Conversation Utilities** - Message hashing, conversation linking, and subtask detection
- **Validators** - Claude API request/response validators
- **Prompts** - AI analysis prompt templates and truncation utilities

## Development

```bash
# Build the package
bun run build

# Type checking
bun run typecheck

# Watch for changes (development mode)
bun run watch
```

## Testing

Tests are run as part of the monorepo test suite:

```bash
# From the root of the monorepo
bun test packages/shared/src/**/__tests__
```

## TypeScript Configuration

This package uses TypeScript Project References for proper dependency management within the monorepo. The build process automatically generates declaration files and handles cross-package imports correctly.

## Build Output

The package builds to `dist/` with:

- ES modules (ESM) format only (as specified by `"type": "module"`)
- TypeScript declarations
- Source maps for debugging
