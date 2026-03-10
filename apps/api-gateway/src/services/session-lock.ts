import { Redis } from 'ioredis';
import { createRedisClient } from '../config/redis.config.js';

// CRITICAL FIX: Use factory to create Redis client with proper password decoding
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = createRedisClient(redisUrl, {
  db: 3, // Use DB 3 for session locks (separate from main, sessions, cache)
  keyPrefix: 'lock:',
});

export class ConcurrentSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrentSessionError';
  }
}

export async function withSessionLock<T>(
  sessionId: string,
  operation: () => Promise<T>
): Promise<T> {
  const lockKey = `session:${sessionId}:lock`;
  const lockValue = `lock:${Date.now()}:${Math.random()}`;

  // Acquire lock with 30-second timeout
  const acquired = await redis.set(lockKey, lockValue, 'EX', 30, 'NX');

  if (!acquired) {
    throw new ConcurrentSessionError(
      'Session being modified by another process'
    );
  }

  try {
    return await operation();
  } finally {
    // Release lock only if we still own it
    await redis.eval(
      `
      if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
      else
        return 0
      end
    `,
      1,
      lockKey,
      lockValue
    );
  }
}
