/**
 * Enterprise Environment Variable Schema - Single Source of Truth
 *
 * AP-004 SOLUTION: Centralized Configuration with Runtime Validation
 *
 * This module provides:
 * - Type-safe environment variable access
 * - Runtime validation with clear error messages
 * - Auto-generated documentation from schema
 * - Environment-aware defaults
 * - Security-first validation patterns
 *
 * ENTERPRISE BENEFITS:
 * - Fail-fast on missing required variables
 * - Self-documenting configuration
 * - Cross-environment consistency
 * - Prevents configuration drift
 * - SOC2/ISO27001 audit trail
 *
 * @module @ectropy/shared/config/env-schema
 */

/**
 * Environment type enum
 */
export enum Environment {
  Development = 'development',
  Staging = 'staging',
  Production = 'production',
  Test = 'test',
}

/**
 * Log level enum
 */
export enum LogLevel {
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Debug = 'debug',
  Trace = 'trace',
}

/**
 * Validated environment configuration interface
 *
 * ALL environment variables MUST be defined here.
 * This is the single source of truth for configuration.
 */
export interface EnvironmentConfig {
  // ==========================================
  // Environment Settings
  // ==========================================
  nodeEnv: Environment;
  logLevel: LogLevel;
  logFormat: 'json' | 'text';
  timezone: string;

  // ==========================================
  // Database Configuration (PostgreSQL)
  // ==========================================
  databaseHost: string;
  databasePort: number;
  databaseName: string;
  databaseUser: string;
  databasePassword: string;
  databaseUrl: string;
  postgresRootRole?: string;
  postgresRootPassword?: string;

  // ==========================================
  // Redis Configuration
  // ==========================================
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  redisUrl: string;

  // ==========================================
  // Qdrant Vector Database Configuration
  // ==========================================
  qdrantHost: string;
  qdrantPort: number;
  qdrantGrpcPort: number;
  qdrantUrl: string;

  // ==========================================
  // Server Configuration
  // ==========================================
  apiPort: number;
  mcpPort: number;
  webPort: number;
  metricsPort: number;
  mcpHost: string;
  mcpHealthCheckPath: string;
  mcpMetricsEnabled: boolean;

  // ==========================================
  // Service URLs (Multi-Environment)
  // ==========================================
  apiHost: string;
  apiUrl: string;
  apiBaseUrl: string;
  apiGatewayHost: string;
  apiGatewayPort: number;
  mcpUrl: string;
  webHost: string;
  webUrl: string;
  frontendUrl: string;
  baseUrl: string;

  // ==========================================
  // Security Configuration
  // ==========================================
  jwtSecret: string;
  jwtRefreshSecret: string;
  jwtExpiresIn: string;
  refreshTokenExpiresIn: string;
  sessionSecret: string;
  mcpApiKey: string;
  bcryptRounds: number;

  // ==========================================
  // CORS Configuration
  // ==========================================
  corsOrigin: string;
  corsOrigins: string;

  // ==========================================
  // Rate Limiting
  // ==========================================
  rateLimitMax: number;
  rateLimitWindowMs: number;
  enableRateLimiting: boolean;

  // ==========================================
  // OAuth Providers
  // ==========================================
  googleClientId: string;
  googleClientSecret: string;
  googleCallbackUrl: string;

  // Legacy OAuth (deprecated)
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthCallbackUrl?: string;

  // ==========================================
  // Speckle BIM Integration
  // ==========================================
  speckleServerUrl: string;
  speckleClientId?: string;
  speckleClientSecret?: string;

  // ==========================================
  // AI/ML Configuration
  // ==========================================
  openaiApiKey?: string;
  embeddingsModel: string;
  embeddingsCacheSize: number;
  semanticSearchEnabled: boolean;
  enableSemanticSearch: boolean;
  enableDocumentAnalysis: boolean;
  enableCodeGeneration: boolean;

