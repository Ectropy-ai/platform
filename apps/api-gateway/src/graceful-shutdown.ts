import { Server } from 'http';
import type Redis from 'ioredis';
import { cleanupRateLimiters } from './middleware/rate-limit.middleware.js';

export const createGracefulShutdown = (
  server: Server,
  redis: Redis | null,
  healthStatus: any
) => {
  return (signal: string) => {
    healthStatus.status = 'shutting-down';
    server.close(async () => {
      // Close rate limiter Redis connection
      await cleanupRateLimiters();
      if (redis) {
        try {
          await redis.quit();
        } catch (err) {}
      }
      process.exit(0);
    });
    setTimeout(() => {
      process.exit(1);
    }, 10000);
  };
};
