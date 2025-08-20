- **Purpose**: All-in-one demo image that runs PostgreSQL, Proxy API, and Dashboard in a single container.

- **Build locally**:

```bash
docker build -f docker/all-in/claude-nexus-all-in.Dockerfile -t claude-nexus-all-in:local .
```

- **Run locally**:

```bash
docker run -d -p 3000:3000 -p 3001:3001 --name claude-nexus claude-nexus-all-in:local
```
