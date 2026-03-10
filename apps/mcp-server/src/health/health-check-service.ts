/**
 * ============================================================================
 * Ectropy Health Check Service
 * ============================================================================
 * Version: 1.0.0
 * Description: Enterprise-grade health check implementation with independent
 *              layers for liveness, readiness, and startup checks
 * Last Updated: 2025-12-14
 * ============================================================================
 */

import { Pool } from 'pg';
import Redis from 'ioredis';

/**
 * Health Check Status Enum
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
}

/**
 * Health Check Layer Types (Kubernetes-compatible)
 */
export enum HealthCheckType {
  LIVENESS = 'liveness', // Is the process alive?
  READINESS = 'readiness', // Can it accept work?
  STARTUP = 'startup', // Has initialization completed?
}

/**
 * Individual Component Health
 */
export interface ComponentHealth {
  status: HealthStatus;
  message: string;
  latency_ms?: number;
  details?: Record<string, any>;
  timestamp: string;
}

/**
 * Overall Health Response
 */
export interface HealthCheckResponse {
  status: HealthStatus;
  service: string;
  version: string;
  buildSha: string;
  environment: string;
  timestamp: string;
  uptime_seconds: number;
  checks: {
    liveness?: ComponentHealth;
    readiness?: ComponentHealth;
    startup?: ComponentHealth;
  };
  components?: {
    postgres?: ComponentHealth;
    redis?: ComponentHealth;
    filesystem?: ComponentHealth;
    memory?: ComponentHealth;
    external_apis?: ComponentHealth;
  };
  metadata?: Record<string, any>;
}

/**
 * Health Check Configuration
 */
export interface HealthCheckConfig {
  postgres?: {
    enabled: boolean;
    pool?: Pool;
    timeout_ms: number;
  };
  redis?: {
    enabled: boolean;
    client?: any; // ioredis client instance
    timeout_ms: number;
  };
  filesystem?: {
    enabled: boolean;
    paths_to_check: string[];
  };
  memory?: {
    enabled: boolean;
    max_heap_mb: number;
  };
  external_apis?: {
    enabled: boolean;
    endpoints: string[];
  };
}

/**
 * Enterprise Health Check Service
 */
export class HealthCheckService {
  private startTime: number;
  private config: HealthCheckConfig;
  private startupComplete: boolean = false;
  private lastHealthCheck: HealthCheckResponse | null = null;

  constructor(config: HealthCheckConfig = {}) {
    this.startTime = Date.now();
    this.config = {
      postgres: {
        enabled: false,
        timeout_ms: 5000,
        ...config.postgres,
      },
      redis: {
        enabled: false,
        timeout_ms: 5000,
        ...config.redis,
      },
      filesystem: {
        enabled: true,
        paths_to_check: ['/tmp', '/app/data'],
        ...config.filesystem,
      },
      memory: {
        enabled: true,
        max_heap_mb: 512,
        ...config.memory,
      },
      external_apis: {
        enabled: false,
        endpoints: [],
        ...config.external_apis,
      },
    };
  }

  /**
   * Mark startup as complete
   */
  public completeStartup(): void {
    this.startupComplete = true;
    console.log('✅ Health Check: Startup phase complete');
  }

  /**
   * Enable database connections after they're established
   */
  public enableDatabaseConnections(pgPool?: any, redisClient?: any): void {
    if (pgPool) {
      this.config.postgres = {
        enabled: true,
        pool: pgPool,
        timeout_ms: this.config.postgres?.timeout_ms || 5000,
      };
      console.log('✅ Health Check: PostgreSQL connection enabled');
    }
    if (redisClient) {
      this.config.redis = {
        enabled: true,
        client: redisClient,
        timeout_ms: this.config.redis?.timeout_ms || 3000,
      };
      console.log('✅ Health Check: Redis connection enabled');
    }
  }

