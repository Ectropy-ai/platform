// Custom application-specific environment variable types
// Note: Using @types/node for core Node.js types, only extending ProcessEnv here

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Application-specific environment variables
      DAO_ADDRESS?: string;
      DAO_CONTRACT_ADDRESS?: string;
      BLOCKCHAIN_PROVIDER_URL?: string;
      VOTING_CONTRACT_ADDRESS?: string;
      FRONTEND_URL?: string;
      ALLOWED_ORIGINS?: string;
      CORS_ORIGINS?: string;
      RATE_LIMIT_MAX?: string;
      MAX_MEMORY_GB?: string;
      SSL_ENABLED?: string;
      SSL_CERT_PATH?: string;
      SSL_KEY_PATH?: string;
      JWT_SECRET?: string;
      JWT_REFRESH_SECRET?: string;
      npm_package_version?: string;
      DB_HOST?: string;
      DB_PORT?: string;
      DB_NAME?: string;
      DB_USER?: string;
      DB_PASSWORD?: string;
      DB_SSL?: string;
      DB_MAX_CONNECTIONS?: string;
      DB_CONNECTION_TIMEOUT?: string;
      DB_IDLE_TIMEOUT?: string;
      DB_MAX_USES?: string;
      REDIS_HOST?: string;
      REDIS_PORT?: string;
      REDIS_PASSWORD?: string;
      REDIS_DB?: string;
      REDIS_KEY_PREFIX?: string;
      REDIS_RETRY_DELAY?: string;
      REDIS_MAX_RETRIES?: string;
    }
  }
}

// Make this file a module
export {};
