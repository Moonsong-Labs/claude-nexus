# Client Setup Directory

This directory is used by Docker deployments to store client configuration files.

## Purpose

When running Claude Nexus Proxy with Docker Compose, this directory serves as a volume mount point for client credentials and configuration files. The proxy service exposes these files via the `/client-setup/*` endpoint to facilitate client configuration.

## Usage

1. Copy `.claude.json.example` to `.claude.json` and customize with your settings (if needed)
2. Copy `.credentials.json.example` to `.credentials.json` and populate with your OAuth credentials
3. The Claude CLI container will automatically copy these files during startup
4. Files in this directory can be accessed via `http://proxy-host:3000/client-setup/filename`

**Note:** The actual `.claude.json` and `.credentials.json` files are ignored by git to prevent committing user-specific data and sensitive credentials.

## Security Note

This directory should contain only non-sensitive example or template files in the repository. Actual credentials should be added locally and never committed to version control.

## Related Documentation

- See `docker/claude-cli/README.md` for Claude CLI Docker setup
- See `docs/01-Getting-Started/installation.md` for installation guide
