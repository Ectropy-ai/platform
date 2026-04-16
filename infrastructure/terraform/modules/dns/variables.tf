# ============================================================================
# DNS Module Variables
# ============================================================================

variable "domain_name" {
  description = "Domain name (e.g., ectropy.ai)"
  type        = string
  validation {
    condition     = can(regex("^([a-z0-9]+(-[a-z0-9]+)*\\.)+[a-z]{2,}$", var.domain_name))
    error_message = "Domain name must be a valid DNS name"
  }
}

variable "create_domain" {
  description = "Create the domain (zone) resource (false if domain already exists)"
  type        = bool
  default     = true
}

variable "primary_ip" {
  description = "Primary IP address for domain creation"
  type        = string
  default     = ""
}

variable "default_ttl" {
  description = "Default TTL for DNS records (seconds)"
  type        = number
  default     = 300
  validation {
    condition     = var.default_ttl >= 30 && var.default_ttl <= 86400
    error_message = "TTL must be between 30 and 86400 seconds"
  }
}

# ----------------------------------------------------------------------------
# A Records
# ----------------------------------------------------------------------------

variable "a_records" {
  description = "Map of A records to create"
  type = map(object({
    value = string
    ttl   = optional(number)
  }))
  default = {}
}

# ----------------------------------------------------------------------------
# AAAA Records (IPv6)
# ----------------------------------------------------------------------------

variable "aaaa_records" {
  description = "Map of AAAA records to create"
  type = map(object({
    value = string
    ttl   = optional(number)
  }))
  default = {}
}

# ----------------------------------------------------------------------------
# CNAME Records
# ----------------------------------------------------------------------------

variable "cname_records" {
  description = "Map of CNAME records to create"
  type = map(object({
    value = string
    ttl   = optional(number)
  }))
  default = {}
}

# ----------------------------------------------------------------------------
# MX Records
# ----------------------------------------------------------------------------

variable "mx_records" {
  description = "Map of MX records to create"
  type = map(object({
    value    = string
    priority = number
    name     = optional(string)
    ttl      = optional(number)
  }))
  default = {}
}

# ----------------------------------------------------------------------------
# TXT Records
# ----------------------------------------------------------------------------

variable "txt_records" {
  description = "Map of TXT records to create"
  type = map(object({
    value = string
    ttl   = optional(number)
  }))
  default = {}
}

# ----------------------------------------------------------------------------
# SRV Records
# ----------------------------------------------------------------------------

variable "srv_records" {
  description = "Map of SRV records to create"
  type = map(object({
    value    = string
    priority = number
    port     = number
    weight   = number
    ttl      = optional(number)
  }))
  default = {}
}

# ----------------------------------------------------------------------------
# CAA Records
# ----------------------------------------------------------------------------

variable "caa_records" {
  description = "Map of CAA records to create"
  type = map(object({
    value = string
    flags = number
    tag   = string
    name  = optional(string)
    ttl   = optional(number)
  }))
  default = {}
}

# ----------------------------------------------------------------------------
# NS Records
# ----------------------------------------------------------------------------

variable "ns_records" {
  description = "Map of NS records to create"
  type = map(object({
    value = string
    ttl   = optional(number)
  }))
  default = {}
}

# ----------------------------------------------------------------------------
# Convenience Variables
# ----------------------------------------------------------------------------

variable "create_www_cname" {
  description = "Create www CNAME record"
  type        = bool
  default     = false
}

variable "www_cname_target" {
  description = "Target for www CNAME (typically '@' or domain name)"
  type        = string
  default     = ""
}

variable "root_a_record" {
  description = "IP address for root (@) A record"
  type        = string
  default     = ""
}

# ----------------------------------------------------------------------------
# Project Assignment
# ----------------------------------------------------------------------------

variable "project_id" {
  description = "DigitalOcean project ID"
  type        = string
  default     = ""
}

# ----------------------------------------------------------------------------
# Lifecycle Management
# ----------------------------------------------------------------------------

variable "prevent_destroy" {
  description = "Prevent domain destruction"
  type        = bool
  default     = true
}
