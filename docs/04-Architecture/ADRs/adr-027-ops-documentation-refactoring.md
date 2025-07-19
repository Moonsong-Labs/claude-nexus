# ADR-027: Operations Documentation Refactoring

## Status

Accepted

## Context

The `scripts/ops/README.md` file contained detailed documentation for operational scripts (`manage-nexus-proxies.sh` and `update-proxy.sh`). However:

1. The scripts already have built-in help/usage information
2. This created duplicate documentation that could drift out of sync
3. Operations documentation was scattered rather than centralized in the docs structure
4. The file location (`scripts/ops/`) was not where users would naturally look for documentation

## Decision

We will:

1. Move the detailed operational documentation to `docs/03-Operations/deployment/ops-scripts.md`
2. Replace `scripts/ops/README.md` with a minimal pointer to the centralized documentation
3. Remove duplicate information that exists in script help text
4. Add value-added sections like prerequisites, troubleshooting, and common workflows

## Rationale

- **DRY Principle**: Eliminates documentation duplication between README and script help
- **Discoverability**: Places documentation where users expect to find it (`docs/`)
- **Maintainability**: Single source of truth prevents documentation drift
- **Value Addition**: Focus on information that complements rather than duplicates script help

## Consequences

### Positive

- Reduced maintenance burden (no duplicate documentation to keep in sync)
- Better organization of operational documentation
- Clear separation between code (scripts) and documentation
- Enhanced documentation with troubleshooting and prerequisites

### Negative

- Users browsing the `scripts/ops/` directory need to follow a link to find detailed docs
- Requires users to know about the centralized documentation structure

### Mitigation

- Clear pointer in `scripts/ops/README.md` directs users to the right location
- Scripts maintain their built-in help for quick reference
