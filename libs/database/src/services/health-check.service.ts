/**
 * Health Check Service for Database and Cache Systems
 */

import { logger } from '../utils/logger.js';
import { HealthCheckResult } from '../types/database.types.js';
import { CacheService } from './cache.service.js';
import { DatabaseService } from './database.service.js';
export class HealthCheckService {
  private databaseService: DatabaseService;
  private cacheService: CacheService;
  constructor(databaseService: DatabaseService, cacheService: CacheService) {
    this.databaseService = databaseService;
    this.cacheService = cacheService;
  }
  public async checkDatabase(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const isHealthy = await this.databaseService.healthCheck();
      const latency = Date.now() - start;
      return {
        service: 'database',
        status: isHealthy ? 'healthy' : 'unhealthy',
        latency,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        service: 'database',
        status: 'unhealthy',
        error: (error as Error).message,
        timestamp: new Date(),
      };
    }
  }
  public async checkCache(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const isHealthy = await this.cacheService.healthCheck();
      const latency = Date.now() - start;
      return {
        service: 'cache',
        status: isHealthy ? 'healthy' : 'unhealthy',
        latency,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        service: 'cache',
        status: 'unhealthy',
        error: (error as Error).message,
        timestamp: new Date(),
      };
    }
  }
  public async checkAll(): Promise<HealthCheckResult[]> {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkCache(),
    ]);
    const results: HealthCheckResult[] = [];
    checks.forEach((check, index) => {
      const serviceName = index === 0 ? 'database' : 'cache';
      if (check.status === 'fulfilled' && check.value) {
        results.push(check.value);
      } else if (check.status === 'rejected') {
        results.push({
          service: serviceName,
          status: 'unhealthy',
          error:
            check.reason instanceof Error
              ? check.reason.message
              : String(check.reason),
          timestamp: new Date(),
        });
      } else {
        results.push({
          service: serviceName,
          status: 'unhealthy',
          error: 'Unknown error',
          timestamp: new Date(),
        });
      }
    });
    return results;
  }
  public async getSystemStatus(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: HealthCheckResult[];
    metrics: any;
  }> {
    const services = await this.checkAll();
    const healthyCount = services.filter((s) => s.status === 'healthy').length;
    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyCount === services.length) {
      overall = 'healthy';
    } else if (healthyCount > 0) {
      overall = 'degraded';
    } else {
      overall = 'unhealthy';
    }
    const metrics = {
      database: this.databaseService.getMetrics(),
      cache: this.cacheService.getInfo(),
    };
    logger.info('System health check completed', {
      overall,
      healthyServices: healthyCount,
      totalServices: services.length,
    });
    return {
      overall,
      services,
      metrics,
    };
  }
}
