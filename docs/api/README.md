# API Specifications

This directory contains machine-readable API specifications for Claude Nexus Proxy services.

## Available Specifications

### AI Analysis API

OpenAPI specification for the AI-powered conversation analysis endpoints.

- **File**: [`openapi-analysis.yaml`](./openapi-analysis.yaml)
- **Version**: 1.0.0
- **Format**: OpenAPI 3.0.3

## Documentation

For user-facing API documentation, see:

- [API Reference](../02-User-Guide/api-reference.md) - Complete API endpoint documentation
- [Dashboard Guide](../02-User-Guide/dashboard-guide.md) - Dashboard features and usage

## Working with OpenAPI Specifications

### View Interactive Documentation

```bash
# Using Redoc
bunx @redocly/cli preview-docs docs/api/openapi-analysis.yaml

# Using Swagger UI
docker run -p 8080:8080 \
  -e SWAGGER_JSON=/api/openapi-analysis.yaml \
  -v ${PWD}/docs/api:/api \
  swaggerapi/swagger-ui
```

### Generate TypeScript Client

If you need a TypeScript client for development:

```bash
bun run scripts/generate-api-client.ts
```

**Note:** Only generate the client when actively needed. Generated code requires maintenance.

### Review Specifications

Review OpenAPI specifications using AI:

```bash
GEMINI_API_KEY=your-key bun run scripts/review-openapi-spec.ts
```

## Adding New Specifications

When adding new API specifications:

1. Create the OpenAPI YAML file in this directory
2. Update this README with the specification details
3. Ensure the specification follows OpenAPI 3.0+ standards
4. Consider generating clients only when needed
