# Build stage
FROM oven/bun:1-alpine AS build

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install all dependencies (including dev for building)
RUN bun install --frozen-lockfile

# Copy source code and configs
COPY src ./src
COPY tsconfig.json ./

# Runtime stage
FROM oven/bun:1-alpine AS runtime

WORKDIR /app

# Install only production dependencies
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production && \
    rm -rf /root/.bun/install/cache

# Copy source code
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./

# Copy example files
COPY examples/credentials ./examples/credentials

# Copy client-setup files
COPY client-setup ./client-setup

# Create directories for runtime
RUN mkdir -p credentials && \
    chown -R bun:bun /app

USER bun
EXPOSE 3000

# Run the server directly with bun
CMD ["bun", "run", "src/server.ts"]
