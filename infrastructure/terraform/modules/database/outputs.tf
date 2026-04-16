# ============================================================================
# Database Module Outputs
# ============================================================================

output "id" {
  description = "Database cluster ID"
  value       = digitalocean_database_cluster.main.id
}

output "urn" {
  description = "Database cluster URN"
  value       = digitalocean_database_cluster.main.urn
}

output "name" {
  description = "Database cluster name"
  value       = digitalocean_database_cluster.main.name
}

output "engine" {
  description = "Database engine"
  value       = digitalocean_database_cluster.main.engine
}

output "version" {
  description = "Database version"
  value       = digitalocean_database_cluster.main.version
}

output "host" {
  description = "Database host"
  value       = digitalocean_database_cluster.main.host
  sensitive   = true
}

output "private_host" {
  description = "Database private host (VPC)"
  value       = digitalocean_database_cluster.main.private_host
  sensitive   = true
}

output "port" {
  description = "Database port"
  value       = digitalocean_database_cluster.main.port
  sensitive   = true
}

output "uri" {
  description = "Database connection URI"
  value       = digitalocean_database_cluster.main.uri
  sensitive   = true
}

output "private_uri" {
  description = "Database private connection URI (VPC)"
  value       = digitalocean_database_cluster.main.private_uri
  sensitive   = true
}

output "database" {
  description = "Default database name"
  value       = digitalocean_database_cluster.main.database
}

output "user" {
  description = "Default database user"
  value       = digitalocean_database_cluster.main.user
  sensitive   = true
}

output "password" {
  description = "Default database password"
  value       = digitalocean_database_cluster.main.password
  sensitive   = true
}

output "region" {
  description = "Database region"
  value       = digitalocean_database_cluster.main.region
}

output "size" {
  description = "Database cluster size"
  value       = digitalocean_database_cluster.main.size
}

output "node_count" {
  description = "Number of nodes"
  value       = digitalocean_database_cluster.main.node_count
}

# NOTE: Status and created_at attributes not available in DigitalOcean provider
# output "status" {
#   description = "Database cluster status"
#   value       = digitalocean_database_cluster.main.status
# }

# output "created_at" {
#   description = "Database creation timestamp"
#   value       = digitalocean_database_cluster.main.created_at
# }

output "maintenance_window" {
  description = "Maintenance_window configuration"
  value = length(digitalocean_database_cluster.main.maintenance_window) > 0 ? {
    day  = digitalocean_database_cluster.main.maintenance_window[0].day
    hour = digitalocean_database_cluster.main.maintenance_window[0].hour
  } : null
}

output "databases" {
  description = "Created databases"
  value       = { for k, v in digitalocean_database_db.databases : k => v.name }
}

output "users" {
  description = "Created users"
  value       = { for k, v in digitalocean_database_user.users : k => v.name }
}

output "connection_pools" {
  description = "Created connection pools (PostgreSQL only)"
  value = { for k, v in digitalocean_database_connection_pool.pools : k => {
    name = v.name
    mode = v.mode
    size = v.size
    host = v.host
    port = v.port
    uri  = v.uri
  } }
  sensitive = true
}

output "read_replicas" {
  description = "Created read replicas"
  value = { for k, v in digitalocean_database_replica.replicas : k => {
    name   = v.name
    region = v.region
    host   = v.host
    port   = v.port
    uri    = v.uri
  } }
  sensitive = true
}

# Connection string helper
output "connection_string" {
  description = "Formatted connection string for application use"
  value = var.engine == "pg" ? format(
    "postgresql://%s:%s@%s:%d/%s",
    digitalocean_database_cluster.main.user,
    digitalocean_database_cluster.main.password,
    digitalocean_database_cluster.main.private_host != "" ? digitalocean_database_cluster.main.private_host : digitalocean_database_cluster.main.host,
    digitalocean_database_cluster.main.port,
    digitalocean_database_cluster.main.database
  ) : digitalocean_database_cluster.main.uri
  sensitive = true
}

# Connection info (referenced by root module)
output "connection_info" {
  description = "Database connection information"
  value = {
    id           = digitalocean_database_cluster.main.id
    name         = digitalocean_database_cluster.main.name
    engine       = digitalocean_database_cluster.main.engine
    version      = digitalocean_database_cluster.main.version
    host         = digitalocean_database_cluster.main.host
    private_host = digitalocean_database_cluster.main.private_host
    port         = digitalocean_database_cluster.main.port
    database     = digitalocean_database_cluster.main.database
    user         = digitalocean_database_cluster.main.user
    password     = digitalocean_database_cluster.main.password
    uri          = digitalocean_database_cluster.main.uri
    private_uri  = digitalocean_database_cluster.main.private_uri
  }
  sensitive = true
}

# Alias for database_id (referenced by root module)
output "database_id" {
  description = "Database cluster ID (alias)"
  value       = digitalocean_database_cluster.main.id
}
