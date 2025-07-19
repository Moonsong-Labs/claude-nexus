# ADR-020: Remove Committed Credentials from Git History

## Status

Accepted

## Context

During file grooming on 2025-01-19, a critical security issue was discovered:

- The file `client-setup/.credentials.json` containing real OAuth credentials (access token, refresh token) was found in the repository
- The file was committed to git history on June 13, 2025 (commit d88479428b8ef50ec19445c29474cc5c0c9a8045)
- The credentials appear to be test/example tokens but were committed to a public repository

## Decision

1. Remove the `.credentials.json` file from the working directory
2. Add `client-setup/.credentials.json` to `.gitignore` to prevent future commits
3. Create a `.credentials.json.example` file with placeholder values
4. Update documentation to guide users on creating their own credentials file
5. **CRITICAL**: The exposed credentials must be revoked immediately if they are real
6. **FUTURE ACTION**: The git history should be rewritten to remove the sensitive data using `git-filter-repo`

## Consequences

### Positive

- Prevents future accidental commits of sensitive credentials
- Provides clear guidance for users through example files
- Follows security best practices for handling sensitive configuration

### Negative

- Git history still contains the sensitive data until rewritten
- Any forks or clones of the repository may have the exposed credentials

### Security Actions Required

1. **Immediate**: Revoke the exposed OAuth tokens if they are real credentials
2. **High Priority**: Rewrite git history to remove the sensitive data permanently
3. **Audit**: Check for any other sensitive files that may have been committed

## Implementation

The following changes were made:

- Deleted `client-setup/.credentials.json`
- Added entry to `.gitignore`
- Created `client-setup/.credentials.json.example` with placeholder values
- Updated `client-setup/README.md` with instructions

## References

- [GitHub: Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [git-filter-repo documentation](https://github.com/newren/git-filter-repo)
