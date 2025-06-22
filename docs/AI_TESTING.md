# AI-Driven End-to-End Testing

This document describes the AI-driven testing infrastructure for Claude Nexus Proxy, which uses Claude to automatically generate and execute comprehensive test cases.

## Overview

The AI testing system leverages Claude's capabilities to:

- Generate creative test cases that human testers might miss
- Find edge cases and potential security issues
- Validate API behavior against expected patterns
- Provide repeatable test execution through artifact storage

## Architecture

### Components

1. **Claude Testing Service** (`services/claude-testing/`)

   - Dedicated Docker container for running AI-generated tests
   - Built with Bun, Vitest, and Anthropic SDK
   - Supports both test generation and replay modes

2. **Test Runner** (`lib/test-runner.ts`)

   - Manages communication with Claude API
   - Generates test cases based on prompts
   - Stores test artifacts for replay

3. **Proxy Client** (`lib/proxy-client.ts`)
   - Handles API requests to the proxy service
   - Validates responses against schemas
   - Manages authentication

## Setup

### Prerequisites

- Docker and Docker Compose
- Anthropic API key
- Bun runtime (for local development)

### Initial Setup

1. Set your Anthropic API key:

   ```bash
   export ANTHROPIC_API_KEY="your-anthropic-api-key"
   ```

2. Run the setup script:

   ```bash
   ./scripts/setup-claude-testing.sh
   ```

3. This creates:
   - Secret files for API keys
   - Test domain credentials
   - Claude CLI configuration

## Running Tests

### Local Testing

Run AI-driven tests locally using Docker Compose:

```bash
# From project root
./docker-up.sh --profile testing up

# Or from docker directory
cd docker && docker compose --profile testing up
```

### Test Modes

#### Generate Mode (Default)

Generates new test cases using Claude:

```bash
TEST_MODE=generate docker compose --profile testing up
```

#### Replay Mode

Re-runs previously generated test cases:

```bash
TEST_MODE=replay REPLAY_SUITE_ID=abc123 docker compose --profile testing up
```

## CI/CD Integration

### GitHub Actions Workflow

The project includes a dedicated workflow for AI-driven tests:

- **File**: `.github/workflows/generative-tests.yml`
- **Schedule**: Runs nightly at 2 AM UTC
- **Manual trigger**: Can be run on-demand via workflow dispatch

### Workflow Features

1. **Non-blocking**: Tests run with `continue-on-error: true`
2. **Artifact storage**: Test results and generated cases are saved
3. **Issue creation**: Automatic issue creation on nightly failures
4. **Replay support**: Can re-run specific test suites

## Test Strategy

### Hybrid Approach

The system uses a hybrid testing strategy:

1. **Deterministic Tests** (`test/deterministic.test.ts`)

   - Traditional unit/integration tests
   - Predictable, repeatable results
   - Core functionality validation

2. **Generative Tests** (`test/proxy-api.test.ts`)
   - AI-generated test cases
   - Creative edge case discovery
   - Security and robustness testing

### Test Case Generation

Claude generates test cases based on detailed prompts that include:

- API endpoint specifications
- Expected behaviors
- Edge cases to explore
- Security considerations

Example prompt structure:

```typescript
const prompt = `Generate test cases for the /v1/messages endpoint.
Context:
- This is a proxy for Claude API
- Requires Bearer token authentication
- Supports streaming responses

Include test cases for:
1. Valid requests
2. Missing required fields
3. Invalid authentication
4. Edge cases`
```

## Managing Test Results

### Test Artifacts

Generated test cases are stored in `services/claude-testing/artifacts/`:

- Filename format: `generated-tests-{suite-id}.json`
- Contains prompt, timestamp, and test cases
- Used for replay and debugging

### Promoting AI-Discovered Tests

When AI finds a valuable test case, promote it to permanent tests:

```bash
# Promote all tests from a suite
./scripts/promote-ai-test.sh <suite-id>

# Promote a specific test
./scripts/promote-ai-test.sh <suite-id> <test-index>
```

This creates a new test file in `test/promoted/` that can be committed.

## Best Practices

### 1. Prompt Engineering

- Be specific about test requirements
- Include context about the API
- Define expected response formats
- Use consistent TypeScript interfaces

### 2. Temperature Control

- Low temperature (0.1) for consistent generation
- Higher temperature (0.8) for creative fuzz testing
- Adjust based on test goals

### 3. State Management

- Always seed database before tests
- Use test-specific domains (e.g., `test.localhost`)
- Clean up test data after runs

### 4. Error Handling

- Validate responses with Zod schemas
- Log validation errors for debugging
- Use try-catch for resilient test execution

## Troubleshooting

### Common Issues

1. **Authentication failures**

   - Verify API keys in secrets directory
   - Check credential file permissions (should be 600)

2. **Service connectivity**

   - Ensure proxy service is healthy before tests
   - Check Docker network configuration

3. **Test timeouts**
   - Increase test timeout in `vitest.config.ts`
   - Check for slow API responses

### Debug Mode

Enable detailed logging:

```bash
DEBUG=true docker compose --profile testing up
```

## Security Considerations

1. **API Keys**: Stored as Docker secrets, never in environment variables
2. **Test Isolation**: Tests run in isolated containers
3. **Credential Management**: Test credentials separate from production
4. **Network Isolation**: Testing profile uses internal Docker network

## Future Enhancements

- [ ] Visual test result dashboard
- [ ] Automatic test case categorization
- [ ] Performance benchmarking integration
- [ ] Multi-model test generation (Claude, GPT-4, etc.)
- [ ] Automated fix suggestions for failed tests

