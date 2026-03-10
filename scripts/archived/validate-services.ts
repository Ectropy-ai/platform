#!/usr/bin/env node

/**
 * Service Health Validation System
 * Validates PostgreSQL, Redis, and MCP Server health for CI/CD pipeline
 */

import { Client as PgClient } from 'pg';
import Redis from 'ioredis';

interface ServiceHealth {
  service: string;
  status: 'healthy' | 'unhealthy';
  latency?: number;
  error?: string;
  details?: Record<string, any>;
}

class ServiceValidator {
  private readonly connectionTimeout = 5000;
  private readonly healthTimeout = 10000;

  async validatePostgres(): Promise<ServiceHealth> {
    const start = Date.now();

    // Try multiple connection configurations
    const connectionConfigs = [
      process.env.DATABASE_URL,
      `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || process.env.POSTGRES_DEV_PASSWORD}@${process.env.DB_HOST || 'localhost'}:5432/${process.env.DB_NAME || 'postgres'}`,
      'postgresql://postgres:${POSTGRES_PASSWORD}@localhost:5432/postgres', // Fallback for local testing
    ].filter(Boolean);

    for (const connectionString of connectionConfigs) {
      const client = new PgClient({
        connectionString,
        connectionTimeoutMillis: this.connectionTimeout,
        query_timeout: this.connectionTimeout,
        statement_timeout: this.connectionTimeout,
      });

      try {
        await client.connect();

        // Test basic query
        const result = await client.query(
          'SELECT version(), now() as timestamp'
        );
        await client.end();

        return {
          service: 'PostgreSQL',
          status: 'healthy',
          latency: Date.now() - start,
          details: {
            version: result.rows[0].version,
            timestamp: result.rows[0].timestamp,
            connectionString: connectionString?.replace(/:([^:@]*?)@/, ':***@'), // Mask password
          },
        };
      } catch (error) {
        await client.end().catch(() => {}); // Ignore cleanup errors

        // If this is the last config, return error
        if (
          connectionString === connectionConfigs[connectionConfigs.length - 1]
        ) {
          return {
            service: 'PostgreSQL',
            status: 'unhealthy',
            error: error instanceof Error ? error.message : String(error),
            details: {
              attemptedConfigs: connectionConfigs.length,
              lastConnectionString: connectionString?.replace(
                /:([^:@]*?)@/,
                ':***@'
              ),
            },
          };
        }
      }
    }

    return {
      service: 'PostgreSQL',
      status: 'unhealthy',
      error: 'No valid connection configuration found',
    };
  }

  async validateRedis(): Promise<ServiceHealth> {
    const start = Date.now();

    // Try multiple Redis configurations
    const redisConfigs = [
      // From environment variables
      process.env.REDIS_URL,
      // Constructed from individual vars
      `redis://:${process.env.REDIS_PASSWORD || process.env.REDIS_DEV_PASSWORD}@${process.env.REDIS_HOST || 'localhost'}:6379`,
      // No password fallback for local development
      'redis://localhost:6379',
    ].filter(Boolean);

    for (const redisUrl of redisConfigs) {
      let redis: Redis | null = null;

      try {
        // Parse Redis URL for connection
        let redisOptions: any = {
          connectTimeout: this.connectionTimeout,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        };

        if (redisUrl.includes('@')) {
          // URL format: redis://:password@host:port
          const url = new URL(redisUrl);
          redisOptions.host = url.hostname;
          redisOptions.port = parseInt(url.port) || 6379;
          if (url.password) {
            redisOptions.password = url.password;
          }
        } else {
          // Simple host:port or just redis://host:port
          redisOptions.host = 'localhost';
          redisOptions.port = 6379;
        }

        redis = new Redis(redisOptions);

        // Test connection
        await redis.connect();

        // Test basic operations
        const pong = await redis.ping();
        const info = await redis.info('server');

        await redis.quit();

        return {
          service: 'Redis',
          status: 'healthy',
          latency: Date.now() - start,
          details: {
            ping: pong,
            server_info: info
              .split('\r\n')
              .find((line) => line.startsWith('redis_version:'))
              ?.split(':')[1],
            host: redisOptions.host,
            port: redisOptions.port,
          },
        };
      } catch (error) {
        if (redis) {
          await redis.quit().catch(() => {}); // Ignore cleanup errors
        }

        // If this is the last config, return error
        if (redisUrl === redisConfigs[redisConfigs.length - 1]) {
          return {
            service: 'Redis',
            status: 'unhealthy',
            error: error instanceof Error ? error.message : String(error),
            details: {
              attemptedConfigs: redisConfigs.length,
              lastUrl: redisUrl?.replace(/:([^:@]*?)@/, ':***@'), // Mask password
            },
          };
        }
      }
    }

    return {
      service: 'Redis',
      status: 'unhealthy',
      error: 'No valid Redis configuration found',
    };
  }

