/**
 * Health Check Routes
 * System health monitoring and documentation endpoints
 */

import express, {
  NextFunction,
  Request,
  Response,
  Router,
  IRouter,
} from 'express';
import type Redis from 'ioredis';
import type { Pool } from 'pg';
import { exec } from 'child_process';
import { promisify } from 'util';
import { asyncHandler } from '../../../../libs/shared/errors/src/error-handler.js';
import { getCurrentVersion, VERSION_STRATEGY } from '../utils/version.js';

const execAsync = promisify(exec);

/**
 * Get system-level resource metrics (OS-level, not container-level)
 * ROOT CAUSE #80: Previous implementation used process.memoryUsage() which returns
 * container memory limits (e.g., 48MB), not actual system RAM (e.g., 3.8GB)
 */
async function getSystemMetrics(): Promise<{
  memory: {
    total: string;
    used: string;
    free: string;
    available: string;
    usagePercent: number;
  };
  disk: {
    total: string;
    used: string;
    available: string;
    usagePercent: number;
  };
}> {
  try {
    // Get memory info using 'free' command
    const { stdout: memOutput } = await execAsync('free -h');
    const memLines = memOutput.trim().split('\n');
    const memData = memLines[1].split(/\s+/); // Mem: line

    // Parse memory values
    const memTotal = memData[1] || '0';
    const memUsed = memData[2] || '0';
    const memFree = memData[3] || '0';
    const memAvailable = memData[6] || memData[3] || '0'; // Available column or free as fallback

    // Calculate usage percentage
    const memUsedBytes = parseFloat(memUsed.replace(/[^\d.]/g, ''));
    const memTotalBytes = parseFloat(memTotal.replace(/[^\d.]/g, ''));
    const memUsagePercent =
      memTotalBytes > 0 ? Math.round((memUsedBytes / memTotalBytes) * 100) : 0;

    // Get disk info using 'df' command for root filesystem
    const { stdout: diskOutput } = await execAsync('df -h /');
    const diskLines = diskOutput.trim().split('\n');
    const diskData = diskLines[1].split(/\s+/); // Data line

    // Parse disk values
    const diskTotal = diskData[1] || '0';
    const diskUsed = diskData[2] || '0';
    const diskAvailable = diskData[3] || '0';
    const diskUsagePercent = parseInt(diskData[4]?.replace('%', '') || '0', 10);

    return {
      memory: {
        total: memTotal,
        used: memUsed,
        free: memFree,
        available: memAvailable,
        usagePercent: memUsagePercent,
      },
      disk: {
        total: diskTotal,
        used: diskUsed,
        available: diskAvailable,
        usagePercent: diskUsagePercent,
      },
    };
  } catch (error) {
    // Fallback to process memory if system commands fail (e.g., restricted container)
    const processMemory = process.memoryUsage();
    const memoryMB = Math.round(processMemory.heapUsed / 1024 / 1024);

    return {
      memory: {
        total: `${Math.round(processMemory.heapTotal / 1024 / 1024)}M (process)`,
        used: `${memoryMB}M (process)`,
        free: 'unknown',
        available: 'unknown',
        usagePercent: Math.round(
          (processMemory.heapUsed / processMemory.heapTotal) * 100
        ),
      },
      disk: {
        total: 'unknown',
        used: 'unknown',
        available: 'unknown',
        usagePercent: 0,
      },
    };
  }
}

export class HealthRoutes {
  private router: IRouter;
  private db: Pool;
  private redis: Redis;
  constructor(db: Pool, redis: Redis) {
    this.router = express.Router();
    this.db = db;
    this.redis = redis;
    this.setupRoutes();
  }
  private setupRoutes(): void {
    // Health check endpoint
    this.router.get('/health', this.createHealthCheckHandler());
    // API documentation
    this.router.get('/api/docs', this.createDocsHandler());
  }

