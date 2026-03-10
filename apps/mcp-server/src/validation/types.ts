/**
 * MCP Server Health Check Types
 */

export interface HealthCheck {
  component: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  timestamp: Date;
  responseTime?: number;
  details?: Record<string, any>;
}

export interface ValidationResult {
  overall: 'healthy' | 'unhealthy' | 'degraded';
  checks: HealthCheck[];
  summary: {
    healthy: number;
    unhealthy: number;
    degraded: number;
    total: number;
  };
  timestamp: Date;
}

export interface ToolValidation {
  name: string;
  registered: boolean;
  callable: boolean;
  lastCalled?: Date;
  errorCount: number;
  responseTime?: number;
}

export interface MCPServerHealth {
  server: {
    status: 'running' | 'stopped' | 'error';
    uptime: number;
    port: number;
    pid?: number;
  };
  database: {
    postgres: HealthCheck;
    redis: HealthCheck;
  };
  tools: ToolValidation[];
  api: {
    endpoints: HealthCheck[];
    totalRequests: number;
    errorRate: number;
  };
  resources: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
  };
}