  /**
   * Get uptime in seconds
   */
  private getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * LAYER 1: Liveness Check
   * Purpose: Is the process alive and not deadlocked?
   * Kubernetes Action: Restart container if fails
   * Endpoint: GET /health/live
   */
  public async checkLiveness(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      // Simple process check - if we get here, process is alive
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

      // Check for potential deadlock indicators
      const isResponsive = true; // If we executed this far, we're responsive

      if (!isResponsive) {
        return {
          status: HealthStatus.UNHEALTHY,
          message: 'Process appears deadlocked or unresponsive',
          latency_ms: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        status: HealthStatus.HEALTHY,
        message: 'Process is alive and responsive',
        latency_ms: Date.now() - startTime,
        details: {
          heap_used_mb: heapUsedMB,
          uptime_seconds: this.getUptimeSeconds(),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: HealthStatus.UNHEALTHY,
        message: `Liveness check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        latency_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * LAYER 2: Readiness Check
   * Purpose: Can the service accept and process requests?
   * Kubernetes Action: Remove from service endpoints if fails
   * Endpoint: GET /health/ready
   */
  public async checkReadiness(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      // Check if startup is complete
      if (!this.startupComplete) {
        return {
          status: HealthStatus.UNHEALTHY,
          message: 'Service still initializing',
          latency_ms: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        };
      }

      // Check critical dependencies
      const checks: ComponentHealth[] = [];

      // PostgreSQL readiness
      if (this.config.postgres?.enabled && this.config.postgres.pool) {
        const pgCheck = await this.checkPostgres();
        checks.push(pgCheck);
        if (pgCheck.status === HealthStatus.UNHEALTHY) {
          return {
            status: HealthStatus.UNHEALTHY,
            message: 'Critical dependency PostgreSQL unavailable',
            latency_ms: Date.now() - startTime,
            details: { postgres: pgCheck },
            timestamp: new Date().toISOString(),
          };
        }
      }

      // Redis readiness (degraded if fails, not unhealthy)
      if (this.config.redis?.enabled && this.config.redis.client) {
        const redisCheck = await this.checkRedis();
        checks.push(redisCheck);
        // Redis failure is degraded, not unhealthy (we can fallback to memory)
      }

      const allHealthy = checks.every((c) => c.status === HealthStatus.HEALTHY);
      const anyUnhealthy = checks.some(
        (c) => c.status === HealthStatus.UNHEALTHY
      );

      return {
        status: anyUnhealthy
          ? HealthStatus.UNHEALTHY
          : allHealthy
            ? HealthStatus.HEALTHY
            : HealthStatus.DEGRADED,
        message: allHealthy
          ? 'Service is ready to accept requests'
          : 'Service ready but with degraded dependencies',
        latency_ms: Date.now() - startTime,
        details: {
          checks: checks.length,
          healthy: checks.filter((c) => c.status === HealthStatus.HEALTHY)
            .length,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: HealthStatus.UNHEALTHY,
        message: `Readiness check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        latency_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * LAYER 3: Startup Check
   * Purpose: Has the application completed initialization?
   * Kubernetes Action: Wait for startup before running liveness/readiness
   * Endpoint: GET /health/startup
   */
  public async checkStartup(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      if (this.startupComplete) {
        return {
          status: HealthStatus.HEALTHY,
          message: 'Startup complete',
          latency_ms: Date.now() - startTime,
          details: {
            startup_duration_seconds: this.getUptimeSeconds(),
          },
          timestamp: new Date().toISOString(),
        };
      }

      // Check startup progress
      const progress = {
        environment_loaded: !!process.env.NODE_ENV,
        database_configured: this.config.postgres?.enabled
          ? !!this.config.postgres.pool
          : true,
        redis_configured: this.config.redis?.enabled
          ? !!this.config.redis.client
          : true,
      };

      const allConfigured = Object.values(progress).every((v) => v);

      if (allConfigured && !this.startupComplete) {
        // Auto-complete startup if all dependencies configured
        this.completeStartup();
      }

      return {
        status: this.startupComplete
          ? HealthStatus.HEALTHY
          : HealthStatus.UNHEALTHY,
        message: this.startupComplete
          ? 'Startup complete'
          : 'Startup in progress',
        latency_ms: Date.now() - startTime,
        details: progress,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: HealthStatus.UNHEALTHY,
        message: `Startup check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        latency_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Component Check: PostgreSQL
   */
  private async checkPostgres(): Promise<ComponentHealth> {
    const startTime = Date.now();

    if (!this.config.postgres?.enabled || !this.config.postgres.pool) {
      return {
        status: HealthStatus.HEALTHY,
        message: 'PostgreSQL check disabled',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const result = (await Promise.race([
        this.config.postgres.pool.query(
          'SELECT NOW() as time, version() as version'
        ),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('PostgreSQL health check timeout')),
            this.config.postgres!.timeout_ms
          )
        ),
      ])) as any;

      return {
        status: HealthStatus.HEALTHY,
        message: 'PostgreSQL connection healthy',
        latency_ms: Date.now() - startTime,
        details: {
          server_time: result.rows[0]?.time,
          version: result.rows[0]?.version?.substring(0, 50),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: HealthStatus.UNHEALTHY,
        message: `PostgreSQL unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`,
        latency_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Component Check: Redis
   */
  private async checkRedis(): Promise<ComponentHealth> {
    const startTime = Date.now();

    if (!this.config.redis?.enabled || !this.config.redis.client) {
      return {
        status: HealthStatus.HEALTHY,
        message: 'Redis check disabled',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const result = (await Promise.race([
        this.config.redis.client.ping(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Redis health check timeout')),
            this.config.redis!.timeout_ms
          )
        ),
      ])) as string;

      return {
        status:
          result === 'PONG' ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
        message:
          result === 'PONG'
            ? 'Redis connection healthy'
            : 'Redis responded but not with PONG',
        latency_ms: Date.now() - startTime,
        details: {
          response: result,
          connection_status: this.config.redis.client.status,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // Redis failure is degraded, not unhealthy (we have fallback)
      return {
        status: HealthStatus.DEGRADED,
        message: `Redis unavailable (using fallback): ${error instanceof Error ? error.message : 'Unknown error'}`,
        latency_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Component Check: Memory
   */
  private checkMemory(): ComponentHealth {
    const startTime = Date.now();

    try {
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
      const rssMB = Math.round(memoryUsage.rss / 1024 / 1024);

      const maxHeapMB = this.config.memory?.max_heap_mb || 512;
      const heapPercentage = (heapUsedMB / maxHeapMB) * 100;

      let status = HealthStatus.HEALTHY;
      let message = 'Memory usage normal';

      if (heapPercentage > 90) {
        status = HealthStatus.UNHEALTHY;
        message = 'Memory usage critical (>90%)';
      } else if (heapPercentage > 75) {
        status = HealthStatus.DEGRADED;
        message = 'Memory usage high (>75%)';
      }

      return {
        status,
        message,
        latency_ms: Date.now() - startTime,
        details: {
          heap_used_mb: heapUsedMB,
          heap_total_mb: heapTotalMB,
          rss_mb: rssMB,
          heap_percentage: Math.round(heapPercentage),
          max_heap_mb: maxHeapMB,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: HealthStatus.UNKNOWN,
        message: `Memory check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        latency_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Full Health Check (combines all checks)
   * Endpoint: GET /health
   */
  public async checkHealth(): Promise<HealthCheckResponse> {
    const liveness = await this.checkLiveness();
    const readiness = await this.checkReadiness();
    const startup = await this.checkStartup();

    // Component checks
    const components: HealthCheckResponse['components'] = {
      memory: this.checkMemory(),
    };

    if (this.config.postgres?.enabled) {
      components.postgres = await this.checkPostgres();
    }

    if (this.config.redis?.enabled) {
      components.redis = await this.checkRedis();
    }

    // Determine overall status
    let overallStatus = HealthStatus.HEALTHY;

    if (
      liveness.status === HealthStatus.UNHEALTHY ||
      startup.status === HealthStatus.UNHEALTHY
    ) {
      overallStatus = HealthStatus.UNHEALTHY;
    } else if (readiness.status === HealthStatus.UNHEALTHY) {
      overallStatus = HealthStatus.DEGRADED;
    } else if (
      readiness.status === HealthStatus.DEGRADED ||
      Object.values(components).some((c) => c?.status === HealthStatus.DEGRADED)
    ) {
      overallStatus = HealthStatus.DEGRADED;
    }

    const response: HealthCheckResponse = {
      status: overallStatus,
      service: 'ectropy-mcp-server',
      version: process.env.APP_VERSION || '1.0.0',
      buildSha: process.env.BUILD_SHA || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      uptime_seconds: this.getUptimeSeconds(),
      checks: {
        liveness,
        readiness,
        startup,
      },
      components,
      metadata: {
        hostname: process.env.HOSTNAME || 'unknown',
        region: process.env.DO_REGION || 'unknown',
        deployment: process.env.DEPLOYMENT_ENV || 'unknown',
      },
    };

    this.lastHealthCheck = response;
    return response;
  }

  /**
   * Get last health check (cached for load balancer efficiency)
   */
  public getLastHealthCheck(): HealthCheckResponse | null {
    return this.lastHealthCheck;
  }
}

/**
 * Singleton instance
 */
let healthCheckService: HealthCheckService | null = null;

export function initializeHealthCheck(
  config: HealthCheckConfig = {}
): HealthCheckService {
  if (!healthCheckService) {
    healthCheckService = new HealthCheckService(config);
    console.log('✅ Health Check Service initialized');
  }
  return healthCheckService;
}

export function getHealthCheckService(): HealthCheckService {
  if (!healthCheckService) {
    throw new Error(
      'Health Check Service not initialized. Call initializeHealthCheck() first.'
    );
  }
  return healthCheckService;
}

/**
 * Enable database connections in the health check service
 * Call this from main.ts after database connections are established
 */
export function enableHealthCheckDatabases(
  pgPool?: any,
  redisClient?: any
): void {
  const service = getHealthCheckService();
  service.enableDatabaseConnections(pgPool, redisClient);
}

/**
 * Mark startup as complete
 * Call this from main.ts after all initialization is done
 */
export function completeHealthCheckStartup(): void {
  const service = getHealthCheckService();
  service.completeStartup();
}
