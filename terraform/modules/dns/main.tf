# ============================================================================
# Ectropy DNS Module
# ============================================================================
# Description: Creates DigitalOcean DNS Zones and Records
# Version: 1.0.0
# Last Updated: 2025-12-14
# ============================================================================

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.34"
    }
  }
}

# ----------------------------------------------------------------------------
# DNS Domain (Zone) Resource
# ----------------------------------------------------------------------------

resource "digitalocean_domain" "main" {
  count = var.create_domain ? 1 : 0

  name       = var.domain_name
  ip_address = var.primary_ip != "" ? var.primary_ip : null

  # Lifecycle: Enterprise pattern - domains are critical infrastructure
  # NOTE: Use Terraform Cloud approval workflows for production protection
  lifecycle {
    create_before_destroy = false # Domains cannot be destroyed and recreated
  }
}

# ----------------------------------------------------------------------------
# A Records
# ----------------------------------------------------------------------------

resource "digitalocean_record" "a_records" {
  for_each = var.a_records

  domain = var.create_domain ? digitalocean_domain.main[0].name : var.domain_name
  type   = "A"
  name   = each.key
  value  = each.value.value
  ttl    = lookup(each.value, "ttl", var.default_ttl)
}

# ----------------------------------------------------------------------------
# AAAA Records (IPv6)
# ----------------------------------------------------------------------------

resource "digitalocean_record" "aaaa_records" {
  for_each = var.aaaa_records

  domain = var.create_domain ? digitalocean_domain.main[0].name : var.domain_name
  type   = "AAAA"
  name   = each.key
  value  = each.value.value
  ttl    = lookup(each.value, "ttl", var.default_ttl)
}

# ----------------------------------------------------------------------------
# CNAME Records
# ----------------------------------------------------------------------------

resource "digitalocean_record" "cname_records" {
  for_each = var.cname_records

  domain = var.create_domain ? digitalocean_domain.main[0].name : var.domain_name
  type   = "CNAME"
  name   = each.key
  value  = each.value.value
  ttl    = lookup(each.value, "ttl", var.default_ttl)
}

# ----------------------------------------------------------------------------
# MX Records
# ----------------------------------------------------------------------------

resource "digitalocean_record" "mx_records" {
  for_each = var.mx_records

  domain   = var.create_domain ? digitalocean_domain.main[0].name : var.domain_name
  type     = "MX"
  name     = lookup(each.value, "name", "@")
  value    = each.value.value
  priority = each.value.priority
  ttl      = lookup(each.value, "ttl", var.default_ttl)
}

# ----------------------------------------------------------------------------
# TXT Records
# ----------------------------------------------------------------------------

resource "digitalocean_record" "txt_records" {
  for_each = var.txt_records

  domain = var.create_domain ? digitalocean_domain.main[0].name : var.domain_name
  type   = "TXT"
  name   = each.key
  value  = each.value.value
  ttl    = lookup(each.value, "ttl", var.default_ttl)
}

# ----------------------------------------------------------------------------
# SRV Records
# ----------------------------------------------------------------------------

resource "digitalocean_record" "srv_records" {
  for_each = var.srv_records

  domain   = var.create_domain ? digitalocean_domain.main[0].name : var.domain_name
  type     = "SRV"
  name     = each.key
  value    = each.value.value
  priority = each.value.priority
  port     = each.value.port
  weight   = each.value.weight
  ttl      = lookup(each.value, "ttl", var.default_ttl)
}

# ----------------------------------------------------------------------------
# CAA Records (Certificate Authority Authorization)
# ----------------------------------------------------------------------------

resource "digitalocean_record" "caa_records" {
  for_each = var.caa_records

  domain = var.create_domain ? digitalocean_domain.main[0].name : var.domain_name
  type   = "CAA"
  name   = lookup(each.value, "name", "@")
  value  = each.value.value
  flags  = each.value.flags
  tag    = each.value.tag
  ttl    = lookup(each.value, "ttl", var.default_ttl)
}

# ----------------------------------------------------------------------------
# NS Records (Nameserver)
# ----------------------------------------------------------------------------

resource "digitalocean_record" "ns_records" {
  for_each = var.ns_records

  domain = var.create_domain ? digitalocean_domain.main[0].name : var.domain_name
  type   = "NS"
  name   = each.key
  value  = each.value.value
  ttl    = lookup(each.value, "ttl", var.default_ttl)
}

# ----------------------------------------------------------------------------
# Standard Record Sets (Convenience)
# ----------------------------------------------------------------------------

# WWW CNAME (if enabled)
resource "digitalocean_record" "www_cname" {
  count = var.create_www_cname && var.www_cname_target != "" ? 1 : 0

  domain = var.create_domain ? digitalocean_domain.main[0].name : var.domain_name
  type   = "CNAME"
  name   = "www"
  value  = var.www_cname_target
  ttl    = var.default_ttl
}

# Root domain A record (if enabled and not using domain creation with IP)
resource "digitalocean_record" "root_a" {
  count = !var.create_domain && var.root_a_record != "" ? 1 : 0

  domain = var.domain_name
  type   = "A"
  name   = "@"
  value  = var.root_a_record
  ttl    = var.default_ttl
}

# ----------------------------------------------------------------------------
# Project Assignment (Optional)
# ----------------------------------------------------------------------------

resource "digitalocean_project_resources" "domain" {
  count = var.create_domain && var.project_id != "" ? 1 : 0

  project = var.project_id
  resources = [
    digitalocean_domain.main[0].urn
  ]
}