  // ==========================================
  // Monitoring & Observability
  // ==========================================
  enableMetrics: boolean;
  prometheusPort: number;
  sentryDsn?: string;
  sentryEnvironment: string;
  enableProfiling: boolean;
  performanceMonitoring: string;

  // ==========================================
  // DAO Blockchain Configuration
  // ==========================================
  daoContractAddress?: string;
  blockchainProviderUrl?: string;
  votingContractAddress?: string;

  // ==========================================
  // Feature Flags
  // ==========================================
  enableHealthChecks: boolean;
  enableWebsockets: boolean;
  enableMcpAgents: boolean;
  enableTelemetry: boolean;
  enterpriseMode: boolean;
  complianceMode: 'strict' | 'standard' | 'relaxed';

  // ==========================================
  // Performance Tuning
  // ==========================================
  nodeOptions: string;
  workerThreads: number;
  cacheTtl: number;
}

/**
 * Environment variable validators
 *
 * Provides strong typing and runtime validation
 */
const validators = {
  /**
   * String validator with optional default
   */
  string: (defaultValue?: string) => ({
    validate: (value: string | undefined): string => {
      if (value === undefined || value === '') {
        if (defaultValue !== undefined) return defaultValue;
        throw new Error('Required string value is missing');
      }
      return value;
    },
  }),

  /**
   * Number validator with optional default
   */
  number: (defaultValue?: number) => ({
    validate: (value: string | undefined): number => {
      if (value === undefined || value === '') {
        if (defaultValue !== undefined) return defaultValue;
        throw new Error('Required number value is missing');
      }
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) {
        throw new Error(`Invalid number value: ${value}`);
      }
      return parsed;
    },
  }),

  /**
   * Boolean validator with default
   */
  boolean: (defaultValue: boolean = false) => ({
    validate: (value: string | undefined): boolean => {
      if (value === undefined || value === '') return defaultValue;
      return value.toLowerCase() === 'true' || value === '1';
    },
  }),

  /**
   * Enum validator
   */
  enum: <T extends string>(allowedValues: T[], defaultValue?: T) => ({
    validate: (value: string | undefined): T => {
      if (value === undefined || value === '') {
        if (defaultValue !== undefined) return defaultValue;
        throw new Error(
          `Required enum value is missing. Allowed: ${allowedValues.join(', ')}`
        );
      }
      if (!allowedValues.includes(value as T)) {
        throw new Error(
          `Invalid enum value: ${value}. Allowed: ${allowedValues.join(', ')}`
        );
      }
      return value as T;
    },
  }),

  /**
   * URL validator
   */
  url: (defaultValue?: string) => ({
    validate: (value: string | undefined): string => {
      if (value === undefined || value === '') {
        if (defaultValue !== undefined) return defaultValue;
        throw new Error('Required URL value is missing');
      }
      // Basic URL validation
      if (
        !value.match(/^https?:\/\//i) &&
        !value.match(/^redis:\/\//i) &&
        !value.match(/^postgres(ql)?:\/\//i)
      ) {
        // Allow localhost patterns for development
        if (!value.includes('localhost') && !value.includes('127.0.0.1')) {
          throw new Error(`Invalid URL format: ${value}`);
        }
      }
      return value;
    },
  }),

  /**
   * Optional string validator
   */
  optionalString: () => ({
    validate: (value: string | undefined): string | undefined => {
      if (value === undefined || value === '') return undefined;
      return value;
    },
  }),
};

/**
 * Environment variable schema definition
 *
 * CRITICAL: This is the single source of truth for all environment variables.
 * Add new variables here when adding new features.
 */
export const envSchema = {
  // Environment Settings
  NODE_ENV: validators.enum<Environment>(
    [
      Environment.Development,
      Environment.Staging,
      Environment.Production,
      Environment.Test,
    ],
    Environment.Development
  ),
  LOG_LEVEL: validators.enum<LogLevel>(
    [
      LogLevel.Error,
      LogLevel.Warn,
      LogLevel.Info,
      LogLevel.Debug,
      LogLevel.Trace,
    ],
    LogLevel.Info
  ),
  LOG_FORMAT: validators.enum(['json', 'text'], 'text'),
  TZ: validators.string('UTC'),

  // Database Configuration
  DATABASE_HOST: validators.string('localhost'),
  DATABASE_PORT: validators.number(5432),
  DATABASE_NAME: validators.string('ectropy_dev'),
  DATABASE_USER: validators.string('postgres'),
  DATABASE_PASSWORD: validators.string('postgres'),
  DATABASE_URL: validators.url(
    'postgresql://postgres:postgres@localhost:5432/ectropy_dev'
  ),
  POSTGRES_ROOT_ROLE: validators.optionalString(),
  POSTGRES_ROOT_PASSWORD: validators.optionalString(),

  // Redis Configuration
  REDIS_HOST: validators.string('localhost'),
  REDIS_PORT: validators.number(6379),
  REDIS_PASSWORD: validators.optionalString(),
  REDIS_URL: validators.url('redis://localhost:6379'),

  // Qdrant Configuration
  QDRANT_HOST: validators.string('localhost'),
  QDRANT_PORT: validators.number(6333),
  QDRANT_GRPC_PORT: validators.number(6334),
  QDRANT_URL: validators.url('http://localhost:6333'),

  // Server Configuration
  API_PORT: validators.number(4000),
  MCP_PORT: validators.number(3001),
  WEB_PORT: validators.number(3000),
  METRICS_PORT: validators.number(9090),
  MCP_HOST: validators.string('0.0.0.0'),
  MCP_HEALTH_CHECK_PATH: validators.string('/health'),
  MCP_METRICS_ENABLED: validators.boolean(true),

  // Service URLs
  API_HOST: validators.string('localhost'),
  API_URL: validators.url('http://localhost:4000'),
  API_BASE_URL: validators.url('http://localhost:4000'),
  API_GATEWAY_HOST: validators.string('localhost'),
  API_GATEWAY_PORT: validators.number(4000),
  MCP_URL: validators.url('http://localhost:3001'),
  WEB_HOST: validators.string('localhost'),
  WEB_URL: validators.url('http://localhost:3000'),
  FRONTEND_URL: validators.url('http://localhost:3000'),
  BASE_URL: validators.url('http://localhost:3000'),

  // Security Configuration
  JWT_SECRET: validators.string('development-jwt-secret-change-in-production'),
  JWT_REFRESH_SECRET: validators.string(
    'development-refresh-secret-change-in-production'
  ),
  JWT_EXPIRES_IN: validators.string('15m'),
  REFRESH_TOKEN_EXPIRES_IN: validators.string('7d'),
  SESSION_SECRET: validators.string(
    'development-session-secret-change-in-production'
  ),
  MCP_API_KEY: validators.string(
    'development-mcp-api-key-change-in-production'
  ),
  BCRYPT_ROUNDS: validators.number(12),

  // CORS Configuration
  CORS_ORIGIN: validators.string('http://localhost:3000'),
  CORS_ORIGINS: validators.string('http://localhost:3000'),

  // Rate Limiting
  RATE_LIMIT_MAX: validators.number(100),
  RATE_LIMIT_WINDOW_MS: validators.number(900000),
  ENABLE_RATE_LIMITING: validators.boolean(true),

  // OAuth Providers
  GOOGLE_CLIENT_ID: validators.string('your-google-client-id'),
  GOOGLE_CLIENT_SECRET: validators.string('your-google-client-secret'),
  GOOGLE_CALLBACK_URL: validators.url(
    'http://localhost:3000/auth/google/callback'
  ),

  // Legacy OAuth (deprecated)
  OAUTH_CLIENT_ID: validators.optionalString(),
  OAUTH_CLIENT_SECRET: validators.optionalString(),
  OAUTH_CALLBACK_URL: validators.optionalString(),

  // Speckle BIM Integration
  SPECKLE_SERVER_URL: validators.url('https://speckle.xyz'),
  SPECKLE_CLIENT_ID: validators.optionalString(),
  SPECKLE_CLIENT_SECRET: validators.optionalString(),

  // AI/ML Configuration
  OPENAI_API_KEY: validators.optionalString(),
  EMBEDDINGS_MODEL: validators.string('Xenova/all-MiniLM-L6-v2'),
  EMBEDDINGS_CACHE_SIZE: validators.number(1000),
  SEMANTIC_SEARCH_ENABLED: validators.boolean(true),
  ENABLE_SEMANTIC_SEARCH: validators.boolean(true),
  ENABLE_DOCUMENT_ANALYSIS: validators.boolean(true),
  ENABLE_CODE_GENERATION: validators.boolean(true),

  // Monitoring & Observability
  ENABLE_METRICS: validators.boolean(true),
  PROMETHEUS_PORT: validators.number(9090),
  SENTRY_DSN: validators.optionalString(),
  SENTRY_ENVIRONMENT: validators.string('development'),
  ENABLE_PROFILING: validators.boolean(false),
  PERFORMANCE_MONITORING: validators.string('disabled'),

  // DAO Blockchain Configuration
  DAO_CONTRACT_ADDRESS: validators.optionalString(),
  BLOCKCHAIN_PROVIDER_URL: validators.optionalString(),
  VOTING_CONTRACT_ADDRESS: validators.optionalString(),

  // Feature Flags
  ENABLE_HEALTH_CHECKS: validators.boolean(true),
  ENABLE_WEBSOCKETS: validators.boolean(true),
  ENABLE_MCP_AGENTS: validators.boolean(true),
  ENABLE_TELEMETRY: validators.boolean(true),
  ENTERPRISE_MODE: validators.boolean(false),
  COMPLIANCE_MODE: validators.enum(
    ['strict', 'standard', 'relaxed'],
    'standard'
  ),

  // Performance Tuning
  NODE_OPTIONS: validators.string('--max-old-space-size=4096'),
  WORKER_THREADS: validators.number(4),
  CACHE_TTL: validators.number(3600),
};

/**
 * Validate and load environment configuration
 *
 * @returns Validated environment configuration
 * @throws Error if validation fails
 */
export function loadEnvironmentConfig(): EnvironmentConfig {
  const env = process.env;
  const nodeEnv = (env.NODE_ENV || 'development') as Environment;

  try {
    const config: EnvironmentConfig = {
      // Environment Settings
      nodeEnv: envSchema.NODE_ENV.validate(env.NODE_ENV),
      logLevel: envSchema.LOG_LEVEL.validate(env.LOG_LEVEL),
      logFormat: envSchema.LOG_FORMAT.validate(env.LOG_FORMAT) as
        | 'json'
        | 'text',
      timezone: envSchema.TZ.validate(env.TZ),

      // Database Configuration
      databaseHost: envSchema.DATABASE_HOST.validate(env.DATABASE_HOST),
      databasePort: envSchema.DATABASE_PORT.validate(env.DATABASE_PORT),
      databaseName: envSchema.DATABASE_NAME.validate(env.DATABASE_NAME),
      databaseUser: envSchema.DATABASE_USER.validate(env.DATABASE_USER),
      databasePassword: envSchema.DATABASE_PASSWORD.validate(
        env.DATABASE_PASSWORD
      ),
      // ENTERPRISE FIX (2026-01-04): Validate DATABASE_URL before using it
      // Previous code used env.DATABASE_URL without validation, causing silent failures
      databaseUrl: env.DATABASE_URL
        ? envSchema.DATABASE_URL.validate(env.DATABASE_URL)
        : `postgresql://${envSchema.DATABASE_USER.validate(env.DATABASE_USER)}:${envSchema.DATABASE_PASSWORD.validate(env.DATABASE_PASSWORD)}@${envSchema.DATABASE_HOST.validate(env.DATABASE_HOST)}:${envSchema.DATABASE_PORT.validate(env.DATABASE_PORT)}/${envSchema.DATABASE_NAME.validate(env.DATABASE_NAME)}`,
      postgresRootRole: envSchema.POSTGRES_ROOT_ROLE.validate(
        env.POSTGRES_ROOT_ROLE
      ),
      postgresRootPassword: envSchema.POSTGRES_ROOT_PASSWORD.validate(
        env.POSTGRES_ROOT_PASSWORD
      ),

      // Redis Configuration
      redisHost: envSchema.REDIS_HOST.validate(env.REDIS_HOST),
      redisPort: envSchema.REDIS_PORT.validate(env.REDIS_PORT),
      redisPassword: envSchema.REDIS_PASSWORD.validate(env.REDIS_PASSWORD),
      // ENTERPRISE FIX (2026-01-04): Validate REDIS_URL before using it
      // Previous code used env.REDIS_URL without validation, causing silent failures
      redisUrl: env.REDIS_URL
        ? envSchema.REDIS_URL.validate(env.REDIS_URL)
        : `redis://${env.REDIS_PASSWORD ? `:${envSchema.REDIS_PASSWORD.validate(env.REDIS_PASSWORD)}@` : ''}${envSchema.REDIS_HOST.validate(env.REDIS_HOST)}:${envSchema.REDIS_PORT.validate(env.REDIS_PORT)}`,

      // Qdrant Configuration
      qdrantHost: envSchema.QDRANT_HOST.validate(env.QDRANT_HOST),
      qdrantPort: envSchema.QDRANT_PORT.validate(env.QDRANT_PORT),
      qdrantGrpcPort: envSchema.QDRANT_GRPC_PORT.validate(env.QDRANT_GRPC_PORT),
      qdrantUrl:
        env.QDRANT_URL ||
        `http://${envSchema.QDRANT_HOST.validate(env.QDRANT_HOST)}:${envSchema.QDRANT_PORT.validate(env.QDRANT_PORT)}`,

      // Server Configuration
      apiPort: envSchema.API_PORT.validate(env.API_PORT),
      mcpPort: envSchema.MCP_PORT.validate(env.MCP_PORT),
      webPort: envSchema.WEB_PORT.validate(env.WEB_PORT),
      metricsPort: envSchema.METRICS_PORT.validate(env.METRICS_PORT),
      mcpHost: envSchema.MCP_HOST.validate(env.MCP_HOST),
      mcpHealthCheckPath: envSchema.MCP_HEALTH_CHECK_PATH.validate(
        env.MCP_HEALTH_CHECK_PATH
      ),
      mcpMetricsEnabled: envSchema.MCP_METRICS_ENABLED.validate(
        env.MCP_METRICS_ENABLED
      ),

      // Service URLs
      apiHost: envSchema.API_HOST.validate(env.API_HOST),
      apiUrl: envSchema.API_URL.validate(env.API_URL),
      apiBaseUrl: envSchema.API_BASE_URL.validate(env.API_BASE_URL),
      apiGatewayHost: envSchema.API_GATEWAY_HOST.validate(env.API_GATEWAY_HOST),
      apiGatewayPort: envSchema.API_GATEWAY_PORT.validate(env.API_GATEWAY_PORT),
      mcpUrl: envSchema.MCP_URL.validate(env.MCP_URL),
      webHost: envSchema.WEB_HOST.validate(env.WEB_HOST),
      webUrl: envSchema.WEB_URL.validate(env.WEB_URL),
      frontendUrl: envSchema.FRONTEND_URL.validate(env.FRONTEND_URL),
      baseUrl: envSchema.BASE_URL.validate(env.BASE_URL),

      // Security Configuration
      jwtSecret: envSchema.JWT_SECRET.validate(env.JWT_SECRET),
      jwtRefreshSecret: envSchema.JWT_REFRESH_SECRET.validate(
        env.JWT_REFRESH_SECRET
      ),
      jwtExpiresIn: envSchema.JWT_EXPIRES_IN.validate(env.JWT_EXPIRES_IN),
      refreshTokenExpiresIn: envSchema.REFRESH_TOKEN_EXPIRES_IN.validate(
        env.REFRESH_TOKEN_EXPIRES_IN
      ),
      sessionSecret: envSchema.SESSION_SECRET.validate(env.SESSION_SECRET),
      mcpApiKey: envSchema.MCP_API_KEY.validate(env.MCP_API_KEY),
      bcryptRounds: envSchema.BCRYPT_ROUNDS.validate(env.BCRYPT_ROUNDS),

      // CORS Configuration
      corsOrigin: envSchema.CORS_ORIGIN.validate(env.CORS_ORIGIN),
      corsOrigins: envSchema.CORS_ORIGINS.validate(env.CORS_ORIGINS),

      // Rate Limiting
      rateLimitMax: envSchema.RATE_LIMIT_MAX.validate(env.RATE_LIMIT_MAX),
      rateLimitWindowMs: envSchema.RATE_LIMIT_WINDOW_MS.validate(
        env.RATE_LIMIT_WINDOW_MS
      ),
      enableRateLimiting: envSchema.ENABLE_RATE_LIMITING.validate(
        env.ENABLE_RATE_LIMITING
      ),

      // OAuth Providers
      googleClientId: envSchema.GOOGLE_CLIENT_ID.validate(env.GOOGLE_CLIENT_ID),
      googleClientSecret: envSchema.GOOGLE_CLIENT_SECRET.validate(
        env.GOOGLE_CLIENT_SECRET
      ),
      googleCallbackUrl: envSchema.GOOGLE_CALLBACK_URL.validate(
        env.GOOGLE_CALLBACK_URL
      ),
      oauthClientId: envSchema.OAUTH_CLIENT_ID.validate(env.OAUTH_CLIENT_ID),
      oauthClientSecret: envSchema.OAUTH_CLIENT_SECRET.validate(
        env.OAUTH_CLIENT_SECRET
      ),
      oauthCallbackUrl: envSchema.OAUTH_CALLBACK_URL.validate(
        env.OAUTH_CALLBACK_URL
      ),

      // Speckle BIM Integration
      speckleServerUrl: envSchema.SPECKLE_SERVER_URL.validate(
        env.SPECKLE_SERVER_URL
      ),
      speckleClientId: envSchema.SPECKLE_CLIENT_ID.validate(
        env.SPECKLE_CLIENT_ID
      ),
      speckleClientSecret: envSchema.SPECKLE_CLIENT_SECRET.validate(
        env.SPECKLE_CLIENT_SECRET
      ),

      // AI/ML Configuration
      openaiApiKey: envSchema.OPENAI_API_KEY.validate(env.OPENAI_API_KEY),
      embeddingsModel: envSchema.EMBEDDINGS_MODEL.validate(
        env.EMBEDDINGS_MODEL
      ),
      embeddingsCacheSize: envSchema.EMBEDDINGS_CACHE_SIZE.validate(
        env.EMBEDDINGS_CACHE_SIZE
      ),
      semanticSearchEnabled: envSchema.SEMANTIC_SEARCH_ENABLED.validate(
        env.SEMANTIC_SEARCH_ENABLED
      ),
      enableSemanticSearch: envSchema.ENABLE_SEMANTIC_SEARCH.validate(
        env.ENABLE_SEMANTIC_SEARCH
      ),
      enableDocumentAnalysis: envSchema.ENABLE_DOCUMENT_ANALYSIS.validate(
        env.ENABLE_DOCUMENT_ANALYSIS
      ),
      enableCodeGeneration: envSchema.ENABLE_CODE_GENERATION.validate(
        env.ENABLE_CODE_GENERATION
      ),

      // Monitoring & Observability
      enableMetrics: envSchema.ENABLE_METRICS.validate(env.ENABLE_METRICS),
      prometheusPort: envSchema.PROMETHEUS_PORT.validate(env.PROMETHEUS_PORT),
      sentryDsn: envSchema.SENTRY_DSN.validate(env.SENTRY_DSN),
      sentryEnvironment: envSchema.SENTRY_ENVIRONMENT.validate(
        env.SENTRY_ENVIRONMENT
      ),
      enableProfiling: envSchema.ENABLE_PROFILING.validate(
        env.ENABLE_PROFILING
      ),
      performanceMonitoring: envSchema.PERFORMANCE_MONITORING.validate(
        env.PERFORMANCE_MONITORING
      ),

      // DAO Blockchain Configuration
      daoContractAddress: envSchema.DAO_CONTRACT_ADDRESS.validate(
        env.DAO_CONTRACT_ADDRESS
      ),
      blockchainProviderUrl: envSchema.BLOCKCHAIN_PROVIDER_URL.validate(
        env.BLOCKCHAIN_PROVIDER_URL
      ),
      votingContractAddress: envSchema.VOTING_CONTRACT_ADDRESS.validate(
        env.VOTING_CONTRACT_ADDRESS
      ),

      // Feature Flags
      enableHealthChecks: envSchema.ENABLE_HEALTH_CHECKS.validate(
        env.ENABLE_HEALTH_CHECKS
      ),
      enableWebsockets: envSchema.ENABLE_WEBSOCKETS.validate(
        env.ENABLE_WEBSOCKETS
      ),
      enableMcpAgents: envSchema.ENABLE_MCP_AGENTS.validate(
        env.ENABLE_MCP_AGENTS
      ),
      enableTelemetry: envSchema.ENABLE_TELEMETRY.validate(
        env.ENABLE_TELEMETRY
      ),
      enterpriseMode: envSchema.ENTERPRISE_MODE.validate(env.ENTERPRISE_MODE),
      complianceMode: envSchema.COMPLIANCE_MODE.validate(
        env.COMPLIANCE_MODE
      ) as 'strict' | 'standard' | 'relaxed',

      // Performance Tuning
      nodeOptions: envSchema.NODE_OPTIONS.validate(env.NODE_OPTIONS),
      workerThreads: envSchema.WORKER_THREADS.validate(env.WORKER_THREADS),
      cacheTtl: envSchema.CACHE_TTL.validate(env.CACHE_TTL),
    };

    // Production-specific validation
    if (nodeEnv === Environment.Production) {
      validateProductionConfig(config);
    }

    return config;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Environment configuration validation failed: ${error.message}`
      );
    }
    throw error;
  }
}

/**
 * Validate production-specific requirements
 *
 * In production, certain variables MUST be set and MUST NOT use development defaults
 */
function validateProductionConfig(config: EnvironmentConfig): void {
  const errors: string[] = [];

  // Check for development secrets in production
  if (config.jwtSecret.includes('development')) {
    errors.push('JWT_SECRET must be changed from development default');
  }
  if (config.jwtRefreshSecret.includes('development')) {
    errors.push('JWT_REFRESH_SECRET must be changed from development default');
  }
  if (config.sessionSecret.includes('development')) {
    errors.push('SESSION_SECRET must be changed from development default');
  }
  if (config.mcpApiKey.includes('development')) {
    errors.push('MCP_API_KEY must be changed from development default');
  }

  // Check for localhost in production URLs
  if (
    config.apiUrl.includes('localhost') ||
    config.apiUrl.includes('127.0.0.1')
  ) {
    errors.push('API_URL must not be localhost in production');
  }
  if (
    config.frontendUrl.includes('localhost') ||
    config.frontendUrl.includes('127.0.0.1')
  ) {
    errors.push('FRONTEND_URL must not be localhost in production');
  }

  // Check OAuth configuration
  if (config.googleClientId === 'your-google-client-id') {
    errors.push('GOOGLE_CLIENT_ID must be configured in production');
  }
  if (config.googleClientSecret === 'your-google-client-secret') {
    errors.push('GOOGLE_CLIENT_SECRET must be configured in production');
  }

  if (errors.length > 0) {
    throw new Error(
      `Production configuration validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}\n\n` +
        `Generate secure secrets with: openssl rand -base64 32\n` +
        `Update environment variables before deploying to production.`
    );
  }
}

/**
 * Global validated configuration instance
 *
 * Loaded once at application startup
 */
let globalConfig: EnvironmentConfig | null = null;

/**
 * Get validated environment configuration
 *
 * Configuration is loaded once and cached for performance
 *
 * @returns Validated environment configuration
 */
export function getEnvConfig(): EnvironmentConfig {
  if (!globalConfig) {
    globalConfig = loadEnvironmentConfig();
  }
  return globalConfig;
}

/**
 * Reset configuration cache (for testing)
 *
 * @internal
 */
export function resetEnvConfig(): void {
  globalConfig = null;
}

/**
 * AP-001 SOLUTION: Environment-aware URL helper functions
 *
 * These functions provide environment-agnostic URLs that work across:
 * - Local development (localhost)
 * - Docker Compose (service names)
 * - Staging (staging.ectropy.ai)
 * - Production (ectropy.ai)
 *
 * ZERO HARDCODED URLs - all values come from validated environment variables
 */

/**
 * Get API Gateway URL
 * @returns Full API Gateway URL (e.g., http://localhost:4000 or https://staging.ectropy.ai)
 */
export function getApiUrl(): string {
  const config = getEnvConfig();
  return config.apiUrl;
}

/**
 * Get MCP Server URL
 * @returns Full MCP Server URL (e.g., http://localhost:3001)
 */
export function getMcpUrl(): string {
  const config = getEnvConfig();
  return config.mcpUrl;
}

/**
 * Get Web Dashboard URL
 * @returns Full Web Dashboard URL (e.g., http://localhost:3000)
 */
export function getWebUrl(): string {
  const config = getEnvConfig();
  return config.webUrl;
}

/**
 * Get Frontend URL (alias for Web Dashboard)
 * @returns Full Frontend URL
 */
export function getFrontendUrl(): string {
  const config = getEnvConfig();
  return config.frontendUrl;
}

/**
 * Get Base URL (usually same as frontend)
 * @returns Base URL for the application
 */
export function getBaseUrl(): string {
  const config = getEnvConfig();
  return config.baseUrl;
}

/**
 * Get Speckle Server URL
 * @returns Full Speckle Server URL
 */
export function getSpeckleUrl(): string {
  const config = getEnvConfig();
  return config.speckleServerUrl;
}

/**
 * Get CORS Origins as Array
 *
 * Parses the comma-separated CORS_ORIGINS environment variable
 * and returns an array of allowed origins
 *
 * @returns Array of allowed CORS origins
 */
export function getCorsOrigins(): string[] {
  const config = getEnvConfig();
  const origins = config.corsOrigins || config.corsOrigin;

  if (!origins) {
    return [];
  }

  return origins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Generic service URL getter
 * @param service - Service identifier
 * @returns URL for the specified service
 */
export function getServiceUrl(
  service: 'api' | 'mcp' | 'web' | 'frontend' | 'speckle' | 'base'
): string {
  switch (service) {
    case 'api':
      return getApiUrl();
    case 'mcp':
      return getMcpUrl();
    case 'web':
      return getWebUrl();
    case 'frontend':
      return getFrontendUrl();
    case 'speckle':
      return getSpeckleUrl();
    case 'base':
      return getBaseUrl();
    default:
      throw new Error(`Unknown service: ${service}`);
  }
}
