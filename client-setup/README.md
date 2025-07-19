# Client Setup Directory

This directory is used by Docker deployments to store client configuration files.

## Purpose

When running Claude Nexus Proxy with Docker Compose, this directory serves as a volume mount point for client credentials and configuration files. The proxy service exposes these files via the `/client-setup/*` endpoint to facilitate client configuration.

## Usage

1. Place your `.credentials.json` file in this directory for Docker deployments
2. The Claude CLI container will automatically copy these credentials during startup
3. Files in this directory can be accessed via `http://proxy-host:3000/client-setup/filename`

## Security Note

This directory should contain only non-sensitive example or template files in the repository. Actual credentials should be added locally and never committed to version control.

## Related Documentation

- See `docker/claude-cli/README.md` for Claude CLI Docker setup
- See `docs/00-Overview/quickstart.md` for quick start guide
