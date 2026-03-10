#!/usr/bin/env python3
"""
Document GitHub Secrets to Infrastructure Catalog

This script updates the infrastructure catalog with a comprehensive list of all
GitHub Actions secrets and variables, providing a single source of truth for
secret management across all environments (production, staging, develop, test).

Enterprise Pattern:
- Infrastructure-as-Documentation
- Single source of truth for secrets management
- Environment-specific secret tracking
- Rotation policy documentation
- Usage tracking per workflow/service

Usage:
  python scripts/infra/document-github-secrets.py

Output:
  Updates apps/mcp-server/data/infrastructure-catalog.json
"""

import json
from pathlib import Path
from datetime import datetime

# Path to infrastructure catalog
CATALOG_PATH = Path("apps/mcp-server/data/infrastructure-catalog.json")

# Comprehensive GitHub Secrets Documentation
# Source: GitHub Repository Settings → Environments & Secrets
# Last Audit: 2025-11-12

GITHUB_SECRETS = [
    # === Database Secrets (All Environments) ===
    {
        "secretId": "secret-db-password",
        "name": "DB_PASSWORD",
        "scope": "environment",
        "environments": ["production", "staging", "develop", "test"],
        "usedBy": [
            "workflow-deploy-staging",
            "workflow-foundation",
            "service-api-gateway",
            "service-postgresql"
        ],
        "description": "PostgreSQL database password for all environments",
        "rotation": "Quarterly",
        "lastUpdated": "3 weeks ago",
        "tags": ["database", "postgresql", "critical"]
    },

    # === Encryption Keys (All Environments) ===
    {
        "secretId": "secret-encryption-key",
        "name": "ENCRYPTION_KEY",
        "scope": "environment",
        "environments": ["production", "staging", "develop", "test"],
        "usedBy": ["service-api-gateway"],
        "description": "Application-level encryption key for sensitive data",
        "rotation": "Annually",
        "lastUpdated": "3 weeks ago",
        "tags": ["encryption", "security", "critical"]
    },

    # === OAuth Secrets - Google (All Environments) ===
    {
        "secretId": "secret-google-client-id",
        "name": "GOOGLE_CLIENT_ID",
        "scope": "environment",
        "environments": ["production", "staging", "develop", "test"],
        "usedBy": [
            "workflow-e2e-tests",
            "service-api-gateway"
        ],
        "description": "Google OAuth 2.0 Client ID for user authentication",
        "rotation": "On security incident",
        "lastUpdated": "2 weeks ago",
        "tags": ["oauth", "authentication", "google", "critical"]
    },
    {
        "secretId": "secret-google-client-secret",
        "name": "GOOGLE_CLIENT_SECRET",
        "scope": "environment",
        "environments": ["production", "staging", "develop", "test"],
        "usedBy": [
            "workflow-e2e-tests",
            "service-api-gateway"
        ],
        "description": "Google OAuth 2.0 Client Secret for user authentication",
        "rotation": "On security incident",
        "lastUpdated": "2 weeks ago",
        "tags": ["oauth", "authentication", "google", "critical"]
    },

    # === JWT Secrets (All Environments) ===
    {
        "secretId": "secret-jwt-secret",
        "name": "JWT_SECRET",
        "scope": "environment",
        "environments": ["production", "staging", "develop", "test"],
        "usedBy": ["service-api-gateway"],
        "description": "JWT signing secret for access tokens",
        "rotation": "Quarterly",
        "lastUpdated": "3 weeks ago",
        "tags": ["jwt", "authentication", "critical"]
    },
    {
        "secretId": "secret-jwt-refresh-secret",
        "name": "JWT_REFRESH_SECRET",
        "scope": "environment",
        "environments": ["production", "staging", "develop", "test"],
        "usedBy": ["service-api-gateway"],
        "description": "JWT signing secret for refresh tokens",
        "rotation": "Quarterly",
        "lastUpdated": "3 weeks ago",
        "tags": ["jwt", "authentication", "critical"]
    },

    # === Session Secrets (All Environments) ===
    {
        "secretId": "secret-session-secret",
        "name": "SESSION_SECRET",
        "scope": "environment",
        "environments": ["production", "staging", "develop", "test"],
        "usedBy": ["service-api-gateway", "service-mcp-express"],
        "description": "Express session secret for cookie signing",
        "rotation": "Quarterly",
        "lastUpdated": "last week",
        "tags": ["session", "authentication", "critical"]
    },

    # === Redis Secrets (All Environments) ===
    {
        "secretId": "secret-redis-password",
        "name": "REDIS_PASSWORD",
        "scope": "environment",
        "environments": ["production", "staging", "develop", "test"],
        "usedBy": [
            "workflow-deploy-staging",
            "workflow-foundation",
            "service-redis",
            "service-api-gateway"
        ],
        "description": "Redis password for cache and session storage",
        "rotation": "Quarterly",
        "lastUpdated": "3 weeks ago",
        "tags": ["redis", "cache", "critical"]
    },

    # === OpenAI API Keys (All Environments) ===
    {
        "secretId": "secret-openai-api-key",
        "name": "OPENAI_API_KEY",
        "scope": "environment",
        "environments": ["production", "staging", "develop", "test"],
        "usedBy": ["service-mcp-native", "service-mcp-express"],
        "description": "OpenAI API key for AI agent capabilities",
        "rotation": "On security incident",
        "lastUpdated": "2-3 weeks ago (varies by environment)",
        "tags": ["ai", "openai", "api-key", "critical"]
    },

    # === Speckle Secrets (All Environments) ===
    {
        "secretId": "secret-speckle-postgres-password",
        "name": "SPECKLE_POSTGRES_PASSWORD",
        "scope": "environment",
        "environments": ["production", "staging", "develop", "test"],
        "usedBy": ["service-speckle"],
        "description": "PostgreSQL password for Speckle BIM integration",
        "rotation": "Quarterly",
        "lastUpdated": "3 weeks ago",
        "tags": ["speckle", "bim", "database"]
    },

    # === DigitalOcean Infrastructure (Staging) ===
    {
        "secretId": "secret-do-ssh-key",
        "name": "DO_SSH_KEY",
        "scope": "environment",
        "environments": ["staging"],
        "usedBy": ["workflow-deploy-staging"],
        "description": "SSH private key for DigitalOcean server access",
        "rotation": "Annually",
        "lastUpdated": "2 weeks ago",
        "tags": ["infrastructure", "ssh", "staging", "digitalocean"]
    },
    {
        "secretId": "secret-do-host",
        "name": "DO_HOST",
        "scope": "environment",
        "environments": ["staging"],
        "usedBy": ["workflow-deploy-staging"],
        "description": "Staging server IP address (143.198.154.94)",
        "rotation": "On server change",
        "lastUpdated": "3 weeks ago",
        "tags": ["infrastructure", "staging", "digitalocean"]
    },

    # === Production Infrastructure ===
    {
        "secretId": "secret-prod-ssh-key",
        "name": "PROD_SSH_KEY",
        "scope": "repository",
        "usedBy": ["workflow-deploy-production"],
        "description": "SSH private key for production server access",
        "rotation": "Annually",
        "lastUpdated": "3 weeks ago",
        "tags": ["infrastructure", "ssh", "production", "critical"]
    },
    {
        "secretId": "secret-prod-user",
        "name": "PROD_USER",
        "scope": "repository",
        "usedBy": ["workflow-deploy-production"],
        "description": "Production server SSH username",
        "rotation": "Never (infrastructure constant)",
        "lastUpdated": "3 weeks ago",
        "tags": ["infrastructure", "production"]
    },

    # === MCP Server Keys ===
    {
        "secretId": "secret-mcp-api-key",
        "name": "MCP_API_KEY",
        "scope": "environment",
        "environments": ["staging"],
        "usedBy": ["service-mcp-native", "service-mcp-express"],
        "description": "API key for MCP server authentication",
        "rotation": "Quarterly",
        "lastUpdated": "2-3 weeks ago",
        "tags": ["mcp", "api-key", "authentication"]
    },
    {
        "secretId": "secret-mcp-api-key-repo",
        "name": "MCP_API_KEY",
        "scope": "repository",
        "usedBy": ["service-mcp-native", "service-mcp-express"],
        "description": "MCP API key (repository-scoped fallback)",
        "rotation": "Quarterly",
        "lastUpdated": "2 months ago",
        "tags": ["mcp", "api-key", "authentication"]
    },

    # === Grafana Monitoring (Staging) ===
    {
        "secretId": "secret-gf-security-admin-password",
        "name": "GF_SECURITY_ADMIN_PASSWORD",
        "scope": "environment",
        "environments": ["staging"],
        "usedBy": ["service-grafana"],
        "description": "Grafana admin password for monitoring dashboards",
        "rotation": "Quarterly",
        "lastUpdated": "3 weeks ago",
        "tags": ["monitoring", "grafana", "staging"]
    },

    # === GitHub / NPM / Container Registry ===
    {
        "secretId": "secret-ghcr-pat",
        "name": "GHCR_PAT",
        "scope": "repository",
        "usedBy": ["workflow-foundation", "workflow-deploy-staging"],
        "description": "GitHub Container Registry Personal Access Token",
        "rotation": "Annually",
        "lastUpdated": "3 months ago",
        "tags": ["github", "container-registry", "ghcr"]
    },
    {
        "secretId": "secret-npm-token",
        "name": "NPM_TOKEN",
        "scope": "repository",
        "usedBy": ["workflow-foundation"],
        "description": "NPM authentication token for private packages",
        "rotation": "Annually",
        "lastUpdated": "3 months ago",
        "tags": ["npm", "package-registry"]
    },

    # === DigitalOcean Spaces (S3-compatible storage) ===
    {
        "secretId": "secret-spaces-access-key-id",
        "name": "SPACES_ACCESS_KEY_ID",
        "scope": "repository",
        "usedBy": ["service-api-gateway"],
        "description": "DigitalOcean Spaces access key ID for object storage",
        "rotation": "Annually",
        "lastUpdated": "3 weeks ago",
        "tags": ["digitalocean", "spaces", "storage"]
    },
    {
        "secretId": "secret-spaces-secret-access-key",
        "name": "SPACES_SECRET_ACCESS_KEY",
        "scope": "repository",
        "usedBy": ["service-api-gateway"],
        "description": "DigitalOcean Spaces secret access key",
        "rotation": "Annually",
        "lastUpdated": "3 weeks ago",
        "tags": ["digitalocean", "spaces", "storage", "critical"]
    },

    # === Test / E2E Automation ===
    {
        "secretId": "secret-test-google-email",
        "name": "TEST_GOOGLE_EMAIL",
        "scope": "repository",
        "usedBy": ["workflow-e2e-tests"],
        "description": "Test Google account email for E2E OAuth testing",
        "rotation": "Never (test account)",
        "lastUpdated": "3 weeks ago",
        "tags": ["testing", "e2e", "oauth", "google"]
    },
    {
        "secretId": "secret-test-google-password",
        "name": "TEST_GOOGLE_PASSWORD",
        "scope": "repository",
        "usedBy": ["workflow-e2e-tests"],
        "description": "Test Google account password for E2E OAuth testing",
        "rotation": "On security incident",
        "lastUpdated": "3 weeks ago",
        "tags": ["testing", "e2e", "oauth", "google", "critical"]
    },

    # === GitHub Projects Integration ===
    {
        "secretId": "secret-project-id",
        "name": "PROJECT_ID",
        "scope": "repository",
        "usedBy": ["workflow-roadmap-sync"],
        "description": "GitHub Projects ID for roadmap synchronization",
        "rotation": "Never (project constant)",
        "lastUpdated": "last week",
        "tags": ["github", "projects", "roadmap"]
    },
    {
        "secretId": "secret-project-token",
        "name": "PROJECT_TOKEN",
        "scope": "repository",
        "usedBy": ["workflow-roadmap-sync"],
        "description": "GitHub PAT for Projects API access",
        "rotation": "Annually",
        "lastUpdated": "last week",
        "tags": ["github", "projects", "api-token"]
    },

    # === Legacy / Deprecated ===
    {
        "secretId": "secret-speckle-rey",
        "name": "SPECKLE_REY",
        "scope": "repository",
        "usedBy": [],
        "description": "DEPRECATED - Legacy Speckle authentication key",
        "rotation": "N/A (deprecated)",
        "lastUpdated": "4 months ago",
        "tags": ["deprecated", "speckle", "legacy"]
    }
]

