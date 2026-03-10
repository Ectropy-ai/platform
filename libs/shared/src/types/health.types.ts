/**
 * Health monitoring types for the Ectropy platform
 */

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services: ServiceHealth[];
  overall: OverallHealth;
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  responseTime?: number;
  lastCheck: Date;
  details?: Record<string, any>;
}

export interface OverallHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  score: number; // 0-100
  uptime: number; // in seconds
  version: string;
}

export interface HealthCheck {
  name: string;
  description: string;
  check: () => Promise<HealthCheckResult>;
  timeout?: number;
  interval?: number;
  critical?: boolean;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  timestamp: Date;
  responseTime: number;
  details?: Record<string, any>;
}

export interface DatabaseHealth {
  connected: boolean;
  responseTime?: number;
  connectionCount?: number;
  queryCount?: number;
  errorRate?: number;
}

export interface RedisHealth {
  connected: boolean;
  responseTime?: number;
  memoryUsage?: number;
  keyCount?: number;
  errorRate?: number;
}

export interface SystemHealth {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkLatency?: number;
  uptime: number;
}

export interface PerformanceMetrics {
  requestsPerSecond: number;
  averageResponseTime: number;
  errorRate: number;
  throughput: number;
  activeConnections: number;
}