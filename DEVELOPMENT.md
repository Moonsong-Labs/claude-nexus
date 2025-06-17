# Development Guide

This guide explains how to run Claude Nexus Proxy services in development mode.

## Prerequisites

- Node.js 20+ or Bun
- PostgreSQL database (for dashboard)
- `.env` file configured (see `.env.example`)

## Quick Start

### 1. Install Dependencies

```bash
bun install
# or
npm install
```

### 2. Build Shared Package

```bash
bun run build:shared
```

### 3. Configure Environment

Create a `.env` file in the root directory:

```bash
cp .env.example .env
# Edit .env with your configuration
```

Required environment variables:

- `DATABASE_URL` - PostgreSQL connection string (required for dashboard)
- `CLAUDE_API_KEY` - Claude API key (optional, can be overridden per request)
- `DASHBOARD_API_KEY` - Authentication key for dashboard access

## Running Services

### Run Both Services

```bash
# From root directory
bun run dev
```

This starts:

- Proxy service on http://localhost:3000
- Dashboard service on http://localhost:3001

### Run Individual Services

#### Proxy Service

```bash
# From root directory
bun run dev:proxy

# Or from service directory
cd services/proxy
bun run dev
```

#### Dashboard Service

```bash
# From root directory
bun run dev:dashboard

# Or from service directory
cd services/dashboard
bun run dev  # Uses run-dev.sh to load environment
```

## Building for Production

### Build All Services

```bash
# From root directory
bun run build
```

### Build Individual Services

```bash
# Build proxy
bun run build:proxy

# Build dashboard
bun run build:dashboard
```

### Run Production Builds

```bash
# Start both services
bun run start

# Start individual services
bun run start:proxy
bun run start:dashboard
```

## Docker Development

### Build Docker Images

```bash
# Build all images
bun run docker:build

# Build individual images
bun run docker:build:proxy
bun run docker:build:dashboard
```

### Run with Docker Compose

```bash
# Start all services
bun run docker:up

# View logs
bun run docker:logs

# Stop services
bun run docker:down
```

## Common Tasks

### Type Checking

```bash
# Check all packages
bun run typecheck

# Check individual services
bun run typecheck:proxy
bun run typecheck:dashboard
```

### Linting

```bash
# Lint all packages
bun run lint
```

### Clean Build Artifacts

```bash
# Clean all packages
bun run clean
```

### Database Initialization

```bash
# Initialize database schema
bun run db:init
```

## Troubleshooting

### Dashboard Can't Find DATABASE_URL

The dashboard service needs access to environment variables. Solutions:

1. **Use the provided scripts**: Run `bun run dev` from the root directory
2. **Create local .env**: Copy `.env` to `services/dashboard/.env`
3. **Use the runner script**: Run `./run-dev.sh` from the dashboard directory

### Process.on is not a function

This error occurs when using the watch mode with signal handlers. The services will still run normally. To avoid this:

- Use `bun run dev:direct` instead of watch mode
- Or ignore the error - the service is still running

### TypeScript Errors

Some TypeScript errors may remain but don't affect functionality. To check:

```bash
bun run typecheck
```

## Project Structure

```
claude-nexus-proxy/
├── packages/
│   └── shared/         # Shared types and configurations
├── services/
│   ├── proxy/         # Proxy API service (port 3000)
│   └── dashboard/     # Dashboard web service (port 3001)
├── scripts/           # Utility scripts
├── docker-compose.yml # Container orchestration
└── .env              # Environment configuration
```

## Available Scripts Reference

### Root Package Scripts

| Script            | Description                             |
| ----------------- | --------------------------------------- |
| `dev`             | Start both services in development mode |
| `dev:proxy`       | Start only proxy service                |
| `dev:dashboard`   | Start only dashboard service            |
| `build`           | Build all services                      |
| `build:shared`    | Build shared package                    |
| `build:proxy`     | Build proxy service                     |
| `build:dashboard` | Build dashboard service                 |
| `start`           | Start both services in production mode  |
| `start:proxy`     | Start proxy in production mode          |
| `start:dashboard` | Start dashboard in production mode      |
| `docker:build`    | Build all Docker images                 |
| `docker:up`       | Start services with Docker Compose      |
| `docker:down`     | Stop Docker services                    |
| `docker:logs`     | View Docker logs                        |
| `typecheck`       | Run TypeScript checks on all packages   |
| `lint`            | Run ESLint on all packages              |
| `clean`           | Clean build artifacts                   |
| `db:init`         | Initialize database schema              |
| `setup`           | Initial setup (install + build shared)  |

### Service-Specific Scripts

Both proxy and dashboard services have these scripts:

| Script        | Description                    |
| ------------- | ------------------------------ |
| `dev`         | Start in development mode      |
| `dev:direct`  | Start without watch mode       |
| `dev:watch`   | Start with file watching       |
| `build`       | Build for production           |
| `build:check` | Type check then build          |
| `start`       | Start production build         |
| `start:prod`  | Start with NODE_ENV=production |
| `typecheck`   | Run TypeScript checks          |
| `lint`        | Run ESLint                     |
| `clean`       | Remove build artifacts         |
