/**
 * Secret Source Types for Ectropy Platform
 * Defines the contract for dual-source secret management
 */

export interface SecretConfig {
  /** Secret key/name */
  key: string;
  /** Optional project/namespace for scoping */
  project?: string;
  /** Environment context (development, staging, production) */
  environment: 'development' | 'staging' | 'production';
  /** Secret classification for compliance */
  classification: 'critical' | 'high' | 'medium' | 'low';
  /** Cache TTL in seconds */
  cacheTtl?: number;
  /** Required for FIPS compliance in production */
  requiresFips?: boolean;
}

export interface SecretValue {
  /** The secret value */
  value: string;
  /** Source that provided the secret */
  source: 'infisical' | 'aws-secrets-manager' | 'cache' | 'fallback';
  /** When the secret was retrieved */
  retrievedAt: Date;
  /** When the secret expires (if applicable) */
  expiresAt?: Date;
  /** Version/rotation identifier */
  version?: string;
  /** Cache TTL in seconds (optional) */
  cacheTtl?: number;
  /** Metadata for audit trails */
  metadata?: Record<string, any>;
}

export interface SecretProviderConfig {
  /** Default environment */
  environment: 'development' | 'staging' | 'production';
  /** Default cache TTL in seconds */
  defaultCacheTtl: number;
  /** Enable edge caching for offline resilience */
  enableEdgeCache: boolean;
  /** SLA timeout in milliseconds */
  slaTimeoutMs: number;
  /** Infisical configuration */
  infisical: {
    baseUrl: string;
    token?: string;
    clientId?: string;
    clientSecret?: string;
    defaultProject?: string;
  };
  /** AWS Secrets Manager configuration */
  aws: {
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
    endpoint?: string; // For localstack or custom endpoints
  };
  /** Compliance and audit settings */
  compliance: {
    enableAuditLogging: boolean;
    requireFipsForProduction: boolean;
    rotationScheduleDays: number;
  };
}

export interface SecretProviderMetrics {
  /** Total secret retrievals */
  totalRetrievals: number;
  /** Cache hit rate percentage */
  cacheHitRate: number;
  /** Average retrieval latency in milliseconds */
  avgLatencyMs: number;
  /** Success rate percentage */
  successRate: number;
  /** Last retrieval timestamp */
  lastRetrievalAt?: Date;
  /** Source usage statistics */
  sourceStats: {
    infisical: number;
    awsSecretsManager: number;
    cache: number;
    fallback: number;
  };
}

export interface AuditLogEntry {
  /** Unique audit event ID */
  id: string;
  /** Timestamp of the event */
  timestamp: Date;
  /** Secret key that was accessed */
  secretKey: string;
  /** Action performed */
  action: 'retrieve' | 'cache' | 'miss' | 'error' | 'rotation';
  /** Source used for the secret */
  source: 'infisical' | 'aws-secrets-manager' | 'cache' | 'fallback';
  /** Success/failure status */
  success: boolean;
  /** Error message if applicable */
  error?: string;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Additional context */
  context?: Record<string, any>;
}

export abstract class BaseSecretSource {
  abstract name: string;
  
  abstract retrieveSecret(config: SecretConfig): Promise<SecretValue>;
  
  abstract isAvailable(): Promise<boolean>;
  
  abstract supportsEnvironment(environment: string): boolean;
  
  abstract supportsFips(): boolean;
}

export interface SecretProvider {
  /** Retrieve a secret with automatic source selection */
  getSecret(key: string, options?: Partial<SecretConfig>): Promise<SecretValue>;
  
  /** Retrieve multiple secrets in batch */
  getSecrets(keys: string[], options?: Partial<SecretConfig>): Promise<Record<string, SecretValue>>;
  
  /** Get cached secret if available */
  getCachedSecret(key: string): SecretValue | null;
  
  /** Invalidate cache for a specific secret */
  invalidateCache(key: string): void;
  
  /** Clear all cached secrets */
  clearCache(): void;
  
  /** Get provider metrics for monitoring */
  getMetrics(): SecretProviderMetrics;
  
  /** Get audit logs for compliance */
  getAuditLogs(limit?: number): AuditLogEntry[];
  
  /** Test connectivity to all sources */
  healthCheck(): Promise<Record<string, boolean>>;
  
  /** Force rotation of secrets (where supported) */
  rotateSecret(key: string): Promise<boolean>;
}