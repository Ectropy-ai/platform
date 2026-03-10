import { Redis } from 'ioredis';

/**
 * Redis client configured with environment-aware settings. Acts as a distributed cache
 * with optional TTL support for each entry. Falls back gracefully when Redis is unavailable.
 */

// Environment-aware Redis configuration
const getRedisConfig = () => {
  const host = process.env['REDIS_HOST'] || '127.0.0.1';
  const port = parseInt(process.env['REDIS_PORT'] || '6379');
  const isTestEnvironment = process.env['NODE_ENV'] === 'test';
  const redisDisabled = process.env['REDIS_DISABLED'] === 'true';

  return {
    host,
    port,
    password: process.env['REDIS_PASSWORD'],
    lazyConnect: true, // Don't connect immediately
    maxRetriesPerRequest: isTestEnvironment ? 0 : 3, // Disable retries in test
    enableReadyCheck: true,
    disabled: redisDisabled || isTestEnvironment,
  };
};

const config = getRedisConfig();

// Create Redis client only if not disabled
export const redisClient = config.disabled
  ? null
  : new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      lazyConnect: config.lazyConnect,
      maxRetriesPerRequest: config.maxRetriesPerRequest,
      enableReadyCheck: config.enableReadyCheck,
    });

// Add error handler to prevent unhandled errors
if (redisClient) {
  redisClient.on('error', (error) => {
    console.log(
      '[Redis] Connection error (continuing without cache):',
      error.message
    );
  });

  redisClient.on('connect', () => {
    console.log('[Redis] Connected successfully');
  });
}

export const redisGet = async <T = unknown>(key: string): Promise<T | null> => {
  if (!redisClient) {
    // Graceful fallback when Redis is disabled
    return null;
  }

  try {
    const data = await redisClient.get(key);
    return data ? (JSON.parse(data) as T) : null;
  } catch (error) {
    console.log(
      '[Redis] Get operation failed, continuing without cache:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return null;
  }
};

export const redisSet = async (
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> => {
  if (!redisClient) {
    // Graceful fallback when Redis is disabled
    return;
  }

  try {
    const payload = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await redisClient.set(key, payload, 'EX', ttlSeconds);
    } else {
      await redisClient.set(key, payload);
    }
  } catch (error) {
    console.log(
      '[Redis] Set operation failed, continuing without cache:',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
};

export const redisDel = async (key: string): Promise<void> => {
  if (!redisClient) {
    // Graceful fallback when Redis is disabled
    return;
  }

  try {
    await redisClient.del(key);
  } catch (error) {
    console.log(
      '[Redis] Delete operation failed, continuing without cache:',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
};
