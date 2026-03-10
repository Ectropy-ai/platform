import { Logger } from '../../utils/src/logger.js';

const logger = new Logger('HealthManager');

/**
 * Health check interface
 */
export interface HealthCheck {
  name: string;
  description: string;
  check: () => Promise<boolean>;
  critical: boolean;
  timeout?: number;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'unhealthy' | 'timeout';
  responseTime: number;
  error?: string;
  critical: boolean;
}

/**
 * Overall health status
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  checks: HealthCheckResult[];
  uptime: number;
}

/**
 * Health manager for service dependency management and health monitoring
 */
export class HealthManager {
  private checks: HealthCheck[] = [];
  private startTime = Date.now();

  /**
   * Register a health check
   */
  public addHealthCheck(check: HealthCheck): void {
    this.checks.push(check);
    logger.info(`Registered health check: ${check.name} (${check.critical ? 'critical' : 'optional'})`);
  }

  /**
   * Wait for critical dependencies to become available
   */
  public async waitForDependencies(maxRetries = 30, retryIntervalMs = 1000): Promise<void> {
    logger.info('🔍 Waiting for critical dependencies...');
    
    const criticalChecks = this.checks.filter(check => check.critical);
    
    if (criticalChecks.length === 0) {
      logger.info('✅ No critical dependencies to wait for');
      return;
    }

    for (const check of criticalChecks) {
      logger.info(`   Checking: ${check.name}`);
      
      let attempts = 0;
      let isHealthy = false;

      while (attempts < maxRetries && !isHealthy) {
        try {
          const timeout = check.timeout || 5000;
          isHealthy = await Promise.race([
            check.check(),
            new Promise<boolean>((_, reject) => 
              setTimeout(() => reject(new Error('Health check timeout')), timeout)
            ),
          ]);

          if (isHealthy) {
            logger.info(`   ✅ ${check.name} is ready`);
            break;
          }
        } catch (error) {
          logger.debug(`   ⏳ ${check.name} not ready (attempt ${attempts + 1}/${maxRetries}):`, 
                      error instanceof Error ? error.message : 'Unknown error');
        }

        attempts++;
        if (attempts < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryIntervalMs));
        }
      }