  /**
   * Create health check handler
   */
  private createHealthCheckHandler() {
    return asyncHandler(
      async (req: Request, res: Response, next: NextFunction) => {
        // Get system-level metrics (not container-level) - ROOT CAUSE #80 fix
        const systemMetrics = await getSystemMetrics();

        const health = {
          status: 'healthy',
          score: 100,
          timestamp: new Date().toISOString(),
          version: getCurrentVersion(),
          versionStrategy: VERSION_STRATEGY.type,
          buildSha: process.env['BUILD_SHA'] || 'unknown',
          buildDate: new Date().toISOString(),
          environment: process.env['NODE_ENV'] || 'development',
          checks: {
            database: 'unknown',
            redis: 'unknown',
            sslTermination: 'unknown',
            memory: systemMetrics.memory,
            disk: systemMetrics.disk,
          },
          headers: {
            xForwardedProto: req.headers['x-forwarded-proto'] || 'none',
            xForwardedFor: req.headers['x-forwarded-for'] || 'none',
            xRealIp: req.headers['x-real-ip'] || 'none',
          },
        };

        // Check SSL termination headers (critical for load balancer setup)
        const xForwardedProto = req.headers['x-forwarded-proto'];
        if (process.env['NODE_ENV'] === 'production') {
          // In production behind LB, we expect X-Forwarded-Proto header
          if (xForwardedProto === 'https') {
            health.checks.sslTermination = 'healthy';
          } else if (xForwardedProto === 'http') {
            health.checks.sslTermination = 'warning';
            health.status = 'degraded';
          } else {
            health.checks.sslTermination = 'missing';
            health.status = 'degraded';
          }
        } else {
          // In development, SSL termination check not applicable
          health.checks.sslTermination = 'not-applicable';
        }

        try {
          // Check database
          await this.db.query('SELECT 1');
          health.checks.database = 'healthy';
        } catch (_error) {
          health.checks.database = 'unhealthy';
          health.status = 'degraded';
          health.score = Math.max(0, health.score - 40); // Reduce score by 40 for database failure
        }

        try {
          // Check Redis
          await this.redis.ping();
          health.checks.redis = 'healthy';
        } catch (_error) {
          health.checks.redis = 'unhealthy';
          health.status = 'degraded';
          health.score = Math.max(0, health.score - 30); // Reduce score by 30 for Redis failure
        }

        // Adjust score for SSL termination issues
        if (
          health.checks.sslTermination === 'warning' ||
          health.checks.sslTermination === 'missing'
        ) {
          health.score = Math.max(0, health.score - 10);
        }

        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
      }
    );
  }

  /**
   * Create API documentation handler
   */
  private createDocsHandler() {
    return (req: Request, res: Response, next: NextFunction) => {
      res.json({
        title: 'Ectropy Federated Construction Platform API',
        version: getCurrentVersion(),
        versionStrategy: VERSION_STRATEGY.type,
        description: 'Production-ready API with enhanced security',
        baseUrl:
          process.env['API_BASE_URL'] ||
          `http://localhost:${process.env['PORT'] || 4000}`,
        security: {
          authentication: 'JWT Bearer tokens',
          authorization:
            'Role-based access control with element-level permissions',
          rateLimit: 'API: 100 req/15min, Auth: 5 req/15min',
          inputValidation: 'Comprehensive input sanitization and validation',
          encryption: 'TLS 1.3 in production',
        },
        endpoints: {
          health: 'GET /health - System health check',
          docs: 'GET /api/docs - API documentation',
          auth: {
            login: 'POST /api/auth/login - User authentication',
            refresh: 'POST /api/auth/refresh - Token refresh',
            logout: 'POST /api/auth/logout - User logout',
            profile: 'GET /api/auth/me - Current user profile',
          },
          projects: {
            list: 'GET /api/v1/projects - List projects',
            get: 'GET /api/v1/projects/:id - Get project details',
            create: 'POST /api/v1/projects - Create new project',
            update: 'PUT /api/v1/projects/:id - Update project',
            delete: 'DELETE /api/v1/projects/:id - Delete project',
          },
          elements: {
            list: 'GET /api/v1/projects/:id/elements - List project elements',
            get: 'GET /api/v1/elements/:id - Get element details',
            create: 'POST /api/v1/projects/:id/elements - Create element',
            update: 'PUT /api/v1/elements/:id - Update element',
            delete: 'DELETE /api/v1/elements/:id - Delete element',
          },
          access: {
            check:
              'POST /api/v1/check-access - Check element access permissions',
          },
        },
        examples: {
          login: {
            request: {
              method: 'POST',
              url: '/api/auth/login',
              body: {
                email: 'user@example.com',
                password: 'securePassword123',
              },
            },
            response: {
              message: 'Authentication successful',
              user: {
                id: 'uuid',
                role: 'architect',
              },
              tokens: {
                accessToken: 'REDACTED',
                refreshToken: 'REDACTED',
                expiresIn: 3600,
              },
            },
          },
        },
      });
    };
  }

  getRouter(): IRouter {
    return this.router;
  }
}
