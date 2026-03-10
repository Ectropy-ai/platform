/**
 * Main SecretProvider Implementation
 * Unified interface for Infisical + AWS Secrets Manager hybrid approach
 */

import {
  SecretProvider,
  SecretProviderConfig,
  SecretConfig,
  SecretValue,
  SecretProviderMetrics,
  AuditLogEntry,
  BaseSecretSource,
} from './types.js';
import { InfisicalSecretSource } from './infisical-source.js';
import { AwsSecretsManagerSource } from './aws-secrets-manager-source.js';
import { EdgeCache, EdgeCacheConfig } from './edge-cache.js';
import { randomUUID } from 'crypto';

export class EctropySecretProvider implements SecretProvider {
  private infisicalSource: InfisicalSecretSource;
  private awsSource: AwsSecretsManagerSource;
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

  constructor(private config: SecretProviderConfig) {
    // Initialize sources
    this.infisicalSource = new InfisicalSecretSource(
      config.infisical.baseUrl,
      {
        token: config.infisical.token,
        clientId: config.infisical.clientId,
        clientSecret: config.infisical.clientSecret,
      },
      config.infisical.defaultProject
    );

    this.awsSource = new AwsSecretsManagerSource({
      region: config.aws.region,
      accessKeyId: config.aws.accessKeyId,
      secretAccessKey: config.aws.secretAccessKey,
      sessionToken: config.aws.sessionToken,
      endpoint: config.aws.endpoint,
    });

    // Initialize edge cache
    const cacheConfig: EdgeCacheConfig = {
      defaultTtl: config.defaultCacheTtl,
      maxKeys: 1000, // Reasonable limit for construction sites
      enablePersistence: config.enableEdgeCache,
      persistencePath: config.enableEdgeCache ? '/tmp/ectropy-secrets-cache.json' : undefined,
      cleanupIntervalSec: 300, // 5 minutes
    };
    this.edgeCache = new EdgeCache(cacheConfig);

    // Periodic metrics calculation
    setInterval(() => {
      this.calculateMetrics();
    }, 60000); // Every minute
  }

  async getSecret(key: string, options: Partial<SecretConfig> = {}): Promise<SecretValue> {
    const startTime = Date.now();
    const config: SecretConfig = {
      key,
      environment: options.environment || this.config.environment,
      classification: options.classification || 'medium',
      project: options.project,
      cacheTtl: options.cacheTtl,
      requiresFips: options.requiresFips,
    };

    try {
      // Check cache first
      const cached = this.edgeCache.get(key);
      if (cached) {
        this.logAudit({
          secretKey: key,
          action: 'retrieve',
          source: 'cache',
          success: true,
          latencyMs: Date.now() - startTime,
        });
        this.metrics.sourceStats.cache++;
        return cached;
      }

      // Determine source based on environment and requirements
      const source = this.selectSource(config);
      const secret = await source.retrieveSecret(config);

      // Cache the result
      if (config.cacheTtl !== 0) {
        this.edgeCache.set(key, secret, config.cacheTtl);
      }

      this.logAudit({
        secretKey: key,
        action: 'retrieve',
        source: secret.source,
        success: true,
        latencyMs: Date.now() - startTime,
      });

      this.metrics.totalRetrievals++;
      if (secret.source === 'infisical') {
        this.metrics.sourceStats.infisical++;
      } else if (secret.source === 'aws-secrets-manager') {
        this.metrics.sourceStats.awsSecretsManager++;
      } else if (secret.source === 'cache') {
        this.metrics.sourceStats.cache++;
      } else {
        this.metrics.sourceStats.fallback++;
      }

      return secret;
    } catch (error: any) {
      this.logAudit({
        secretKey: key,
        action: 'retrieve',
        source: 'fallback',
        success: false,
        error: error.message,
        latencyMs: Date.now() - startTime,
      });

      // Try alternative to environment variables - use safer env access pattern for TypeScript
      const fallbackValue = process.env[key as keyof typeof process.env];
      if (fallbackValue) {
        const fallbackSecret: SecretValue = {
          value: fallbackValue,
          source: 'fallback',
          retrievedAt: new Date(),
          metadata: { fallbackReason: error.message },
        };

        this.metrics.sourceStats.fallback++;
        return fallbackSecret;
      }

      throw new Error(`Failed to retrieve secret '${key}': ${error.message}`);
    }
  }

