# ADR-061: Examples Credentials Directory Removal

## Status

Accepted

## Context

During the file grooming sprint on 2025-01-21, a task was created to groom the file `examples/credentials/oauth.json`. Upon investigation, it was discovered that:

1. The file `examples/credentials/oauth.json` does not exist in the project
2. There is no `examples/` directory at the project root level
3. The OAuth credential example is properly located in `credentials/example.com.credentials.json`
4. The API key credential example is properly located in `credentials/example-api-key.com.credentials.json`
5. Both example files are well-documented in `credentials/README.md`

This suggests that either:

- The `examples/credentials/` directory was already removed in a previous grooming session
- The file path was a typo or misunderstanding
- The examples were always intended to be in the `credentials/` directory directly

## Decision

No action is required as the current structure is correct:

1. Example credential files are appropriately placed in the `credentials/` directory
2. The naming convention (`example.com.credentials.json` and `example-api-key.com.credentials.json`) clearly identifies them as examples
3. The `credentials/README.md` provides comprehensive documentation for both OAuth and API key authentication
4. Having examples in the same directory as actual credentials makes them more discoverable for developers

## Consequences

### Positive

- Maintains a clean project structure without unnecessary nested directories
- Examples are easily discoverable alongside actual credential files
- Consistent with the project's existing organization
- No redundant example files in multiple locations

### Negative

- None identified

## References

- [ADR-021: Credential Example Templates](adr-021-credential-example-templates.md) - Documents the decision to use clear placeholder values in credential templates
- `credentials/README.md` - Contains comprehensive documentation for credential file formats and usage
