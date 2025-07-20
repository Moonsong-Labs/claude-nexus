# ADR-021: Unified Build Script for Dashboard Service

## Status

Accepted

## Context

The dashboard service had two separate build scripts:

- `build-bun.ts` - A simple 36-line script for basic builds
- `build-production.ts` - A comprehensive 140-line script with production optimizations

This duplication led to:

- Maintenance burden (changes needed in two places)
- Feature drift (build-bun.ts lacked source maps, better error handling, size reporting)
- Developer confusion about which script to use
- Generated TypeScript declaration files in version control

## Decision

Consolidate both build scripts into a single `build.ts` with a `--dev` flag to control build optimizations.

### Changes Made:

1. Removed `build-bun.ts` and its generated .d.ts files
2. Renamed `build-production.ts` to `build.ts`
3. Added `--dev` flag support for development builds
4. Updated package.json scripts:
   - `build` - Production build (default)
   - `build:dev` - Development build with --dev flag
   - `build:production` - Alias for production build

### Development vs Production Features:

- **Development Mode (`--dev`)**:
  - No minification (faster builds)
  - Inline source maps for easier debugging
  - Simple package.json copy
  - Skips prompt asset generation
  - No size reporting

- **Production Mode (default)**:
  - Code minification
  - External source maps
  - Minimal production package.json
  - Entry point wrapper
  - Public asset copying
  - Build size reporting
  - Prompt asset generation

## Consequences

### Positive:

- Single source of truth for build logic
- Consistent build behavior across environments
- Reduced maintenance burden
- Clear developer experience with intuitive flags
- Better adherence to DRY principles
- No more generated files in version control

### Negative:

- Slightly more complex script with conditional logic
- Need to understand flag usage

### Migration:

- Developers using `bun run build` get production builds (unchanged)
- Developers wanting faster dev builds use `bun run build:dev`
- CI/CD pipelines continue to work with existing commands

## References

- Related discussion with AI models validated this approach
- Follows standard build tool patterns (webpack, vite, etc.)
