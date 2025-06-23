# Claude CLI Docker Image
FROM node:20-alpine

# Install required dependencies
RUN apk add --no-cache \
    curl \
    jq \
    bash \
    coreutils

# Install Claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create .claude directory with correct permissions
RUN mkdir -p /root/.claude && chmod 700 /root/.claude

# Copy scripts
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY claude-wrapper.sh /usr/local/bin/claude-cli
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/claude-cli

# Set working directory
WORKDIR /workspace

# Set environment variable for proxy
ENV ANTHROPIC_BASE_URL="http://proxy:3000"

# Use entrypoint script
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Default command (empty to allow entrypoint to handle it)
CMD []