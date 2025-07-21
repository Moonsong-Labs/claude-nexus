# ADR-013: TypeScript Project References for Monorepo Type Checking

## Status

Accepted and Implemented

## Context

The Claude Nexus Proxy monorepo has been experiencing persistent type checking issues related to circular dependencies between packages. The shared package (`@claude-nexus/shared`) needs to be built before the services can type check, but the standard `tsc --noEmit` approach doesn't handle this dependency ordering well.

The issue manifests as "Cannot find module '@claude-nexus/shared' or its corresponding type declarations" errors during type checking, even though the code compiles and runs correctly with Bun. This creates friction during development and CI/CD processes.

## Decision Drivers

- **Developer Experience**: Type checking should work reliably without manual intervention
- **CI/CD Reliability**: Automated type checking must pass consistently
- **Build Performance**: Solution should not significantly slow down the build process
- **Bun Compatibility**: Must work within Bun's ecosystem and limitations
- **Monorepo Structure**: Solution must respect the existing workspace structure

## Considered Options

1. **Option 1: Remove Type Checking Entirely**
   - Description: Remove all typecheck scripts and rely on runtime errors
   - Pros: No more type checking errors, simpler build process
   - Cons: Loss of type safety, more runtime errors, reduced code quality

2. **Option 2: Manual Build Ordering**
   - Description: Always build shared package before running type checks
   - Pros: Works with current setup, no major changes needed
   - Cons: Requires manual steps, easy to forget, doesn't scale well

3. **Option 3: TypeScript Project References**
   - Description: Use TypeScript's built-in project references feature
   - Pros: Automatic dependency ordering, incremental builds, proper monorepo support
   - Cons: Requires configuration changes, slight learning curve

4. **Option 4: Alternative Import Methods**
   - Description: Use path aliases or different import strategies
   - Pros: Might avoid the circular dependency
   - Cons: Doesn't address root cause, may break other tooling

## Decision

We will implement **TypeScript Project References** to properly handle the monorepo structure and dependencies between packages.

### Implementation Details

1. **Update tsconfig.json files to use composite projects:**

```json
// Root tsconfig.json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "noEmit": true,
    "allowImportingTsExtensions": true // Bun feature, safe with noEmit
  },
  "files": [], // No source files at root
  "references": [
    { "path": "./packages/shared" },
    { "path": "./services/dashboard" },
    { "path": "./services/proxy" }
  ]
}
```

2. **Enable declaration generation in all projects:**

```json
// packages/shared/tsconfig.json example
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "noEmit": false // Override base to allow emit for project references
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "src/**/*.test.ts"]
}
```

3. **Update typecheck scripts to use build mode:**

```json
// package.json
{
  "scripts": {
    "typecheck": "tsc --build",
    "typecheck:proxy": "tsc --build services/proxy",
    "typecheck:dashboard": "tsc --build services/dashboard",
    "build:shared": "tsc --build packages/shared"
  }
}
```

**Initial Setup Note**: After implementing project references, developers need to run `bun run build:shared` or `npx tsc --build` once to generate the initial declaration files. This is only required for the first build after switching to project references.

## Consequences

### Positive

- **Automatic Dependency Resolution**: TypeScript handles build order automatically
- **Incremental Builds**: Only changed files are recompiled, improving performance
- **Better IDE Support**: Project references improve cross-package IntelliSense
- **Proper Monorepo Support**: Designed specifically for this use case
- **No Manual Steps**: Developers don't need to remember build order

### Negative

- **Declaration Files Required**: Must generate .d.ts files (small disk usage)
- **Initial Build Time**: First build is slower as it generates declarations
- **Configuration Complexity**: Slightly more complex tsconfig setup

### Risks and Mitigations

- **Risk**: Bun might not fully support all TypeScript features
  - **Mitigation**: We're using standard TypeScript features that work with Bun's tsc wrapper

- **Risk**: Build artifacts might interfere with Bun's runtime
  - **Mitigation**: Continue using Bun for runtime, TypeScript only for type checking

## Links

- [TypeScript Project References Documentation](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [ADR-001: Monorepo Structure](./adr-001-monorepo-structure.md)
- [ADR-026: TypeScript Base Configuration Separation](./adr-026-tsconfig-base-separation.md)

## Notes

This change maintains compatibility with Bun's runtime while leveraging TypeScript's built-in features for better monorepo support. The solution was recommended through a consensus workflow with multiple AI models, all of which strongly endorsed this approach over alternatives like removing type checking entirely.

## Amendments

- **2025-07-21**: Document groomed to fix broken links, update code examples to match actual implementation, consolidate redundant information, and clarify implementation status. No architectural changes were made.

---

Date: 2025-06-27  
Authors: Claude Assistant, crystalin
