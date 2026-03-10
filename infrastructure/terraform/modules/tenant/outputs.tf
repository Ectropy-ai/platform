# Outputs for Multi-Tenant Module

output "tenant_id" {
  value       = var.tenant_id
  description = "Tenant identifier"
}

output "tenant_name" {
  value       = var.tenant_name
  description = "Tenant display name"
}

output "isolation_tier" {
  value       = var.isolation_tier
  description = "Tenant isolation tier (schema, database, or dedicated)"
}

output "data_residency_region" {
  value       = var.data_residency_region
  description = "Data residency region for compliance"
}

output "database_connection" {
  value       = "See main.tf for conditional database_connection output"
  description = "Database connection details (sensitive, output from main.tf)"
  sensitive   = true
}

output "database_id" {
  value       = null
  description = "Database cluster ID (only for database-per-tenant isolation)"
}

output "droplet_ip" {
  value       = null
  description = "Droplet IP address (only for dedicated infrastructure)"
}
