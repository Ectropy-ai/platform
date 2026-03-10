/**
 * Database configuration types and interfaces
 */

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  maxUses?: number;
}
export interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
}

export interface ConnectionPoolMetrics {
  totalConnections: number;
  idleConnections: number;
  waitingCount: number;
}

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  latency?: number;
  error?: string;
  timestamp: Date;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  command: string;
  fields?: any[];
}

export interface CacheEntry<T = any> {
  value: T;
  ttl?: number;
  createdAt: Date;
}
