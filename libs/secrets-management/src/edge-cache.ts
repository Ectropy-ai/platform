/**
 * Edge Cache Implementation
 * Provides <100ms latency and offline resilience for construction sites
 */

import NodeCache from 'node-cache';
import fs from 'fs';
import path from 'path';
import { SecretValue, AuditLogEntry } from './types.js';

export interface EdgeCacheConfig {
  /** Default TTL in seconds */
  defaultTtl: number;
  /** Maximum number of secrets to cache */
  maxKeys: number;
  /** Enable persistent cache across restarts */
  enablePersistence: boolean;
  /** Cache file path for persistence */
  persistencePath?: string;
  /** Cleanup interval in seconds */
  cleanupIntervalSec: number;
}

export class EdgeCache {
  private cache: NodeCache;
  private hitCount = 0;
  private missCount = 0;
  private lastCleanup = new Date();

  constructor(private config: EdgeCacheConfig) {
    this.cache = new NodeCache({
      stdTTL: config.defaultTtl,
      maxKeys: config.maxKeys,
      checkperiod: config.cleanupIntervalSec,
      useClones: false, // Performance optimization
      deleteOnExpire: true,
    });

    // Load from persistence if enabled
    if (config.enablePersistence && config.persistencePath) {
      this.loadFromPersistence();
    }

    // Setup cleanup and persistence
    this.cache.on('expired', this.onCacheExpiry.bind(this));
    this.cache.on('del', this.onCacheDelete.bind(this));

    // Periodic persistence
    if (config.enablePersistence) {
      setInterval(() => {
        this.saveToPersistence();
      }, config.cleanupIntervalSec * 1000);
    }
  }

  /**
   * Get a cached secret
   */
  get(key: string): SecretValue | null {
    const cached = this.cache.get<SecretValue>(key);
    
    if (cached) {
      this.hitCount++;
      // Update source to indicate cache hit
      return {
        ...cached,
        source: 'cache',
        retrievedAt: new Date(), // Update retrieval time
      };
    }

    this.missCount++;
    return null;
  }

  /**
   * Store a secret in cache
   */
  set(key: string, value: SecretValue, ttl?: number): void {
    const actualTtl = ttl || value.cacheTtl || this.config.defaultTtl;
    
    // Store with original source preserved
    this.cache.set(key, value, actualTtl);
  }

  /**
   * Check if a key exists in cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Remove a specific key from cache
   */
  delete(key: string): boolean {
    return this.cache.del(key) > 0;
  }

  /**
   * Clear all cached secrets
   */
  clear(): void {
    this.cache.flushAll();
    this.hitCount = 0;
    this.missCount = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    keys: number;
    hits: number;
    misses: number;
    hitRate: number;
    lastCleanup: Date;
    memoryUsage: number;
  } {
    const keys = this.cache.keys();
    const total = this.hitCount + this.missCount;
    
    return {
      keys: keys.length,
      hits: this.hitCount,
      misses: this.missCount,
      hitRate: total > 0 ? (this.hitCount / total) * 100 : 0,
      lastCleanup: this.lastCleanup,
      memoryUsage: this.getMemoryUsage(),
    };
  }

  /**
   * Get all cached keys
   */
  getKeys(): string[] {
    return this.cache.keys();
  }

  /**
   * Get TTL for a specific key
   */
  getTtl(key: string): number | undefined {
    return this.cache.getTtl(key);
  }

  /**
   * Update TTL for a specific key
   */
  updateTtl(key: string, ttl: number): boolean {
    return this.cache.ttl(key, ttl);
  }

  /**
   * Pre-warm cache with secrets
   */
  async preWarm(secrets: Record<string, SecretValue>): Promise<void> {
    for (const [key, value] of Object.entries(secrets)) {
      this.set(key, value);
    }
  }

  /**
   * Invalidate expired secrets
   */
  cleanup(): number {
    const keysBefore = this.cache.keys().length;
    
    // Force cleanup of expired keys
    this.cache.keys().forEach((key: string) => {
      const ttl = this.cache.getTtl(key);
      if (ttl !== undefined && ttl < Date.now()) {
        this.cache.del(key);
      }
    });

    const keysAfter = this.cache.keys().length;
    this.lastCleanup = new Date();

    return keysBefore - keysAfter;
  }

  private onCacheExpiry(key: string, value: SecretValue): void {
    // Log cache expiry for audit
  }

  private onCacheDelete(key: string, value: SecretValue): void {
    // Log cache deletion for audit
  }

  private getMemoryUsage(): number {
    // Rough estimation of memory usage
    const keys = this.cache.keys();
    let size = 0;
    
    keys.forEach((key: string) => {
      const value = this.cache.get<SecretValue>(key);
      if (value) {
        size += JSON.stringify(value).length * 2; // Rough estimate (UTF-16)
      }
    });
    
    return size;
  }

  private loadFromPersistence(): void {
    if (!this.config.persistencePath) return;

    try {
      if (fs.existsSync(this.config.persistencePath)) {
        const data = fs.readFileSync(this.config.persistencePath, 'utf8');
        const cached = JSON.parse(data);
        
        // Restore cached secrets
        for (const [key, value] of Object.entries(cached)) {
          const secretValue = value as SecretValue;
          // Check if not expired
          if (!secretValue.expiresAt || new Date(secretValue.expiresAt) > new Date()) {
            this.cache.set(key, secretValue);
          }
        }
        
      }
    } catch (error) {
    }
  }

  private saveToPersistence(): void {
    if (!this.config.persistencePath) return;

    try {
      const keys = this.cache.keys();
      const data: Record<string, SecretValue> = {};
      
      keys.forEach((key: string) => {
        const value = this.cache.get<SecretValue>(key);
        if (value) {
          data[key] = value;
        }
      });
      
      const dir = path.dirname(this.config.persistencePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.config.persistencePath, JSON.stringify(data, null, 2));
    } catch (error) {
    }
  }
}