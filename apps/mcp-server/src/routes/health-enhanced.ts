import { Request, Response } from 'express';
import { Pool } from 'pg';
import { getCacheStatus } from '../services/cache.js';
import { calculateHealthScore } from '../utils/health-score.js';

// Database connection (will be configured elsewhere)
let pgPool: Pool | null = null;

// Initialize connections (called from main server)
export const initializeHealthDependencies = (dbPool?: Pool) => {
  pgPool = dbPool || null;
};

// Check database connectivity
const checkDatabase = async (): Promise<{
  status: string;
  latency?: number;
}> => {
  if (!pgPool) {
    return { status: 'not_configured' };
  }

  try {
    const start = Date.now();
    await pgPool.query('SELECT 1');
    const latency = Date.now() - start;
    return { status: 'healthy', latency };
  } catch (error) {
    return { status: 'unhealthy' };
  }
};

// Check Redis connectivity
const checkRedis = async (): Promise<{ status: string; latency?: number }> => {
  const cacheStatus = getCacheStatus();

  if (cacheStatus.type === 'redis' && cacheStatus.connected) {
    return { status: 'healthy', latency: 0 };
  } else if (cacheStatus.type === 'memory') {
    return { status: 'using_fallback' };
  } else {
    return { status: 'unhealthy' };
  }
};

export const healthCheck = async (req: Request, res: Response) => {
  const startTime = Date.now();

  // Perform dependency checks
  const [databaseHealth, redisHealth] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);

  const memoryUsage = process.memoryUsage();
  const memoryStatus = memoryUsage.heapUsed < 500 * 1024 * 1024 ? 'healthy' : 'warning'; // 500MB threshold
  
  // Calculate weighted health score (0-100)
  const score = calculateHealthScore({
    database: databaseHealth,
    redis: redisHealth,
    memory: memoryStatus,
  });
  
  const healthStatus = {
    status: 'healthy',
    score, // CRITICAL: Include score in response
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
      external: Math.round(memoryUsage.external / 1024 / 1024), // MB
      rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
    },
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    checks: {
      database: databaseHealth,
      redis: redisHealth,
      memory: memoryStatus,
    },
    response_time: Date.now() - startTime,
  };

  // Determine overall status
  if (
    databaseHealth.status === 'unhealthy' ||
    redisHealth.status === 'unhealthy'
  ) {
    healthStatus.status = 'degraded';
  } else if (
    databaseHealth.status === 'not_configured' &&
    redisHealth.status === 'using_fallback'
  ) {
    healthStatus.status = 'partial'; // Service works but without external dependencies
  }

  const statusCode =
    healthStatus.status === 'healthy'
      ? 200
      : healthStatus.status === 'partial'
        ? 200
        : 503;

  res.status(statusCode).json(healthStatus);
};
