# ============================================================================
# DNS Management - Cloudflare Provider (Production Environment)
# ============================================================================
# Date: 2026-03-07
# Purpose: Infrastructure-as-code for production DNS records
# Root Cause: ectropy.ai Cloudflare A record pointed to dead origin IP
#   (143.198.247.160 — decommissioned server) after blue/green LB migration.
#   Direct LB curl returns 200, but Cloudflare → dead origin → 521.
#   This file eliminates that class of error (same as staging/dns.tf).
# Pattern: Terraform GitOps for DNS (same state as the LB it references)
# Provider: Cloudflare v4 (cloudflare_record)
# Reference: infrastructure/terraform/environments/staging/dns.tf
# Evidence: FIVE_WHY_PRODUCTION_521_CLOUDFLARE_ORIGIN_2026-03-07.json
# ============================================================================

# ============================================================================
# Cloudflare Provider Configuration
# ============================================================================
# API Token: Requires Zone:Read, DNS:Edit permissions for ectropy.ai
# Set via: TF_VAR_cloudflare_api_token in GitHub Actions secrets
# Optional: If token is empty, all DNS resources are skipped (count = 0)

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# ============================================================================
# Local: Determine if Cloudflare is configured
# ============================================================================
# Pattern: Optional provider — graceful skip when credentials not available
# This prevents terraform plan/apply from failing when Cloudflare token is
# not yet configured in GitHub Actions secrets

locals {
  cloudflare_enabled = var.cloudflare_api_token != "" && var.cloudflare_zone_id != ""
}

# ============================================================================
# DNS Records - Production Environment
# ============================================================================

# Production A Record (Root Domain) — Cloudflare Proxied
#
# ENTERPRISE PATTERN: Cloudflare Full (Strict) + Origin Certificate
#   - proxied = true: All traffic routed through Cloudflare edge (CDN, DDoS, WAF)
#   - Cloudflare → origin LB via HTTPS:443 (Full Strict validates Origin CA cert)
#   - Origin Certificate on LB: 15-year wildcard, issued by Cloudflare Origin CA
#   - End-to-end encryption: SOC 2 / PCI DSS / HIPAA compliant
#
# VALUE: References digitalocean_loadbalancer.production.ip directly
#   - When LB is recreated (terraform apply), DNS auto-updates
#   - Eliminates the manual DNS drift that caused the 2026-03-07 outage
#   - Same pattern that fixed staging DNS drift (ROOT CAUSE #161, 2026-02-19)

resource "cloudflare_record" "production" {
  count = local.cloudflare_enabled ? 1 : 0

  zone_id         = var.cloudflare_zone_id
  name            = "@" # Root domain: ectropy.ai
  content         = digitalocean_loadbalancer.production.ip
  type            = "A"
  ttl             = 1    # Auto (Cloudflare manages TTL when proxied)
  proxied         = true # Cloudflare Full (Strict) — Origin Certificate on LB
  allow_overwrite = true # Adopt pre-existing record into Terraform state
  comment         = "Production LB - Cloudflare proxied, managed by Terraform"
}

# Production WWW (CNAME to root)
resource "cloudflare_record" "production_www" {
  count = local.cloudflare_enabled ? 1 : 0

  zone_id         = var.cloudflare_zone_id
  name            = "www"
  content         = "ectropy.ai"
  type            = "CNAME"
  ttl             = 1
  proxied         = true
  allow_overwrite = true
  comment         = "WWW redirect to root domain - managed by Terraform"
}

# Production Console Subdomain
resource "cloudflare_record" "production_console" {
  count = local.cloudflare_enabled ? 1 : 0

  zone_id         = var.cloudflare_zone_id
  name            = "console"
  content         = digitalocean_loadbalancer.production.ip
  type            = "A"
  ttl             = 1
  proxied         = true
  allow_overwrite = true
  comment         = "Console subdomain - managed by Terraform"
}

# ============================================================================
# Outputs
# ============================================================================

output "production_dns_record" {
  description = "Production DNS record hostname (empty if Cloudflare not configured)"
  value       = local.cloudflare_enabled ? cloudflare_record.production[0].hostname : "cloudflare-not-configured"
  sensitive   = true
}

output "production_dns_value" {
  description = "Production DNS record value (LB IP)"
  value       = local.cloudflare_enabled ? cloudflare_record.production[0].content : digitalocean_loadbalancer.production.ip
  sensitive   = true
}

output "cloudflare_enabled" {
  description = "Whether Cloudflare DNS management is active"
  value       = local.cloudflare_enabled
  sensitive   = true
}
