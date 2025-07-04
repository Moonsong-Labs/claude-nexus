# Build stage
FROM oven/bun:1 as builder
WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./
COPY packages/shared/package.json ./packages/shared/
COPY services/analysis-worker/package.json ./services/analysis-worker/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY packages/shared ./packages/shared
COPY services/analysis-worker ./services/analysis-worker

# Build shared package
RUN cd packages/shared && bun run build

# Build analysis-worker
RUN cd services/analysis-worker && bun run build

# Production stage
FROM oven/bun:1-slim
WORKDIR /app

# Install production dependencies
COPY --from=builder /app/services/analysis-worker/package.json ./
COPY --from=builder /app/services/analysis-worker/dist ./dist

# Copy shared package build output if needed
COPY --from=builder /app/packages/shared/dist ./node_modules/@claude-nexus/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@claude-nexus/shared/

# Install only production dependencies
RUN bun install --production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# Start the worker
CMD ["bun", "dist/index.js"]