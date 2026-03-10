/**
 * Database Performance Optimization Module
 * Query optimization and caching improvements for enterprise workloads
 */

import { logger } from '@ectropy/shared/utils';
import { auditLogger } from '@ectropy/shared/audit';

export interface QueryPerformanceMetrics {
  queryHash: string;
  executionTime: number;
  resultCount: number;
  timestamp: Date;
  cached: boolean;
  userId?: string;
  endpoint?: string;
}

export interface CacheConfig {
  ttl: number; // Time to live in seconds
  maxSize: number; // Maximum number of cached items
  strategy: 'lru' | 'fifo' | 'lfu';
  keyPrefix: string;
}

export class DatabasePerformanceOptimizer {
  private queryCache = new Map<string, { data: any; expires: number; hitCount: number }>();
  private queryMetrics: QueryPerformanceMetrics[] = [];
  private slowQueryThreshold = 1000; // milliseconds
  private cacheConfig: CacheConfig;

  constructor(
    config: Partial<CacheConfig> = {}
  ) {
    this.cacheConfig = {
      ttl: 300, // 5 minutes default
      maxSize: 1000,
      strategy: 'lru',
      keyPrefix: 'db_cache',
      ...config,
    };
    
    // Start cache cleanup interval
    setInterval(() => this.cleanupExpiredCache(), 60000); // Every minute
  }

  /**
   * Optimize database query with caching and monitoring
   */
  async optimizeQuery<T>(
    queryFn: () => Promise<T>,
    cacheKey: string,
    options: {
      cacheable?: boolean;
      userId?: string;
      endpoint?: string;
      customTtl?: number;
    } = {}
  ): Promise<T> {
    const startTime = Date.now();
    const queryHash = this.generateQueryHash(cacheKey);
    let result: T | undefined;
    let cached = false;

    // Check cache first if cacheable
    if (options.cacheable !== false) {
      const cachedResult = this.getCachedResult<T>(queryHash);
      if (cachedResult !== null) {
        result = cachedResult;
        cached = true;
        
        // Update hit count
        const cacheEntry = this.queryCache.get(queryHash);
        if (cacheEntry) {
          cacheEntry.hitCount++;
        }
      }
    }

    // Execute query if not cached
    if (!cached) {
      try {
        result = await queryFn();
        
        // Cache the result if cacheable
        if (options.cacheable !== false) {
          this.setCachedResult(queryHash, result, options.customTtl);
        }
      } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // Log query error
        logger.error('Database query failed', {
          queryHash,
          executionTime,
          error: error instanceof Error ? error.message : 'Unknown error',
          userId: options.userId,
          endpoint: options.endpoint,
        });

        // Audit log database errors
        auditLogger.logAdminAction({
          userId: options.userId || 'system',
          sourceIp: 'localhost',
          action: 'database_query_error',
          resource: `query:${queryHash}`,
          outcome: 'failure',
          metadata: {
            queryHash,
            executionTime,
            error: error instanceof Error ? error.message : 'Unknown error',
            endpoint: options.endpoint,
          },
        });

        throw error;
      }
    }

    // Ensure result is defined
    if (result === undefined) {
      throw new Error('Query execution failed - no result obtained');
    }

    const executionTime = Date.now() - startTime;
    
    // Record performance metrics
    const metrics: QueryPerformanceMetrics = {
      queryHash,
      executionTime,
      resultCount: Array.isArray(result) ? result.length : 1,
      timestamp: new Date(),
      cached,
      userId: options.userId,
      endpoint: options.endpoint,
    };
    
    this.recordQueryMetrics(metrics);

    // Log slow queries
    if (executionTime > this.slowQueryThreshold && !cached) {
      logger.warn('Slow database query detected', {
        queryHash,
        executionTime,
        threshold: this.slowQueryThreshold,
        resultCount: metrics.resultCount,
        userId: options.userId,
        endpoint: options.endpoint,
      });

      // Audit log slow queries for performance monitoring
      auditLogger.logAdminAction({
        userId: options.userId || 'system',
        sourceIp: 'localhost',
        action: 'slow_query_detected',
        resource: `query:${queryHash}`,
        outcome: 'success',
        metadata: {
          queryHash,
          executionTime,
          threshold: this.slowQueryThreshold,
          resultCount: metrics.resultCount,
          endpoint: options.endpoint,
        },
      });
    }

