// Vitest setup file for API Gateway

// Ensure process.env exists (for Vitest compatibility)
if (typeof process !== 'undefined' && process.env) {
  // ENTERPRISE: Set default environment for testing
  // TypeScript FIX: Use Object.assign to bypass readonly constraint
  // This is required because ProcessEnv interface marks NODE_ENV as readonly in strict mode
  Object.assign(process.env, {
    NODE_ENV: 'test',
    JWT_SECRET: process.env.TEST_JWT_SECRET || 'test-secret-key',
    DATABASE_URL:
      process.env.TEST_DATABASE_URL ||
      'postgresql://test:${TEST_DB_PASSWORD}@localhost:5432/test',
    REDIS_URL: process.env.TEST_REDIS_URL || 'redis://localhost:6379',
  });
}

export {};
