# ============================================================================
# Create HCP Terraform Cloud Workspace for Staging Environment
# ============================================================================
# ROOT CAUSE #126: Staging VPC Migration - Phase 2
# Enterprise pattern: Tag-based workspace selection
# ============================================================================

$ErrorActionPreference = "Stop"

# Configuration
$ORG_NAME = "luh-tech-ectropy"
$WORKSPACE_NAME = "ectropy-staging"
$WORKSPACE_TAG = "ectropy"
$EXECUTION_MODE = "local"
$TERRAFORM_VERSION = "1.6.0"
$API_BASE = "https://app.terraform.io/api/v2"

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "Creating HCP Terraform Cloud Workspace" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Organization: $ORG_NAME" -ForegroundColor White
Write-Host "Workspace: $WORKSPACE_NAME" -ForegroundColor White
Write-Host "Tag: $WORKSPACE_TAG" -ForegroundColor White
Write-Host "Execution Mode: $EXECUTION_MODE" -ForegroundColor White
Write-Host ""

# Get TF_API_TOKEN from GitHub secret
Write-Host "[1/3] Retrieving TF_API_TOKEN from GitHub secrets..." -ForegroundColor Yellow
try {
    $secrets = gh secret list | Where-Object { $_ -match "TF_API_TOKEN" }
    if (-not $secrets) {
        Write-Host "ERROR: TF_API_TOKEN not found in GitHub secrets" -ForegroundColor Red
        exit 1
    }

    # We cannot get the actual token value from gh CLI (security),
    # so we need to use GitHub API with workflow context
    Write-Host "NOTE: GitHub CLI cannot retrieve secret values for security reasons" -ForegroundColor Yellow
    Write-Host "Please visit HCP Terraform Cloud UI to create workspace manually:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Manual Steps:" -ForegroundColor Cyan
    Write-Host "1. Visit: https://app.terraform.io/app/luh-tech-ectropy/workspaces" -ForegroundColor White
    Write-Host "2. Click 'New Workspace'" -ForegroundColor White
    Write-Host "3. Select 'CLI-driven workflow'" -ForegroundColor White
    Write-Host "4. Enter workspace name: $WORKSPACE_NAME" -ForegroundColor White
    Write-Host "5. Click 'Create workspace'" -ForegroundColor White
    Write-Host "6. Go to Settings → General" -ForegroundColor White
    Write-Host "7. Add tag: $WORKSPACE_TAG" -ForegroundColor White
    Write-Host "8. Set execution mode: $EXECUTION_MODE" -ForegroundColor White
    Write-Host "9. Go to Variables and add:" -ForegroundColor White
    Write-Host "   - do_token (sensitive)" -ForegroundColor White
    Write-Host "   - spaces_access_id (sensitive)" -ForegroundColor White
    Write-Host "   - spaces_secret_key (sensitive)" -ForegroundColor White
    Write-Host ""
    Write-Host "After creating workspace, run:" -ForegroundColor Cyan
    Write-Host "  cd terraform" -ForegroundColor White
    Write-Host "  terraform init" -ForegroundColor White
    Write-Host "  `$env:TF_WORKSPACE='ectropy-staging'" -ForegroundColor White
    Write-Host "  terraform plan -var-file=envs/staging.tfvars" -ForegroundColor White
    Write-Host ""

    # Alternative: If user has TF_API_TOKEN env variable set
    if ($env:TF_API_TOKEN) {
        Write-Host "Found TF_API_TOKEN environment variable, proceeding with API call..." -ForegroundColor Green
        Write-Host ""

        $payload = @{
            data = @{
                type = "workspaces"
                attributes = @{
                    name = $WORKSPACE_NAME
                    "execution-mode" = $EXECUTION_MODE
                    "terraform-version" = $TERRAFORM_VERSION
                    "auto-apply" = $false
                    "file-triggers-enabled" = $false
                    "queue-all-runs" = $false
                    "speculative-enabled" = $true
                    "tag-names" = @($WORKSPACE_TAG)
                    description = "Staging environment infrastructure (Phase 2 VPC Migration)"
                }
            }
        } | ConvertTo-Json -Depth 10

        $headers = @{
            "Authorization" = "Bearer $env:TF_API_TOKEN"
            "Content-Type" = "application/vnd.api+json"
        }

        Write-Host "[2/3] Creating workspace via HCP Terraform Cloud API..." -ForegroundColor Yellow
        try {
            $response = Invoke-RestMethod -Uri "$API_BASE/organizations/$ORG_NAME/workspaces" `
                -Method Post `
                -Headers $headers `
                -Body $payload

            Write-Host "SUCCESS: Workspace created!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Workspace ID: $($response.data.id)" -ForegroundColor White
            Write-Host "Workspace Name: $WORKSPACE_NAME" -ForegroundColor White
            Write-Host "Tag: $WORKSPACE_TAG" -ForegroundColor White
            Write-Host ""
            Write-Host "[3/3] Next steps:" -ForegroundColor Yellow
            Write-Host "1. Configure workspace variables in HCP Terraform Cloud UI" -ForegroundColor White
            Write-Host "2. Run: cd terraform && terraform init" -ForegroundColor White
            Write-Host "3. Run: `$env:TF_WORKSPACE='ectropy-staging'; terraform plan -var-file=envs/staging.tfvars" -ForegroundColor White

        } catch {
            $statusCode = $_.Exception.Response.StatusCode.value__
            if ($statusCode -eq 422) {
                Write-Host "WARNING: Workspace already exists or validation error" -ForegroundColor Yellow
                Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Yellow
            } else {
                Write-Host "ERROR: Failed to create workspace (HTTP $statusCode)" -ForegroundColor Red
                Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
                exit 1
            }
        }
    }

} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
