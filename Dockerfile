# Claude Nexus Proxy - Multi-stage Production Dockerfile
# Supports running proxy, dashboard, or both services
# 
# Usage:
#   SERVICE=proxy (default) - Run proxy service only (recommended for production)
#   SERVICE=dashboard - Run dashboard service only (recommended for production)
#   SERVICE=both - Run both services in one container (development/testing only)
#
# For production, use Docker Compose or separate containers for each service

# ===== Builder Stage =====
FROM oven/bun:1.1.42-alpine AS builder

WORKDIR /app

# Copy package files from monorepo structure
COPY package.json bun.lock ./
COPY tsconfig.json ./
COPY services/proxy/package.json ./services/proxy/
COPY services/dashboard/package.json ./services/dashboard/
COPY packages/shared/package.json ./packages/shared/

# Install all dependencies (including dev deps for building)
RUN bun install --frozen-lockfile

# Copy source code and configs
COPY packages/shared ./packages/shared
COPY services/proxy ./services/proxy
COPY services/dashboard ./services/dashboard

# Build shared package (TypeScript declarations)
RUN cd packages/shared && bun run build

# Build production bundles
RUN cd services/proxy && bun run build:production
RUN cd services/dashboard && bun run build:production

# ===== Runtime Stage =====
FROM oven/bun:1.1.42-alpine AS runtime

# Install runtime dependencies
RUN apk add --no-cache ca-certificates bash

WORKDIR /app

# Copy only production dependencies
COPY package.json bun.lock ./
COPY services/proxy/package.json ./services/proxy/
COPY services/dashboard/package.json ./services/dashboard/
COPY packages/shared/package.json ./packages/shared/

# Install only production dependencies
RUN bun install --production --frozen-lockfile

# Copy built artifacts from builder
COPY --from=builder /app/services/proxy/dist ./services/proxy/dist
COPY --from=builder /app/services/dashboard/dist ./services/dashboard/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Copy scripts and other necessary files
COPY scripts/start-services.sh ./scripts/
RUN chmod +x ./scripts/start-services.sh

# Copy client-setup files if they exist
COPY client-setup* ./client-setup/

# Copy dashboard public files
COPY --from=builder /app/services/dashboard/dist/public ./services/dashboard/dist/public

# Create directories for runtime and fix permissions
RUN mkdir -p credentials && \
    chmod -R 755 /app && \
    chown -R bun:bun /app

# Set environment
ENV NODE_ENV=production
ENV SERVICE=proxy
ENV PORT=3000
ENV DASHBOARD_PORT=3001

USER bun

# Expose both service ports
EXPOSE 3000 3001

# Health check (checks the appropriate service based on SERVICE env)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD if [ "$SERVICE" = "dashboard" ]; then \
        wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1; \
      elif [ "$SERVICE" = "both" ]; then \
        wget --no-verbose --tries=1 --spider http://localhost:3000/health && \
        wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1; \
      else \
        wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1; \
      fi

# Run the appropriate service(s)
CMD ["./scripts/start-services.sh"]