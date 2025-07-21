# ADR-056: Remove Unused .dev.vars.example File

## Status

Accepted (2025-01-21)

## Context

During code grooming, we discovered a `.dev.vars.example` file in the project root that:

- Contains configuration examples for OpenRouter API, proxy settings, and model configurations
- Uses Cloudflare Workers/Wrangler convention (`.dev.vars` files)
- Is not referenced anywhere in the codebase
- Contains configurations unrelated to Claude Nexus Proxy (mentions OpenRouter, DeepSeek models)
- Conflicts with the project's established configuration system using `.env` files

## Decision

Remove the `.dev.vars.example` file entirely from the repository.

## Rationale

1. **Wrong Technology Stack**: The file uses Cloudflare Workers conventions while Claude Nexus Proxy is built with Bun/Hono
2. **Creates Confusion**: Developers might waste time trying to understand or use this irrelevant configuration
3. **Not Referenced**: No code in the project uses or references this file
4. **Misleading Content**: References to OpenRouter and DeepSeek models are unrelated to Claude Nexus Proxy
5. **Redundant**: The project already has a comprehensive `.env.example` file with 239 lines of well-documented configuration options

## Consequences

### Positive

- Eliminates confusion for new developers
- Maintains single source of truth for configuration (`.env.example`)
- Reduces technical debt by removing unused files
- Enforces consistency in configuration approach

### Negative

- None identified

## Implementation

Simple deletion via `git rm .dev.vars.example`

## References

- Grooming log: file-grooming-07-18 branch
- Consensus validation: Gemini 2.5 Pro (10/10 confidence for deletion)