def update_infrastructure_catalog():
    """Update infrastructure catalog with comprehensive secrets documentation"""

    print("[*] Reading infrastructure catalog...")
    with open(CATALOG_PATH, 'r') as f:
        catalog = json.load(f)

    print(f"[+] Loaded catalog version {catalog['version']}")
    print(f"    Current secrets count: {len(catalog.get('secrets', []))}")

    # Replace entire secrets section with comprehensive documentation
    catalog['secrets'] = GITHUB_SECRETS

    # Update metadata
    catalog['lastUpdated'] = datetime.utcnow().isoformat() + 'Z'
    catalog['metadata']['lastAudit'] = datetime.utcnow().isoformat() + 'Z'
    catalog['metadata']['secretsCount'] = len(GITHUB_SECRETS)

    print(f"\n[*] Updated secrets count: {len(GITHUB_SECRETS)}")
    print(f"    Last audit: {catalog['metadata']['lastAudit']}")

    # Write updated catalog
    print(f"\n[*] Writing updated catalog to {CATALOG_PATH}...")
    with open(CATALOG_PATH, 'w') as f:
        json.dump(catalog, f, indent=2)

    print("\n[+] Infrastructure catalog updated successfully!")
    print("\n[*] Secrets Summary:")
    print(f"    Total secrets: {len(GITHUB_SECRETS)}")

    # Count by scope
    env_secrets = [s for s in GITHUB_SECRETS if s['scope'] == 'environment']
    repo_secrets = [s for s in GITHUB_SECRETS if s['scope'] == 'repository']
    print(f"    Environment-scoped: {len(env_secrets)}")
    print(f"    Repository-scoped: {len(repo_secrets)}")

    # Count critical secrets
    critical = [s for s in GITHUB_SECRETS if 'critical' in s.get('tags', [])]
    print(f"    Critical secrets: {len(critical)}")

    # Count by environment
    envs = {}
    for secret in GITHUB_SECRETS:
        for env in secret.get('environments', []):
            envs[env] = envs.get(env, 0) + 1
    print(f"\n[*] Secrets per environment:")
    for env, count in sorted(envs.items()):
        print(f"    {env}: {count}")

    print("\n[*] Next Steps:")
    print("    1. Run validation: node scripts/validation/validate-infrastructure-catalog.js")
    print("    2. Generate markdown: node scripts/docs/generate-infrastructure-catalog-md.cjs")
    print("    3. Commit changes to repository")

if __name__ == "__main__":
    try:
        update_infrastructure_catalog()
    except Exception as e:
        print(f"\n[!] Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
