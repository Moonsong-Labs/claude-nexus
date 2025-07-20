# ADR-020: TypeScript Test Configuration Standards

## Status

Accepted

## Context

During the file grooming sprint (July 20, 2025), we identified inconsistencies in TypeScript test configuration files across the monorepo. Both `services/proxy/tsconfig.test.json` and `services/dashboard/tsconfig.test.json` were missing standard configuration options:

- Missing `compilerOptions` with `noEmit: true`
- Empty `exclude` array instead of properly excluding directories

## Decision

We standardized all `tsconfig.test.json` files to follow TypeScript best practices for test configurations:

1. **Add `noEmit: true`**: Prevents TypeScript compiler from generating JavaScript files for tests, as test runners handle transpilation in memory
2. **Exclude standard directories**: Explicitly exclude `node_modules` and `dist` directories to improve performance and prevent scanning unnecessary files

## Consequences

### Positive

- **Consistency**: All test configurations now follow the same pattern across the monorepo
- **Performance**: IDE and TypeScript compiler performance improved by not scanning excluded directories
- **Correctness**: Tests won't accidentally generate output files during type checking
- **Developer Experience**: Better tooling integration with VS Code and other IDEs

### Negative

- None identified - this is a standard best practice with no downsides

## Implementation

Updated both `services/proxy/tsconfig.test.json` and `services/dashboard/tsconfig.test.json` to:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": [
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
    "src/**/__tests__/**/*",
    "tests/**/*.test.ts"
  ],
  "exclude": ["node_modules", "dist"]
}
```

## References

- TypeScript documentation on project configuration
- Validated with Gemini 2.5 Pro (10/10 confidence score)
- Confirmed compatibility with Bun test runner
