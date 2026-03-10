// Health Check System for Ectropy Platform
// Simple implementation with minimal dependencies

export type HealthStatus = 'healthy' | 'unhealthy' | 'degraded';

export interface HealthIndicator {
  name: string;
  check(): Promise<HealthStatus>;
}

export interface HealthCheck {
  service: string;
  status: HealthStatus;
  timestamp: Date;
  version: string;
  checks: Array<{
    name: string;
    status: HealthStatus;
    timestamp: Date;
  }>;
}

export class HealthCheckSystem {
  private indicators: HealthIndicator[] = [];

  register(indicator: HealthIndicator) {
    this.indicators.push(indicator);
  }

  async checkHealth(): Promise<HealthCheck> {
    const checks = await Promise.allSettled(
      this.indicators.map(async (indicator) => ({
        name: indicator.name,
        status: await indicator
          .check()
          .catch(() => 'unhealthy' as HealthStatus),
        timestamp: new Date(),
      }))
    );

    const results = checks.map((result, index) =>
      result.status === 'fulfilled'
        ? result.value
        : {
            name: this.indicators[index].name,
            status: 'unhealthy' as HealthStatus,
            timestamp: new Date(),
          }
    );

    const overallStatus = results.every((r) => r.status === 'healthy')
      ? 'healthy'
      : results.some((r) => r.status === 'unhealthy')
        ? 'unhealthy'
        : 'degraded';

    return {
      service: process.env['SERVICE_NAME'] || 'unknown',
      status: overallStatus,
      timestamp: new Date(),
      version: process.env['npm_package_version'] || '0.0.0',
      checks: results,
    };
  }
}

// Database health indicator
export class DatabaseHealthIndicator implements HealthIndicator {
  name = 'database';

  async check(): Promise<HealthStatus> {
    // Implementation for DB health check
    try {
      // Simulate database check
      if (process.env['NODE_ENV'] === 'test') {
        return 'healthy';
      }
      // In real implementation: await db.query('SELECT 1');
      return 'healthy';
    } catch {
      return 'unhealthy';
    }
  }
}

// Redis health indicator
export class RedisHealthIndicator implements HealthIndicator {
  name = 'redis';

  async check(): Promise<HealthStatus> {
    // Implementation for Redis health check
    try {
      // Simulate Redis check
      if (process.env['NODE_ENV'] === 'test') {
        return 'healthy';
      }
      // In real implementation: await redis.ping();
      return 'healthy';
    } catch {
      return 'unhealthy';
    }
  }
}

// Memory health indicator
export class MemoryHealthIndicator implements HealthIndicator {
  name = 'memory';

  async check(): Promise<HealthStatus> {
    try {
      const memUsage = process.memoryUsage();
      const usedMB = memUsage.heapUsed / 1024 / 1024;
      const totalMB = memUsage.heapTotal / 1024 / 1024;
      const usagePercent = (usedMB / totalMB) * 100;

      if (usagePercent > 90) {
        return 'unhealthy';
      } else if (usagePercent > 70) {
        return 'degraded';
      }

      return 'healthy';
    } catch {
      return 'unhealthy';
    }
  }
}

// Default health check system with common indicators
export const defaultHealthSystem = new HealthCheckSystem();
defaultHealthSystem.register(new DatabaseHealthIndicator());
defaultHealthSystem.register(new RedisHealthIndicator());
defaultHealthSystem.register(new MemoryHealthIndicator());
