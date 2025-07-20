# ADR-019: Shared Types Refactoring for Type Safety

Date: 2025-01-20

## Status

Accepted

## Context

The `packages/shared/src/types/context.ts` file defines TypeScript types for Hono framework context variables and environment bindings used throughout the proxy service. During a code grooming sprint, several issues were identified:

1. **Excessive use of `any` types**: The file contained multiple instances of `any` type usage, defeating TypeScript's type safety benefits
2. **Incomplete environment variables**: Only 3 environment variables were defined in `HonoBindings`, while the project uses over 40
3. **Minimal interfaces lacking proper typing**: The `MinimalPool` interface used `any` types for all methods
4. **Inconsistent documentation**: Some properties had JSDoc comments while others didn't

## Decision

We decided to refactor the context types file with the following changes:

1. **Replace `any` types with proper types**:
   - Import `Pool` type from `pg` package and remove the `MinimalPool` interface
   - Make `HonoVariables` generic with `ValidatedBody` parameter (defaulting to `unknown`)
   - Import proper Cloudflare types (`KVNamespace`, `DurableObjectNamespace`, `Queue`) from `@cloudflare/workers-types`
   - Change `slack?: Record<string, any>` to `Record<string, unknown>` in `MinimalCredential`

2. **Add all environment variables**: Include all 40+ environment variables documented in CLAUDE.md, organized into logical groups

3. **Improve documentation**: Add consistent JSDoc comments for all properties with descriptions and default values

## Implementation Details

### Dependencies Added

Added as `devDependencies` to `packages/shared/package.json`:

- `@types/pg`: ^8.15.4
- `@cloudflare/workers-types`: ^4.20250719.0

These are type-only dependencies that don't affect the runtime bundle.

### Type Changes

1. **HonoVariables** is now generic:

```typescript
export type HonoVariables<ValidatedBody = unknown> = {
  // ...
  validatedBody?: ValidatedBody
  // ...
}
```

2. **MinimalPool** interface was removed in favor of importing the actual `Pool` type from `pg`

3. **HonoBindings** now includes all environment variables organized into sections:
   - Database
   - Authentication & Security
   - Storage & Database
   - Performance & Timeouts
   - Debugging & Development
   - Integrations
   - AI Analysis Worker
   - MCP Server
   - Server Configuration
   - Cloudflare Bindings

## Consequences

### Positive

- **Improved type safety**: No more `any` types means better compile-time error detection
- **Better developer experience**: Full environment variable typing with JSDoc documentation
- **Maintainability**: Organized environment variables make it easier to find and update configurations
- **Future-proof**: Generic `ValidatedBody` allows different routes to specify their expected body types

### Negative

- **Additional dependencies**: Added two dev dependencies (though they don't affect runtime)
- **Larger type definition**: The file is now significantly longer due to all environment variables

### Neutral

- **Breaking change potential**: Making `HonoVariables` generic could be breaking, but we provided a default value (`unknown`) to maintain backward compatibility

## Notes

The refactoring was validated with Gemini-2.5-pro, which provided excellent suggestions including:

- Using type-only imports to avoid runtime dependencies
- Making the type generic for flexibility
- Keeping environment variables flat to match Hono's runtime behavior
- Using `unknown` instead of `any` for better type safety

All tests passed after the refactoring, and the package builds successfully.
