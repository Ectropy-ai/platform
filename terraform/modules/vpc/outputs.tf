# ============================================================================
# VPC Module Outputs
# ============================================================================

output "id" {
  description = "VPC ID"
  value       = digitalocean_vpc.main.id
}

output "urn" {
  description = "VPC URN"
  value       = digitalocean_vpc.main.urn
}

output "name" {
  description = "VPC name"
  value       = digitalocean_vpc.main.name
}

output "region" {
  description = "VPC region"
  value       = digitalocean_vpc.main.region
}

output "ip_range" {
  description = "VPC IP range"
  value       = digitalocean_vpc.main.ip_range
}

output "description" {
  description = "VPC description"
  value       = digitalocean_vpc.main.description
}

output "created_at" {
  description = "VPC creation timestamp"
  value       = digitalocean_vpc.main.created_at
}

output "default" {
  description = "Whether this is the default VPC for the region"
  value       = digitalocean_vpc.main.default
}

output "peering_id" {
  description = "VPC Peering ID (if enabled)"
  value       = var.enable_peering && var.peering_vpc_id != "" ? digitalocean_vpc_peering.peering[0].id : null
}

output "peering_status" {
  description = "VPC Peering status (if enabled)"
  value       = var.enable_peering && var.peering_vpc_id != "" ? digitalocean_vpc_peering.peering[0].status : null
}
