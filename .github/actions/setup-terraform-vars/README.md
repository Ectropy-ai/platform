# Setup Terraform Variables

Centralized composite action for setting TF_VAR environment variables across all Terraform workflows.

## Purpose

This action eliminates duplication of TF_VAR declarations across Terraform workflows. Previously, ~340 lines of TF_VAR environment variable declarations were duplicated across 6 workflow jobs. This action provides a single source of truth.

## Usage

```yaml
- name: Setup Terraform Variables
  uses: ./.github/actions/setup-terraform-vars
  with:
    environment: staging  # Required: development, staging, or production
    digitalocean-token: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }}
    ssh-private-key: ${{ secrets.TERRAFORM_DEPLOY_PRIVATE_KEY }}
    ssl-cert-private-key: ${{ secrets.CF_ORIGIN_KEY }}
    ssl-cert-leaf: ${{ secrets.CF_ORIGIN_CERT }}
    # ... all other inputs
```

## Inputs

| Input | Required | Description |
|-------|----------|-------------|
| `environment` | Yes | Target environment: `development`, `staging`, or `production` |
| `digitalocean-token` | Yes | DigitalOcean API token for provider authentication |
| `ssh-private-key` | No | SSH private key for provisioners |
| `ssl-cert-private-key` | No | Cloudflare origin certificate private key |
| `ssl-cert-leaf` | No | Cloudflare origin certificate (leaf) |
| `app-version` | No | Application version |
| `api-url` | No | API URL |
| `frontend-url` | No | Frontend URL |
| `database-password` | No | PostgreSQL password |
| `jwt-secret` | No | JWT signing secret |
| `jwt-refresh-secret` | No | JWT refresh token secret |
| `session-secret` | No | Session management secret |
| `encryption-key` | No | Data encryption key |
| `google-client-id` | No | Google OAuth client ID |
| `google-client-secret` | No | Google OAuth client secret |
| `redis-password` | No | Redis authentication password |
| `mcp-api-key` | No | MCP AI orchestration API key |
| `openai-api-key` | No | OpenAI API key |
| `speckle-server-token` | No | Speckle BIM server token |
| `speckle-admin-password` | No | Speckle admin password |
| `speckle-session-secret` | No | Speckle session secret |
| `minio-access-key` | No | MinIO S3-compatible access key |
| `minio-secret-key` | No | MinIO S3-compatible secret key |
| `resend-api-key` | No | Resend email service API key |
| `watchtower-http-api-token` | No | Watchtower container update token |
| `spaces-access-key-id` | No | DigitalOcean Spaces access key |
| `spaces-secret-access-key` | No | DigitalOcean Spaces secret key |
| `docr-config-json` | No | Docker container registry auth JSON |
| `cloudflare-api-token` | No | Cloudflare API token for DNS |
| `cloudflare-zone-id` | No | Cloudflare DNS zone ID |
| `platform-database-url` | No | Platform schema database URL |
| `shared-database-url` | No | Shared schema database URL |

## Outputs

| Output | Description |
|--------|-------------|
| `variables-set` | Number of TF_VAR variables configured |

## Environment-Aware SSH Keys

The action automatically handles environment-specific SSH key variable names:

- `staging` → Sets `TF_VAR_staging_ssh_private_key`
- `production` → Sets `TF_VAR_production_ssh_private_key`
- `development` → Sets `TF_VAR_development_ssh_private_key`

Non-target environment SSH key variables are set to empty strings.

## Workflows Using This Action

| Workflow | Jobs |
|----------|------|
| `terraform-staging-gitops.yml` | plan, apply |
| `terraform-plan-apply.yml` | plan, apply, destroy |
| `terraform-pr-validation.yml` | terraform-validation (matrix) |

## Adding New Variables

To add a new TF_VAR:

1. Add input parameter to `action.yml` inputs section
2. Add `echo "TF_VAR_name=${{ inputs.name }}" >> $GITHUB_ENV` to the set-vars step
3. Update workflow calls to pass the new input

This is now 1 change instead of 6 places.

## Related

- [SECRETS_SOURCE_OF_TRUTH_MATRIX](../../docs/SECRETS_SOURCE_OF_TRUTH_MATRIX.md) - Secrets configuration documentation
- [Terraform Environments](../../infrastructure/terraform/environments/) - Per-environment Terraform configurations
