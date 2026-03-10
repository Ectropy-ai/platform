/**
 * Health endpoint response schema
 */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'partial' | 'unhealthy' | 'error';
  score: number; // REQUIRED: 0-100 weighted health score
  version: string;
  environment: string;
  uptime: number;
  timestamp: string;
  response_time: number;
  checks: {
    database?: {
      status: 'healthy' | 'connected' | 'disconnected' | 'not_configured' | 'degraded' | 'using_fallback';
      latency?: number;
    };
    redis?: {
      status: 'healthy' | 'connected' | 'disconnected' | 'using_fallback' | 'unhealthy' | 'degraded';
      latency?: number;
    };
    memory: 'healthy' | 'degraded' | 'unhealthy' | 'warning';
    disk?: 'healthy' | 'degraded' | 'unhealthy';
  };
  memory: {
    rss: number;
    total: number;
    used: number;
    external: number;
  };
}
