# ---- Builder Stage ----
FROM node:24-alpine as builder

# Install required build dependencies
RUN apk add --no-cache \
    python3 \
    py3-tz \
    curl \
    jq \
    bash \
    coreutils \
    git

# Set working directory
WORKDIR /app

# Clone Claude Usage Monitor
RUN git clone https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor.git /app/claude-monitor

# ---- Final Stage ----
FROM node:24-alpine

# Set proxy for runtime environment
ENV ANTHROPIC_BASE_URL="http://proxy:3000"

# Install runtime dependencies
RUN apk add --no-cache \
    python3 \
    py3-tz \
    curl \
    jq \
    bash \
    coreutils

# Create non-root user
RUN addgroup -g 1001 claude && \
    adduser -u 1001 -G claude -s /bin/bash -D claude

# Install Node.js tools directly in final stage to avoid copy issues
RUN npm install -g @anthropic-ai/claude-code ccusage@latest

# Copy Python packages - Alpine's py3-tz is installed system-wide, no need to copy

# Copy Claude Monitor
COPY --from=builder --chown=claude:claude /app/claude-monitor /app/claude-monitor

# Create necessary directories
RUN mkdir -p /home/claude/.claude && \
    chown -R claude:claude /home/claude/.claude && \
    chmod 700 /home/claude/.claude

# Copy scripts with proper ownership
COPY --chown=root:root entrypoint.sh /usr/local/bin/entrypoint.sh
COPY --chown=root:root claude-wrapper.sh /usr/local/bin/claude-cli
COPY --chown=root:root monitor-wrapper.sh /usr/local/bin/claude-monitor
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/claude-cli /usr/local/bin/claude-monitor && \
    ln -s /usr/local/bin/claude-monitor /usr/local/bin/monitor && \
    ln -s /usr/local/bin/ccusage /usr/local/bin/usage

# Set working directory
WORKDIR /workspace

# Switch to non-root user
USER claude

# Use entrypoint script
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Default command (empty to allow entrypoint to handle it)
CMD []