  async validateMCP(): Promise<ServiceHealth> {
    const start = Date.now();

    // Try different MCP server endpoints
    const mcpEndpoints = [
      `http://localhost:${process.env.MCP_PORT || 3001}/health`,
      'http://localhost:3020/health', // Alternative port
      'http://localhost:3001/health', // Default port
    ];

    for (const endpoint of mcpEndpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.connectionTimeout
        );

        const response = await fetch(endpoint, {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'ServiceValidator/1.0',
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const healthData = await response.json();

        return {
          service: 'MCP Server',
          status: 'healthy',
          latency: Date.now() - start,
          details: {
            endpoint,
            status: healthData.status,
            timestamp: healthData.timestamp,
            service_name: healthData.service,
          },
        };
      } catch (error) {
        // If this is the last endpoint, return error
        if (endpoint === mcpEndpoints[mcpEndpoints.length - 1]) {
          return {
            service: 'MCP Server',
            status: 'unhealthy',
            error: error instanceof Error ? error.message : String(error),
            details: {
              attemptedEndpoints: mcpEndpoints.length,
              lastEndpoint: endpoint,
            },
          };
        }
      }
    }

    return {
      service: 'MCP Server',
      status: 'unhealthy',
      error: 'No MCP server endpoints responding',
    };
  }

  async validateAll(): Promise<ServiceHealth[]> {
    console.log('🔍 Starting comprehensive service health validation...');
    console.log('==================================================');

    // Run all validations in parallel for speed
    const validationPromises = [
      this.validatePostgres().catch((error) => ({
        service: 'PostgreSQL',
        status: 'unhealthy' as const,
        error: `Validation failed: ${error.message}`,
      })),
      this.validateRedis().catch((error) => ({
        service: 'Redis',
        status: 'unhealthy' as const,
        error: `Validation failed: ${error.message}`,
      })),
      this.validateMCP().catch((error) => ({
        service: 'MCP Server',
        status: 'unhealthy' as const,
        error: `Validation failed: ${error.message}`,
      })),
    ];

    const results = await Promise.all(validationPromises);

    // Enhanced console output
    console.log('\n📊 Service Health Results:');
    console.log('==========================');

    results.forEach((result) => {
      const statusIcon = result.status === 'healthy' ? '✅' : '❌';
      const latency = result.latency ? ` (${result.latency}ms)` : '';

      console.log(
        `${statusIcon} ${result.service}: ${result.status.toUpperCase()}${latency}`
      );

      if (result.status === 'unhealthy' && result.error) {
        console.log(`   Error: ${result.error}`);
      }

      if (result.details) {
        Object.entries(result.details).forEach(([key, value]) => {
          if (typeof value === 'string' && value.length < 100) {
            console.log(`   ${key}: ${value}`);
          }
        });
      }
    });

    // Summary and exit code logic
    const unhealthy = results.filter((r) => r.status === 'unhealthy');
    const healthy = results.filter((r) => r.status === 'healthy');

    console.log('\n🏥 Health Summary:');
    console.log(`   Healthy: ${healthy.length}/${results.length} services`);
    console.log(`   Unhealthy: ${unhealthy.length}/${results.length} services`);

    if (unhealthy.length > 0) {
      console.log('\n❌ Service validation failed');
      console.log(
        'Unhealthy services:',
        unhealthy.map((s) => s.service).join(', ')
      );

      // In CI environments, we might want to be more lenient for optional services
      if (process.env.CI === 'true') {
        const criticalServices = ['PostgreSQL']; // Redis and MCP might not be available in all CI contexts
        const criticalFailures = unhealthy.filter((s) =>
          criticalServices.includes(s.service)
        );

        if (criticalFailures.length > 0) {
          console.log('💥 Critical service failures detected');
          process.exit(1);
        } else {
          console.log(
            '⚠️ Non-critical service failures in CI environment - continuing'
          );
          process.exit(0);
        }
      } else {
        process.exit(1);
      }
    } else {
      console.log('\n✅ All services healthy');
      process.exit(0);
    }

    return results;
  }

  // Health check with timeout wrapper
  async validateWithTimeout(
    timeoutMs: number = 30000
  ): Promise<ServiceHealth[]> {
    return Promise.race([
      this.validateAll(),
      new Promise<ServiceHealth[]>((_, reject) =>
        setTimeout(() => reject(new Error('Health check timed out')), timeoutMs)
      ),
    ]);
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new ServiceValidator();
  const timeoutMs = process.env.HEALTH_CHECK_TIMEOUT
    ? parseInt(process.env.HEALTH_CHECK_TIMEOUT)
    : 30000;

  validator.validateWithTimeout(timeoutMs).catch((error) => {
    console.error('💥 Health validation failed:', error.message);
    process.exit(1);
  });
}

export { ServiceValidator };
export type { ServiceHealth };
