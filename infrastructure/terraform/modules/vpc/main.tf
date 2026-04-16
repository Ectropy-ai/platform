# ============================================================================
# Ectropy VPC Module
# ============================================================================
# Description: Creates DigitalOcean Virtual Private Cloud for network isolation
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
# Local Variables
# ----------------------------------------------------------------------------

locals {
  # Construct VPC name
  vpc_name = var.name != "" ? var.name : "${var.project_name}-${var.environment}-vpc"

  # Description
  vpc_description = var.description != "" ? var.description : "VPC for ${var.project_name} ${var.environment} environment"
}

# ----------------------------------------------------------------------------
# VPC Resource
# ----------------------------------------------------------------------------

resource "digitalocean_vpc" "main" {
  name        = local.vpc_name
  region      = var.region
  ip_range    = var.ip_range
  description = local.vpc_description

  timeouts {
    delete = var.delete_timeout
  }
}

# ----------------------------------------------------------------------------
# VPC Peering (Optional - for multi-region setups)
# ----------------------------------------------------------------------------

# VPC Peering allows connecting VPCs across regions
# This is optional and controlled by var.enable_peering

resource "digitalocean_vpc_peering" "peering" {
  count = var.enable_peering && var.peering_vpc_id != "" ? 1 : 0

  name = "${local.vpc_name}-peering"
  vpc_ids = [
    digitalocean_vpc.main.id,
    var.peering_vpc_id
  ]
}

# ----------------------------------------------------------------------------
# Project Assignment (Optional)
# ----------------------------------------------------------------------------

resource "digitalocean_project_resources" "vpc" {
  count = var.project_id != "" ? 1 : 0

  project = var.project_id
  resources = [
    digitalocean_vpc.main.urn
  ]
}
