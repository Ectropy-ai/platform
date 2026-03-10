# Variables for Multi-Tenant Module

variable "tenant_id" {
  description = "Unique tenant identifier (slug) - lowercase alphanumeric with hyphens"
  type        = string
}

variable "tenant_name" {
  description = "Human-readable tenant name for display and documentation"
  type        = string
}

variable "data_residency_region" {
  description = "Geographic region for data residency compliance (us, canada, eu, uk, apac)"
  type        = string
  default     = "us"
}

variable "isolation_tier" {
  description = "Tenant isolation strategy: schema (shared), database (dedicated DB), dedicated (full infra)"
  type        = string
  default     = "schema"
}

variable "ssh_key_fingerprint" {
  description = "SSH key fingerprint for server access (required for dedicated tier)"
  type        = string
  default     = ""
}
