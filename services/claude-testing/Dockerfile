# Claude Testing Service Dockerfile
# Base image with Bun for running tests
FROM oven/bun:1-alpine AS base

# Install required dependencies
RUN apk add --no-cache \
    curl \
    jq \
    bash \
    nodejs \
    npm

# Set working directory
WORKDIR /app

# Create claude directory structure
RUN mkdir -p /root/.claude

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies including Claude CLI and Anthropic SDK
RUN bun install && \
    npm install -g @anthropic-ai/claude-code

# Copy test source code
COPY . .

# Create artifacts directory for test results
RUN mkdir -p /app/artifacts

# Default command runs the test suite
CMD ["bun", "test"]