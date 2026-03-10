
import { lruCache } from './lru.js';
import { redisDel } from './redis.js';
import { deleteVector } from './vector.js';

export { LRUCache, lruCache } from './lru.js';


/**
 * Determines whether cache should be bypassed. Tool handlers can pass an
 * options object with `bypass` flag when they need fresh data.
 */
export const shouldBypassCache = (options?: { bypass?: boolean }): boolean =>
  options?.bypass ?? false;

/**
 * Invalidate a given cache key across all configured cache layers.
 */
export const invalidateCache = async (key: string): Promise<void> => {
  lruCache.delete(key);
  await redisDel(key);
  await deleteVector(key);
};
