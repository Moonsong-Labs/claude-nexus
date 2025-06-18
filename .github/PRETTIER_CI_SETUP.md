# Prettier CI/CD Setup

This document explains the Prettier integration with GitHub Actions.

## Workflows

### 1. Main CI Workflow (`.github/workflows/ci.yml`)

- **Added**: Format check step before building
- **Purpose**: Ensures all code is properly formatted before merging

### 2. Code Quality Workflow (`.github/workflows/code-quality.yml`)

- **New workflow**: Dedicated to code quality checks
- **Jobs**:
  - `format-check`: Verifies Prettier formatting
  - `type-check`: Runs TypeScript type checking
  - `precommit-check`: Runs full precommit validation
  - `lint-check`: ESLint (optional, continues on error)

### 3. Auto-Format Workflow (`.github/workflows/auto-format.yml`)

- **New workflow**: Automatically formats code in PRs
- **Features**:
  - Only runs on PRs from the same repository (not forks)
  - Commits formatted changes back to the PR
  - Comments on the PR when changes are made
- **Security**: Uses built-in GITHUB_TOKEN, no additional secrets needed

## Status Badges

Added to README.md:

- CI Status: Shows build/test status
- Code Quality: Shows format/type check status

## Usage

### For Contributors

1. **Before committing**: Run `bun run format` locally
2. **Pre-commit check**: Run `bun run precommit`
3. **VS Code**: Will auto-format on save with Prettier extension

### For Maintainers

1. **PRs from forks**: Manual format check only
2. **PRs from repo**: Auto-format will fix issues
3. **Failed checks**: Ask contributors to run `bun run format`

## Benefits

1. **Consistent code style** - Enforced in CI
2. **No manual reviews for formatting** - Automated checks
3. **Auto-fix capability** - PRs can be auto-formatted
4. **Clear feedback** - Status badges and PR comments

## Troubleshooting

### Format Check Fails

```bash
# See what needs formatting
bun run format:check

# Fix all issues
bun run format
```

### Auto-format Not Working

- Only works on PRs from the same repository
- Fork PRs need manual formatting for security

### Disable Auto-format

Comment in PR: `/skip-format` (if implemented)