    return result;
  }

  /**
   * Get performance metrics for analysis
   */
  getPerformanceMetrics(options: {
    timeRange?: { start: Date; end: Date };
    slowQueriesOnly?: boolean;
    userId?: string;
    endpoint?: string;
  } = {}): QueryPerformanceMetrics[] {
    let metrics = [...this.queryMetrics];

    // Filter by time range
    if (options.timeRange) {
      metrics = metrics.filter(m => 
        m.timestamp >= options.timeRange!.start && 
        m.timestamp <= options.timeRange!.end
      );
    }

    // Filter slow queries only
    if (options.slowQueriesOnly) {
      metrics = metrics.filter(m => m.executionTime > this.slowQueryThreshold);
    }

    // Filter by user
    if (options.userId) {
      metrics = metrics.filter(m => m.userId === options.userId);
    }

    // Filter by endpoint
    if (options.endpoint) {
      metrics = metrics.filter(m => m.endpoint === options.endpoint);
    }

    return metrics.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    totalQueries: number;
    cachedQueries: number;
    topQueries: Array<{ queryHash: string; hitCount: number; cached: boolean }>;
  } {
    const totalQueries = this.queryMetrics.length;
    const cachedQueries = this.queryMetrics.filter(m => m.cached).length;
    const hitRate = totalQueries > 0 ? (cachedQueries / totalQueries) * 100 : 0;

    // Get top queries by frequency
    const queryFrequency = new Map<string, { count: number; hitCount: number; cached: boolean }>();
    
    this.queryMetrics.forEach(metric => {
      const existing = queryFrequency.get(metric.queryHash) || { count: 0, hitCount: 0, cached: false };
      existing.count++;
      if (metric.cached) {
        existing.cached = true;
      }
      queryFrequency.set(metric.queryHash, existing);
    });

    // Add cache hit counts
    this.queryCache.forEach((cacheEntry, queryHash) => {
      const existing = queryFrequency.get(queryHash);
      if (existing) {
        existing.hitCount = cacheEntry.hitCount;
      }
    });

    const topQueries = Array.from(queryFrequency.entries())
      .map(([queryHash, stats]) => ({
        queryHash,
        hitCount: stats.hitCount,
        cached: stats.cached,
      }))
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, 10);

    return {
      size: this.queryCache.size,
      maxSize: this.cacheConfig.maxSize,
      hitRate: Math.round(hitRate * 100) / 100,
      totalQueries,
      cachedQueries,
      topQueries,
    };
  }

  /**
   * Clear cache (useful for testing or manual cache invalidation)
   */
  clearCache(pattern?: string): void {
    if (pattern) {
      // Clear cache entries matching pattern
      const regex = new RegExp(pattern);
      for (const [key] of this.queryCache) {
        if (regex.test(key)) {
          this.queryCache.delete(key);
        }
      }
      logger.info('Cache cleared for pattern', { pattern, remainingSize: this.queryCache.size });
    } else {
      // Clear all cache
      this.queryCache.clear();
      logger.info('All cache cleared');
    }
  }

  /**
   * Optimize common database patterns
   */
  static createOptimizedQueries() {
    return {
      // Optimized user lookup with caching
      findUserById: (id: string) => ({
        cacheable: true,
        cacheKey: `user:${id}`,
        customTtl: 600, // 10 minutes
      }),

      // Optimized project lookup with caching
      findProjectById: (id: string) => ({
        cacheable: true,
        cacheKey: `project:${id}`,
        customTtl: 300, // 5 minutes
      }),

      // Optimized stakeholder roles (frequently accessed)
      getStakeholderRoles: (userId: string) => ({
        cacheable: true,
        cacheKey: `roles:${userId}`,
        customTtl: 900, // 15 minutes
      }),

      // IFC elements (large datasets, cache aggressively)
      getIFCElements: (projectId: string, elementType?: string) => ({
        cacheable: true,
        cacheKey: `ifc:${projectId}:${elementType || 'all'}`,
        customTtl: 1800, // 30 minutes
      }),

      // Configuration data (rarely changes)
      getSystemConfig: () => ({
        cacheable: true,
        cacheKey: 'system:config',
        customTtl: 3600, // 1 hour
      }),
    };
  }

  /**
   * Generate a hash for the query cache key
   */
  private generateQueryHash(cacheKey: string): string {
    return `${this.cacheConfig.keyPrefix}:${cacheKey}`;
  }

  /**
   * Get cached result if available and not expired
   */
  private getCachedResult<T>(queryHash: string): T | null {
    const cached = this.queryCache.get(queryHash);
    
    if (!cached) {
      return null;
    }

    if (Date.now() > cached.expires) {
      this.queryCache.delete(queryHash);
      return null;
    }

    return cached.data as T;
  }

  /**
   * Cache query result
   */
  private setCachedResult<T>(queryHash: string, data: T, customTtl?: number): void {
    const ttl = customTtl || this.cacheConfig.ttl;
    const expires = Date.now() + (ttl * 1000);

    // Enforce cache size limit
    if (this.queryCache.size >= this.cacheConfig.maxSize) {
      this.evictCacheEntry();
    }

    this.queryCache.set(queryHash, {
      data,
      expires,
      hitCount: 0,
    });
  }

  /**
   * Evict cache entry based on strategy
   */
  private evictCacheEntry(): void {
    if (this.queryCache.size === 0) return;

    switch (this.cacheConfig.strategy) {
      case 'lru':
        // Remove the oldest entry (first in Map)
        const firstKey = this.queryCache.keys().next().value;
        if (firstKey !== undefined) {
          this.queryCache.delete(firstKey);
        }
        break;
        
      case 'lfu':
        // Remove entry with lowest hit count
        let lowestHitCount = Infinity;
        let leastUsedKey = '';
        
        for (const [key, entry] of this.queryCache) {
          if (entry.hitCount < lowestHitCount) {
            lowestHitCount = entry.hitCount;
            leastUsedKey = key;
          }
        }
        
        if (leastUsedKey) {
          this.queryCache.delete(leastUsedKey);
        }
        break;
        
      case 'fifo':
      default:
        // Remove the first entry added
        const oldestKey = this.queryCache.keys().next().value;
        if (oldestKey !== undefined) {
          this.queryCache.delete(oldestKey);
        }
        break;
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.queryCache) {
      if (now > entry.expires) {
        this.queryCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cache cleanup completed', {
        cleanedEntries: cleanedCount,
        remainingEntries: this.queryCache.size,
      });
    }
  }

  /**
   * Record query performance metrics
   */
  private recordQueryMetrics(metrics: QueryPerformanceMetrics): void {
    this.queryMetrics.push(metrics);
    
    // Keep only recent metrics (last 24 hours)
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    this.queryMetrics = this.queryMetrics.filter(m => m.timestamp.getTime() > cutoff);
  }
}

// Export singleton instance for easy use
export const dbOptimizer = new DatabasePerformanceOptimizer({
  ttl: 300, // 5 minutes
  maxSize: 500, // Reasonable size for memory usage
  strategy: 'lru',
  keyPrefix: 'ectropy_db',
});