      if (!isHealthy) {
        const errorMsg = `Critical dependency ${check.name} failed to become ready after ${maxRetries} attempts`;
        logger.error(`❌ ${errorMsg}`);
        throw new Error(errorMsg);
      }
    }

    logger.info('✅ All critical dependencies are ready');
  }

  /**
   * Perform health check for all registered services
   */
  public async performHealthCheck(): Promise<HealthStatus> {
    logger.debug('Performing health check...');
    
    const results: HealthCheckResult[] = [];
    let healthyCount = 0;
    let criticalFailures = 0;

    // Execute all health checks concurrently
    const checkPromises = this.checks.map(async (check): Promise<HealthCheckResult> => {
      const startTime = Date.now();
      
      try {
        const timeout = check.timeout || 5000;
        const isHealthy = await Promise.race([
          check.check(),
          new Promise<boolean>((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), timeout)
          ),
        ]);

        const result: HealthCheckResult = {
          name: check.name,
          status: isHealthy ? 'healthy' : 'unhealthy',
          responseTime: Date.now() - startTime,
          critical: check.critical,
        };

        if (!isHealthy && check.critical) {
          result.error = 'Health check returned false';
        }

        return result;
      } catch (error) {
        return {
          name: check.name,
          status: error instanceof Error && error.message === 'Health check timeout' ? 'timeout' : 'unhealthy',
          responseTime: Date.now() - startTime,
          error: error instanceof Error ? error.message : 'Unknown error',
          critical: check.critical,
        };
      }
    });

    // Wait for all checks to complete
    const checkResults = await Promise.all(checkPromises);
    results.push(...checkResults);

    // Calculate overall health status
    for (const result of results) {
      if (result.status === 'healthy') {
        healthyCount++;
      } else if (result.critical) {
        criticalFailures++;
      }
    }

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (criticalFailures > 0) {
      overallStatus = 'unhealthy';
    } else if (healthyCount === results.length) {
      overallStatus = 'healthy';
    } else {
      overallStatus = 'degraded';
    }

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date(),
      checks: results,
      uptime: Date.now() - this.startTime,
    };

    this.logHealthStatus(healthStatus);
    return healthStatus;
  }

  /**
   * Get a simple health check endpoint response
   */
  public async getHealthEndpoint(): Promise<{
    status: string;
    timestamp: string;
    uptime: number;
    version?: string;
    checks?: { [key: string]: { status: string; responseTime: number } };
  }> {
    try {
      const health = await this.performHealthCheck();
      
      const checksMap: { [key: string]: { status: string; responseTime: number } } = {};
      health.checks.forEach(check => {
        checksMap[check.name] = {
          status: check.status,
          responseTime: check.responseTime,
        };
      });

      return {
        status: health.status,
        timestamp: health.timestamp.toISOString(),
        uptime: health.uptime,
        version: process.env.npm_package_version,
        checks: checksMap,
      };
    } catch (error) {
      logger.error('Health check endpoint failed:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime,
        version: process.env.npm_package_version,
      };
    }
  }

  /**
   * Log health status summary
   */
  private logHealthStatus(health: HealthStatus): void {
    const emoji = health.status === 'healthy' ? '✅' : 
                  health.status === 'degraded' ? '⚠️' : '❌';
    
    logger.info(`${emoji} Health Status: ${health.status.toUpperCase()}`);
    
    // Log critical issues first
    const criticalIssues = health.checks.filter(check => check.critical && check.status !== 'healthy');
    if (criticalIssues.length > 0) {
      logger.error('❌ Critical Issues:');
      criticalIssues.forEach(check => {
        logger.error(`   ${check.name}: ${check.status} ${check.error ? `(${check.error})` : ''}`);
      });
    }

    // Log non-critical issues
    const nonCriticalIssues = health.checks.filter(check => !check.critical && check.status !== 'healthy');
    if (nonCriticalIssues.length > 0) {
      logger.warn('⚠️ Non-Critical Issues:');
      nonCriticalIssues.forEach(check => {
        logger.warn(`   ${check.name}: ${check.status} ${check.error ? `(${check.error})` : ''}`);
      });
    }

    // Log healthy services in debug mode
    const healthyServices = health.checks.filter(check => check.status === 'healthy');
    if (healthyServices.length > 0) {
      logger.debug('✅ Healthy Services:', healthyServices.map(check => check.name).join(', '));
    }
  }

  /**
   * Create common health checks for typical dependencies
   */
  public static createCommonHealthChecks() {
    const commonChecks: HealthCheck[] = [];

    // PostgreSQL health check
    commonChecks.push({
      name: 'postgresql',
      description: 'PostgreSQL database connectivity',
      critical: true,
      timeout: 5000,
      check: async () => {
        // This will be implemented by the service that uses it
        // For now, return a basic check
        const host = process.env.DATABASE_HOST;
        const port = process.env.DATABASE_PORT;
        return !!(host && port);
      },
    });

    // Redis health check
    commonChecks.push({
      name: 'redis',
      description: 'Redis cache connectivity',
      critical: false, // Redis failures shouldn't stop the service
      timeout: 3000,
      check: async () => {
        const host = process.env.REDIS_HOST;
        const port = process.env.REDIS_PORT;
        return !!(host && port);
      },
    });

    // Qdrant health check
    commonChecks.push({
      name: 'qdrant',
      description: 'Qdrant vector database connectivity',
      critical: false,
      timeout: 5000,
      check: async () => {
        const url = process.env.QDRANT_URL;
        return !!url;
      },
    });

    return commonChecks;
  }
}