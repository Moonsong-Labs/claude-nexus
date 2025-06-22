# Claude CLI Docker Image
FROM node:20-alpine

# Install required dependencies
RUN apk add --no-cache \
    curl \
    jq \
    bash

# Install Claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create claude directory
RUN mkdir -p /root/.claude

# Copy setup script
COPY setup.sh /usr/local/bin/setup-claude
RUN chmod +x /usr/local/bin/setup-claude

# Set working directory
WORKDIR /workspace

# Use setup script as entrypoint
ENTRYPOINT ["/usr/local/bin/setup-claude"]

# Default command opens Claude interactive mode
CMD ["claude"]