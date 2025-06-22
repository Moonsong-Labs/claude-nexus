# AI-Driven E2E Testing

This directory contains the AI-driven end-to-end testing infrastructure for Claude Nexus Proxy. It uses Claude to automatically generate and execute comprehensive test cases during development and CI/CD.

## Purpose

This is a **development and testing tool**, not a production service. It helps:
- Generate creative test cases that developers might miss
- Find edge cases and potential security issues
- Validate API behavior comprehensively
- Improve test coverage through AI assistance

## Structure

```
e2e-ai/
├── lib/              # Test runner and client libraries
├── test/             # Test files (deterministic + AI-generated)
├── scripts/          # Utility scripts (database seeding, etc.)
├── artifacts/        # Generated test cases and results
├── Dockerfile        # Container configuration
├── package.json      # Dependencies
└── vitest.config.ts  # Test runner configuration
```

## Usage

### Running Tests Locally

```bash
# One-time setup
./scripts/setup-claude-testing.sh

# Run AI tests with Docker
./docker-up.sh --profile testing up

# Or from docker directory
cd docker && docker compose --profile testing up
```

### Test Modes

- **Generate Mode** (default): Creates new test cases using Claude
- **Replay Mode**: Re-runs previously generated test cases

```bash
# Replay specific test suite
TEST_MODE=replay REPLAY_SUITE_ID=abc123 docker compose --profile testing up
```

## Important Notes

- This service only runs when the `testing` profile is active
- It requires Anthropic API credentials
- Test artifacts are stored locally and not committed to git
- See [docs/AI_TESTING.md](../../docs/AI_TESTING.md) for detailed documentation