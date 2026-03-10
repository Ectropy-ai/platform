/**
 * Main SecretProvider Implementation - Staging Version
 * Unified interface for staging environments without AWS dependencies
 */

import {
  SecretProvider,
  SecretProviderConfig,
  SecretConfig,
  SecretValue,
  SecretProviderMetrics,
  AuditLogEntry,
} from './types.js';
import { InfisicalSecretSource } from './infisical-source.js';
import { EdgeCache, EdgeCacheConfig } from './edge-cache.js';
import { randomUUID } from 'crypto';

export class EctropySecretProvider implements SecretProvider {
  private infisicalSource: InfisicalSecretSource;
  private edgeCache: EdgeCache;
  private auditLogs: AuditLogEntry[] = [];
  private metrics: SecretProviderMetrics = {
    totalRetrievals: 0,
    cacheHitRate: 0,
    avgLatencyMs: 0,
    successRate: 0,
    sourceStats: {
      infisical: 0,
      awsSecretsManager: 0,
      cache: 0,
      fallback: 0,
    },
  };

  constructor(config: SecretProviderConfig) {
    this.infisicalSource = new InfisicalSecretSource(
      config.infisical.baseUrl,
      {
        token: config.infisical.token,
        clientId: config.infisical.clientId,
        clientSecret: config.infisical.clientSecret,
      },
      config.infisical.defaultProject
    );
    
    // In staging, AWS is disabled - note this in logs

    // Initialize edge cache
    const cacheConfig: EdgeCacheConfig = {
      defaultTtl: config.defaultCacheTtl || 300, // 5 minutes
      maxKeys: 1000,
      enablePersistence: false, // Disable for staging
      cleanupIntervalSec: 60,
    };
    this.edgeCache = new EdgeCache(cacheConfig);
  }

  async getSecret(key: string, options?: Partial<SecretConfig>): Promise<SecretValue> {
    const config: SecretConfig = {
      key,
      environment: options?.environment || 'staging',
      classification: options?.classification || 'medium',
      project: options?.project,
      cacheTtl: options?.cacheTtl,
      requiresFips: options?.requiresFips,
    };

    const startTime = Date.now();
    let result: SecretValue;
    let source: string;

    try {
      // Check cache first
      const cached = this.getCachedSecret(key);
      if (cached) {
        this.updateMetrics('cache', startTime, true);
        this.auditLog('retrieve', key, 'cache' as const, true, startTime);
        return cached;
      }

      // Try Infisical (staging primary source)
      try {
        result = await this.infisicalSource.retrieveSecret(config);
        source = 'infisical';
        
        // Cache successful retrieval
        await this.edgeCache.set(key, result);
        
        this.updateMetrics(source, startTime, true);
        this.auditLog('retrieve', key, 'infisical' as const, true, startTime);
        return result;
      } catch (infisicalError) {
        
        // In staging, we don't fall back to AWS - throw error
        this.updateMetrics('infisical', startTime, false);
        const errorMessage = infisicalError instanceof Error ? infisicalError.message : String(infisicalError);
        this.auditLog('retrieve', key, 'infisical' as const, false, startTime, errorMessage);
        
        throw new Error(`Secret retrieval failed from all available sources. Last error: ${errorMessage}`);
      }
    } catch (error) {
      const source = 'fallback';
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.auditLog('error', key, source, false, startTime, errorMessage);
      throw error;
    }
  }

  async getSecrets(keys: string[], options?: Partial<SecretConfig>): Promise<Record<string, SecretValue>> {
    const results: Record<string, SecretValue> = {};
    
    for (const key of keys) {
      try {
        results[key] = await this.getSecret(key, options);
      } catch (error) {
        // Continue with other secrets
      }
    }
    
    return results;
  }

  getCachedSecret(key: string): SecretValue | null {
    return this.edgeCache.get(key) || null;
  }

  invalidateCache(key: string): void {
    this.edgeCache.delete(key);
  }

  clearCache(): void {
    this.edgeCache.clear();
  }

  getMetrics(): SecretProviderMetrics {
    return { ...this.metrics };
  }

  getAuditLogs(limit?: number): AuditLogEntry[] {
    const logs = [...this.auditLogs];
    return limit ? logs.slice(-limit) : logs;
  }

  async healthCheck(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};

    // Check Infisical
    try {
      health['infisical'] = await this.infisicalSource.isAvailable();
    } catch (error) {
      health['infisical'] = false;
    }

    // AWS is disabled in staging
    health['aws'] = true; // Not applicable but mark as healthy

    // Cache is always healthy if constructed
    health['cache'] = true;

    return health;
  }

  async rotateSecret(key: string): Promise<boolean> {
    // Secret rotation not implemented in staging
    return false;
  }

  private updateMetrics(source: string, startTime: number, success: boolean): void {
    const latency = Date.now() - startTime;
    this.metrics.totalRetrievals++;

    if (source === 'infisical') {
      this.metrics.sourceStats.infisical++;
    } else if (source === 'cache') {
      this.metrics.sourceStats.cache++;
    }

    // Update success rate
    const totalAttempts = this.metrics.sourceStats.infisical + this.metrics.sourceStats.awsSecretsManager;
    if (totalAttempts > 0) {
      this.metrics.successRate = success ? (this.metrics.successRate * (totalAttempts - 1) + 1) / totalAttempts
                                          : (this.metrics.successRate * (totalAttempts - 1)) / totalAttempts;
    }

    // Update average latency
    this.metrics.avgLatencyMs = (this.metrics.avgLatencyMs + latency) / 2;
    
    // Update cache hit rate
    const cacheHits = this.metrics.sourceStats.cache;
    const totalRequests = this.metrics.totalRetrievals;
    this.metrics.cacheHitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;
  }

  private auditLog(
    action: 'retrieve' | 'cache' | 'miss' | 'error' | 'rotation',
    secretKey: string,
    source: 'infisical' | 'aws-secrets-manager' | 'cache' | 'fallback',
    success: boolean,
    startTime: number,
    error?: string
  ): void {
    const entry: AuditLogEntry = {
      id: randomUUID(),
      timestamp: new Date(),
      secretKey,
      action,
      source,
      success,
      error,
      latencyMs: Date.now() - startTime,
      context: { environment: 'staging' },
    };

    this.auditLogs.push(entry);

    // Keep only last 1000 entries
    if (this.auditLogs.length > 1000) {
      this.auditLogs = this.auditLogs.slice(-1000);
    }
  }
}