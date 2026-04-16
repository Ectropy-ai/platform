# ============================================================================
# DNS Module Outputs
# ============================================================================

output "domain_name" {
  description = "Domain name"
  value       = var.domain_name
}

output "domain_urn" {
  description = "Domain URN (if created)"
  value       = var.create_domain ? digitalocean_domain.main[0].urn : null
}

output "nameservers" {
  description = "Nameservers for the domain"
  value = var.create_domain ? [
    "ns1.digitalocean.com",
    "ns2.digitalocean.com",
    "ns3.digitalocean.com"
  ] : []
}

output "a_records" {
  description = "Created A records"
  value = { for k, v in digitalocean_record.a_records : k => {
    name  = v.name
    value = v.value
    fqdn  = v.fqdn
    ttl   = v.ttl
  } }
}

output "aaaa_records" {
  description = "Created AAAA records"
  value = { for k, v in digitalocean_record.aaaa_records : k => {
    name  = v.name
    value = v.value
    fqdn  = v.fqdn
    ttl   = v.ttl
  } }
}

output "cname_records" {
  description = "Created CNAME records"
  value = { for k, v in digitalocean_record.cname_records : k => {
    name  = v.name
    value = v.value
    fqdn  = v.fqdn
    ttl   = v.ttl
  } }
}

output "mx_records" {
  description = "Created MX records"
  value = { for k, v in digitalocean_record.mx_records : k => {
    name     = v.name
    value    = v.value
    priority = v.priority
    fqdn     = v.fqdn
    ttl      = v.ttl
  } }
}

output "txt_records" {
  description = "Created TXT records"
  value = { for k, v in digitalocean_record.txt_records : k => {
    name  = v.name
    value = v.value
    fqdn  = v.fqdn
    ttl   = v.ttl
  } }
}

output "srv_records" {
  description = "Created SRV records"
  value = { for k, v in digitalocean_record.srv_records : k => {
    name     = v.name
    value    = v.value
    priority = v.priority
    port     = v.port
    weight   = v.weight
    fqdn     = v.fqdn
    ttl      = v.ttl
  } }
}

output "caa_records" {
  description = "Created CAA records"
  value = { for k, v in digitalocean_record.caa_records : k => {
    name  = v.name
    value = v.value
    flags = v.flags
    tag   = v.tag
    fqdn  = v.fqdn
    ttl   = v.ttl
  } }
}

output "ns_records" {
  description = "Created NS records"
  value = { for k, v in digitalocean_record.ns_records : k => {
    name  = v.name
    value = v.value
    fqdn  = v.fqdn
    ttl   = v.ttl
  } }
}

output "www_cname" {
  description = "WWW CNAME record (if created)"
  value = var.create_www_cname && var.www_cname_target != "" ? {
    name  = digitalocean_record.www_cname[0].name
    value = digitalocean_record.www_cname[0].value
    fqdn  = digitalocean_record.www_cname[0].fqdn
    ttl   = digitalocean_record.www_cname[0].ttl
  } : null
}

output "root_a_record" {
  description = "Root A record (if created)"
  value = !var.create_domain && var.root_a_record != "" ? {
    name  = digitalocean_record.root_a[0].name
    value = digitalocean_record.root_a[0].value
    fqdn  = digitalocean_record.root_a[0].fqdn
    ttl   = digitalocean_record.root_a[0].ttl
  } : null
}

output "record_count" {
  description = "Total number of DNS records created"
  value = (
    length(digitalocean_record.a_records) +
    length(digitalocean_record.aaaa_records) +
    length(digitalocean_record.cname_records) +
    length(digitalocean_record.mx_records) +
    length(digitalocean_record.txt_records) +
    length(digitalocean_record.srv_records) +
    length(digitalocean_record.caa_records) +
    length(digitalocean_record.ns_records) +
    (var.create_www_cname && var.www_cname_target != "" ? 1 : 0) +
    (!var.create_domain && var.root_a_record != "" ? 1 : 0)
  )
}
