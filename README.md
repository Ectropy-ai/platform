# Ectropy

Enterprise construction project management platform with AI-powered analysis and multi-tenant architecture.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Development Guide](docs/DEVELOPMENT.md)
- [Current Truth](docs/CURRENT_TRUTH.md)

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development environment
docker-compose -f docker-compose.development.yml up -d

# Run tests
pnpm test
```

## Applications

- **API Gateway** - REST API backend (`apps/api-gateway`)
- **Web Dashboard** - React frontend (`apps/web-dashboard`)
- **MCP Server** - AI orchestration service (`apps/mcp-server`)

## License

Proprietary - All rights reserved.
