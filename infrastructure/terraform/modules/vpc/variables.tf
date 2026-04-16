# ============================================================================
# VPC Module Variables
# ============================================================================

variable "name" {
  description = "VPC name (leave empty to auto-generate)"
  type        = string
  default     = ""
}

variable "project_name" {
  description = "Project name for naming convention"
  type        = string
  default     = "ectropy"
}

variable "environment" {
  description = "Environment (development, staging, production)"
  type        = string
}

variable "region" {
  description = "DigitalOcean region for VPC"
  type        = string
  default     = "sfo3"
  validation {
    condition     = contains(["nyc1", "nyc3", "sfo3", "sgp1", "lon1", "fra1", "tor1", "ams3", "blr1"], var.region)
    error_message = "Region must be a valid DigitalOcean region"
  }
}

variable "ip_range" {
  description = "IP range for VPC in CIDR notation"
  type        = string
  default     = "10.124.0.0/20"
  validation {
    condition     = can(cidrhost(var.ip_range, 0))
    error_message = "IP range must be a valid CIDR block"
  }
}

variable "description" {
  description = "VPC description"
  type        = string
  default     = ""
}

variable "project_id" {
  description = "DigitalOcean project ID for resource organization"
  type        = string
  default     = ""
}

variable "enable_peering" {
  description = "Enable VPC peering"
  type        = bool
  default     = false
}

variable "peering_vpc_id" {
  description = "VPC ID to peer with"
  type        = string
  default     = ""
}

variable "delete_timeout" {
  description = "Timeout for VPC deletion"
  type        = string
  default     = "5m"
}
