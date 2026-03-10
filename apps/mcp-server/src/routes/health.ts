import { Router, type IRouter } from 'express';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { getCurrentVersion, VERSION_STRATEGY } from '../utils/version.js';

const router: IRouter = Router();

// Database and Redis connections (will be configured elsewhere)
let pgPool: Pool;
let redis: Redis;

// Initialize connections (called from main server)
export const initializeHealthDependencies = (
  dbPool: Pool,
  redisClient: Redis
) => {
  pgPool = dbPool;
  redis = redisClient;
};

router.get('/health', async (_req, res) => {
  const checks = {
    server: 'healthy',
    timestamp: new Date().toISOString(),
    version: getCurrentVersion(),
    versionStrategy: VERSION_STRATEGY.type,
    dependencies: {} as Record<string, string>,
  };

  // Check PostgreSQL
  try {
    if (pgPool) {
      await pgPool.query('SELECT 1');
      checks.dependencies.postgresql = 'healthy';
    } else {
      checks.dependencies.postgresql = 'not_configured';
    }
  } catch (error) {
    checks.dependencies.postgresql = 'unhealthy';
    checks.server = 'degraded';
  }

  // Check Redis
  try {
    if (redis) {
      await redis.ping();
      checks.dependencies.redis = 'healthy';
    } else {
      checks.dependencies.redis = 'not_configured';
    }
  } catch (error) {
    checks.dependencies.redis = 'unhealthy';
    checks.server = 'degraded';
  }

  const statusCode = checks.server === 'healthy' ? 200 : 503;
  res.status(statusCode).json(checks);
});

export default router;
