# ADR-019: Remove Redundant start-dev.sh Script

## Status

Accepted

## Context

During code grooming for production readiness, we identified a `start-dev.sh` script at the project root that duplicated functionality already provided by the standard `bun run dev` command defined in `package.json`.

### Issues with start-dev.sh:

1. **Redundancy**: Duplicated the functionality of `bun run dev` which uses concurrently to run both services
2. **Platform-specific**: Used `lsof` command which is not available on all platforms (e.g., Windows)
3. **Missing environment loading**: Unlike scripts in `scripts/dev/`, it didn't load the root `.env` file
4. **Hardcoded values**: Ports 3000 and 3001 were hardcoded without checking configuration
5. **Race conditions**: Used fixed sleep timers instead of proper health check polling
6. **Inconsistent location**: Located at root instead of `scripts/dev/` directory
7. **No documentation**: Not referenced anywhere in the project documentation

## Decision

Delete the `start-dev.sh` script entirely and rely on the existing `bun run dev` command.

## Consequences

### Positive

- **Single source of truth**: All development commands are centralized in `package.json`
- **Cross-platform compatibility**: The `concurrently` package handles process management in a platform-agnostic way
- **Consistency**: Follows standard Node.js/Bun project patterns
- **Reduced maintenance**: One less script to maintain and keep in sync
- **Better developer experience**: New developers can use familiar `bun run dev` pattern

### Negative

- None identified. The functionality is fully covered by existing npm scripts.

## Alternatives Considered

1. **Refactor the script**: We could have updated it to fix the issues, but this would perpetuate having two ways to start the development environment.

2. **Move to scripts/dev/**: We could have moved it to the proper location and fixed the issues, but the functionality would still be redundant.

3. **Add port-killing to package.json**: If port conflicts become an issue, we can add cross-platform port-killing using tools like `kill-port` directly to the npm script.

## Implementation Notes

- Verified that `bun run dev` works correctly without any functionality loss
- Confirmed no references to `start-dev.sh` exist in documentation
- The existing `bun run dev` command properly loads environment variables and handles process management

## References

- Grooming discussion with Gemini 2.5 Pro and O3-mini AI models confirmed this approach follows best practices
- Standard Node.js project structure guidelines recommend using npm/package scripts over custom shell scripts
