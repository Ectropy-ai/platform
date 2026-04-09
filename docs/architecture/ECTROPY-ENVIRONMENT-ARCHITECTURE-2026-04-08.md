# Ectropy Environment Architecture

*Ground Truth -- 2026-04-08*

## Five-Server Map

| Server | IP | Size | Purpose | DB | Deploy Method | Terraform | SSH |
|--------|-----|------|---------|-----|--------------|-----------|-----|
| ectropy-staging | 143.198.108.161 | s-4vcpu-8gb | Integration, demo, Watchtower auto-deploy | ectropy-staging-db | Watchtower (push to develop) | Yes | Blocked (DO console only) |
| ectropy-production-blue | 143.198.48.156 | c2-4vcpu-8gb | Live traffic (active) | ectropy-production-db | workflow_dispatch only | Yes | Restricted IPs |
| ectropy-production-green | 64.227.105.120 | c2-4vcpu-8gb | Live traffic (standby) | ectropy-production-db | workflow_dispatch only | Yes | Restricted IPs |
| ectropy-development | 64.23.157.16 | -- | Agent pipeline, console.ectropy.ai | ectropy-platform-db | Manual | No (gap) | Manual |
| n8n | 159.223.203.231 | -- | Canadian pilot pipeline (NEVER TOUCH) | -- | Manual | No | N/A |

## Three Database Clusters

| Cluster | Engine | Version | Region | Node Count | Connects To | Terraform |
|---------|--------|---------|--------|------------|-------------|-----------|
| ectropy-staging-db | PostgreSQL | 16 | sfo3 | 1 | ectropy-staging | Yes |
| ectropy-production-db | PostgreSQL | 16 | sfo3 | 3 (HA) | production-blue, production-green | Yes |
| ectropy-platform-db | PostgreSQL | 16 | sfo3 | 1 | ectropy-development | Yes |

## Four Spaces Buckets

| Bucket | Region | Purpose | Update Trigger |
|--------|--------|---------|----------------|
| ectropy-terraform-state | sfo3 | Terraform remote state backend | terraform apply |
| ectropy-staging-configs | sfo3 | .env, compose, nginx configs for staging | Terraform GitOps CI + config-sync (60s poll) |
| ectropy-production-configs | sfo3 | .env, compose, nginx configs for production | Terraform GitOps CI + config-sync (60s poll) |
| luhtech-demo-assets | nyc3 | IFC files, demo bundles | Manual upload / provision workflow |

## Load Balancers

| LB | IP | DO ID | HTTP Rule | HTTPS Rule | Cert | Terraform |
|----|-----|-------|-----------|------------|------|-----------|
| ectropy-staging-lb | 164.90.247.118 | 81e41074 | 80 -> 80 | 443 -> 80 | ectropy-production-cert (cc7c246b, LE) | Yes (as of f17e466) |
| ectropy-production-lb-v2 | 209.38.174.111 | 051530f8 | 80 -> 80 | 443 -> 80 | ectropy-production-cert (cc7c246b, LE) | Yes |

Health check: GET /lb-health on port 80 (independent, no backend deps).
Sticky sessions: cookie-based (lb_session_staging / lb_session), 1h TTL.
HTTP idle timeout: 300s (Speckle file upload support).

## Branch to Environment Contract

```
feature/*  -->  Mac Mini (local container validation)
                    |
                    v
               develop  -->  ectropy-staging (Watchtower auto-deploy)
                    |
                    v
                 main  -->  production blue+green (workflow_dispatch ONLY)
```

- Watchtower polls DOCR every 5 minutes on staging.
- Production deploy is NEVER automatic -- requires manual workflow_dispatch.
- config-sync polls Spaces every 60 seconds on both staging and production.

## Hard Constraints

| Constraint | Reason |
|-----------|--------|
| NEVER docker compose down | Causes full outage; use --no-deps for single service |
| NEVER force push | Destroys shared history |
| NEVER touch n8n (159.223.203.231) | Live Canadian pilot pipeline |
| Spaces BEFORE droplet .env | config-sync overwrites every ~60s |
| doctl lb update = FULL REPLACEMENT | Always include ALL forwarding rules + cert or HTTPS breaks |
| Production deploy: workflow_dispatch ONLY | Never Watchtower on production |
| boto3 ONLY for Spaces | AWS CLI v1 and curl sigv4 broken with DO Spaces |
| BW vault = luhtechnology.com | Never erik@luh.tech |
| Staging access: DO console only | SSH key blocked from Mac (as of 2026-04-08) |

## Secret Scope Policy

| Category | Correct Scope | Never In |
|----------|--------------|----------|
| DIGITALOCEAN_ACCESS_TOKEN | repo-level only | staging env, production env |
| LUHTECH_PKG_READ | repo-level only | production env |
| ANTHROPIC_API_KEY | production env only | repo-level, staging env |
| SPECKLE_SERVER_TOKEN | all three (different values) | -- |
| MINIO_ACCESS_KEY/SECRET | repo + production (different values) | -- |
| VIEWER_TOKEN_SECRET | all three (runtime, not CI) | -- |
| SPACES_ACCESS_KEY_ID/SECRET | repo-level only | staging env, production env |
| DB_PASSWORD, JWT_SECRET, etc. | env-level only (staging or production) | repo-level |
| PROD_SSH_KEY | production env only | repo-level |

## Open Gaps as of 2026-04-08

1. **ectropy-development not Terraform-managed** -- 64.23.157.16 is manually provisioned. Needs DEC record: either add to Terraform or document as intentionally unmanaged.
2. **luhtech-demo-assets in NYC3** -- All other buckets are SFO3. Investigate why and whether to migrate.
3. **DEC-024: /streams/ token env var injection** -- Staging has hardcoded Speckle token in nginx. Production gate: must use env var injection before promoting /streams/ block.
4. **DEC-019: Speckle managed PostgreSQL** -- Speckle currently uses local ectropy-postgres container. Streams/objects lost on droplet replacement. Migration to managed PG deferred.
5. **SSH key re-authorization** -- luhtech_enterprise key rejected by staging droplet. Re-add via DO console or rotate key.
6. **E2E smoke tests** -- All recent E2E runs failed during 522 outage. Need fresh green run to confirm baseline.
7. **DO_SPACES_ACCESS_KEY naming inconsistency** -- provision-demo-project.yml uses DO_SPACES_ACCESS_KEY while all other workflows use SPACES_ACCESS_KEY_ID. Same value, different name.