  async getSecrets(keys: string[], options: Partial<SecretConfig> = {}): Promise<Record<string, SecretValue>> {
    const results: Record<string, SecretValue> = {};
    const promises = keys.map(async (key) => {
      try {
        const secret = await this.getSecret(key, options);
        results[key] = secret;
      } catch (error) {
        // Continue with other secrets
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  getCachedSecret(key: string): SecretValue | null {
    return this.edgeCache.get(key);
  }

  invalidateCache(key: string): void {
    this.edgeCache.delete(key);
    this.logAudit({
      secretKey: key,
      action: 'cache',
      source: 'cache',
      success: true,
      latencyMs: 0,
      context: { action: 'invalidate' },
    });
  }

  clearCache(): void {
    const keys = this.edgeCache.getKeys();
    this.edgeCache.clear();
    
    keys.forEach(key => {
      this.logAudit({
        secretKey: key,
        action: 'cache',
        source: 'cache',
        success: true,
        latencyMs: 0,
        context: { action: 'clear' },
      });
    });
  }

  getMetrics(): SecretProviderMetrics {
    this.calculateMetrics();
    return { ...this.metrics };
  }

  getAuditLogs(limit = 100): AuditLogEntry[] {
    return this.auditLogs.slice(-limit);
  }

  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    try {
      results['infisical'] = await this.infisicalSource.isAvailable();
    } catch {
      results['infisical'] = false;
    }

    try {
      results['awsSecretsManager'] = await this.awsSource.isAvailable();
    } catch {
      results['awsSecretsManager'] = false;
    }

    results['cache'] = true; // Cache is always available
    
    return results;
  }

  async rotateSecret(key: string): Promise<boolean> {
    const config: SecretConfig = {
      key,
      environment: this.config.environment,
      classification: 'high', // Assume high classification for rotation
    };

    // Try AWS Secrets Manager first (supports native rotation)
    if (this.config.environment === 'production') {
      try {
        const rotated = await this.awsSource.rotateSecret(config);
        if (rotated) {
          this.invalidateCache(key);
          this.logAudit({
            secretKey: key,
            action: 'rotation',
            source: 'aws-secrets-manager',
            success: true,
            latencyMs: 0,
          });
          return true;
        }
      } catch (error) {
      }
    }

    // Infisical doesn't support native rotation, but we can invalidate cache
    this.invalidateCache(key);
    this.logAudit({
      secretKey: key,
      action: 'rotation',
      source: 'infisical',
      success: false,
      latencyMs: 0,
      error: 'Manual rotation required for Infisical secrets',
    });

    return false;
  }

  /**
   * Validate that all required secrets are available before bootstrapping
   */
  async validateRequiredSecrets(requiredSecrets: string[]): Promise<{
    success: boolean;
    missing: string[];
    errors: string[];
  }> {
    const missing: string[] = [];
    const errors: string[] = [];

    for (const key of requiredSecrets) {
      try {
        await this.getSecret(key);
      } catch (error) {
        missing.push(key);
        errors.push(`${key}: ${error}`);
      }
    }

    const success = missing.length === 0;

    if (!success && this.config.environment !== 'development') {
      // Fail fast for non-development environments
      throw new Error(
        `Missing required secrets in ${this.config.environment} environment: ${missing.join(', ')}\n` +
        `Errors: ${errors.join('; ')}`
      );
    }

    return { success, missing, errors };
  }

  private selectSource(config: SecretConfig): BaseSecretSource {
    // Strategy: Use AWS for production FIPS-required secrets, Infisical for dev/staging
    if (config.environment === 'production' && config.requiresFips) {
      return this.awsSource;
    }

    if (config.environment === 'production' && config.classification === 'critical') {
      return this.awsSource;
    }

    if (config.environment === 'development' || config.environment === 'staging') {
      return this.infisicalSource;
    }

    // Default to AWS for production, Infisical for others
    return config.environment === 'production' ? this.awsSource : this.infisicalSource;
  }

  private logAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
    const auditEntry: AuditLogEntry = {
      id: randomUUID(),
      timestamp: new Date(),
      ...entry,
    };

    this.auditLogs.push(auditEntry);

    // Keep only last 1000 entries to prevent memory bloat
    if (this.auditLogs.length > 1000) {
      this.auditLogs = this.auditLogs.slice(-1000);
    }

    // Log to console in development for debugging
    if (this.config.environment === 'development') {
    }
  }

  private calculateMetrics(): void {
    const cacheStats = this.edgeCache.getStats();
    const totalOperations = Object.values(this.metrics.sourceStats).reduce((a, b) => a + b, 0);
    
    this.metrics.cacheHitRate = cacheStats.hitRate;
    
    // Calculate success rate from audit logs
    const recentLogs = this.auditLogs.slice(-100);
    const successfulOps = recentLogs.filter(log => log.success).length;
    this.metrics.successRate = recentLogs.length > 0 ? (successfulOps / recentLogs.length) * 100 : 0;
    
    // Calculate average latency
    const latencies = recentLogs.map(log => log.latencyMs).filter(l => l > 0);
    this.metrics.avgLatencyMs = latencies.length > 0 
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length 
      : 0;

    this.metrics.lastRetrievalAt = recentLogs.length > 0 
      ? recentLogs[recentLogs.length - 1].timestamp 
      : undefined;
  }
}