# ============================================================================
# DNS Management - Cloudflare Provider (Staging Environment)
# ============================================================================
# Date: 2026-02-19
# Purpose: Infrastructure-as-code for staging DNS records
# Root Cause: staging.ectropy.ai pointed to stale IP (209.38.4.214) after LB
#   was recreated — manual DNS drift. This file eliminates that class of error.
# Pattern: Terraform GitOps for DNS (same state as the LB it references)
# Provider: Cloudflare v4 (cloudflare_record) — migrate to v5 after March 2026
# Reference: infrastructure/terraform/dns.tf.disabled (original template)
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
# DNS Records - Staging Environment
# ============================================================================

# Staging A Record (Load Balancer) — Cloudflare Proxied
#
# ENTERPRISE PATTERN: Cloudflare Full (Strict) + Origin Certificate
#   - proxied = true: All traffic routed through Cloudflare edge (CDN, DDoS, WAF)
#   - Cloudflare → origin LB via HTTPS:443 (Full Strict validates Origin CA cert)
#   - Origin Certificate on LB: 15-year wildcard, issued by Cloudflare Origin CA
#   - End-to-end encryption: SOC 2 / PCI DSS / HIPAA compliant
#
# PREREQUISITE: Cloudflare zone SSL mode = Full (Strict)
#   - Cloudflare validates that origin cert is signed by Cloudflare CA
#   - HTTP 526 if origin cert missing or invalid — this is correct behavior
#   - Set in Cloudflare Dashboard → SSL/TLS → Overview → Full (Strict)
#
# VALUE: References digitalocean_loadbalancer.staging.ip directly
#   - When LB is recreated (terraform apply), DNS auto-updates
#   - Eliminates the manual DNS drift that caused the 2026-02-19 outage

resource "cloudflare_record" "staging" {
  count = local.cloudflare_enabled ? 1 : 0

  zone_id         = var.cloudflare_zone_id
  name            = "staging"
  content         = digitalocean_loadbalancer.staging.ip
  type            = "A"
  ttl             = 1       # Auto (Cloudflare manages TTL when proxied)
  proxied         = true    # Cloudflare Full (Strict) — Origin Certificate on LB
  allow_overwrite = true    # Adopt pre-existing record into Terraform state
  comment         = "Staging LB - Cloudflare proxied, managed by Terraform"
}

# ============================================================================
# Multi-Tenant Wildcard DNS Record
# ============================================================================
# Pattern: *.ectropy.ai → staging LB IP
# Covers: {tenant-slug}--staging.ectropy.ai (flat subdomain pattern)
#
# Cloudflare Free/Pro: Cannot proxy wildcards — record is DNS-only despite
#   proxied=true setting. Traffic goes directly to LB, which terminates TLS
#   using the Cloudflare Origin Certificate (15-year wildcard).
#
# Cloudflare Business + Advanced Certificate Manager ($10/mo):
#   Enables actual wildcard proxying — all tenant traffic through Cloudflare
#   edge (CDN, DDoS, WAF). Origin Certificate still handles LB TLS.
#   This is the enterprise scaling path for multi-tenant.
#
# Note: When production LB exists on a different IP, move wildcard to
#   production and staging gets *.staging.ectropy.ai with separate cert.

resource "cloudflare_record" "wildcard" {
  count = local.cloudflare_enabled ? 1 : 0

  zone_id         = var.cloudflare_zone_id
  name            = "*"
  content         = digitalocean_loadbalancer.staging.ip
  type            = "A"
  ttl             = 1       # Auto when proxied, 300 when DNS-only
  proxied         = true    # Requires Cloudflare Enterprise or Business+ACM
  allow_overwrite = true    # Adopt pre-existing record into Terraform state
  comment         = "Multi-tenant wildcard - managed by Terraform (Origin Cert on LB)"
}

# ============================================================================
# Outputs
# ============================================================================

output "staging_dns_record" {
  description = "Staging DNS record hostname (empty if Cloudflare not configured)"
  value       = local.cloudflare_enabled ? cloudflare_record.staging[0].hostname : "cloudflare-not-configured"
  sensitive   = true
}

output "staging_dns_value" {
  description = "Staging DNS record value (LB IP)"
  value       = local.cloudflare_enabled ? cloudflare_record.staging[0].content : digitalocean_loadbalancer.staging.ip
  sensitive   = true
}

output "wildcard_dns_record" {
  description = "Wildcard DNS record hostname for multi-tenant subdomains"
  value       = local.cloudflare_enabled ? cloudflare_record.wildcard[0].hostname : "cloudflare-not-configured"
  sensitive   = true
}

output "cloudflare_enabled" {
  description = "Whether Cloudflare DNS management is active"
  value       = local.cloudflare_enabled
  sensitive   = true
}

