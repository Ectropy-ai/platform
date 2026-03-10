/**
 * Environment Configuration Unit Tests
 * Tests for centralized environment configuration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Environment Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset module cache to get fresh config imports
    vi.resetModules();
    // Reset process.env before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('Server Configuration', () => {
    it('should use MCP_SERVER_STDIO_PORT when set', async () => {
      process.env.MCP_SERVER_STDIO_PORT = '4001';

      // Dynamically import to get fresh config
      const { serverConfig } = await import('../../config/environment.config.js');

      expect(serverConfig.stdioPort).toBe(4001);
    });

    it('should fallback to MCP_PORT when STDIO_PORT not set', async () => {
      process.env.MCP_PORT = '4002';
      delete process.env.MCP_SERVER_STDIO_PORT;

      const { serverConfig } = await import('../../config/environment.config.js');

      expect(serverConfig.stdioPort).toBe(4002);
    });

    it('should use default port when no env vars set', async () => {
      delete process.env.MCP_SERVER_STDIO_PORT;
      delete process.env.MCP_PORT;
      delete process.env.PORT;

      const { serverConfig } = await import('../../config/environment.config.js');

      expect(serverConfig.stdioPort).toBe(3001);
    });

    it('should use MCP_SERVER_EXPRESS_PORT when set', async () => {
      process.env.MCP_SERVER_EXPRESS_PORT = '4003';

      const { serverConfig } = await import('../../config/environment.config.js');

      expect(serverConfig.expressPort).toBe(4003);
    });

    it('should use default Express port when not set', async () => {
      delete process.env.MCP_SERVER_EXPRESS_PORT;
      delete process.env.EXPRESS_PORT;

      const { serverConfig } = await import('../../config/environment.config.js');

      expect(serverConfig.expressPort).toBe(3002);
    });

    it('should detect validation-only mode', async () => {
      process.env.VALIDATION_ONLY = 'true';

      const { serverConfig } = await import('../../config/environment.config.js');

      expect(serverConfig.validationOnly).toBe(true);
    });

    it('should default validation-only to false', async () => {
      delete process.env.VALIDATION_ONLY;

      const { serverConfig } = await import('../../config/environment.config.js');

      expect(serverConfig.validationOnly).toBe(false);
    });
  });

  describe('Security Configuration', () => {
    it('should load MCP_API_KEY from environment', async () => {
      process.env.MCP_API_KEY = 'test-key-12345678901234567890';

      const { securityConfig } = await import('../../config/environment.config.js');

      expect(securityConfig.mcpApiKey).toBe('test-key-12345678901234567890');
    });

    it('should require API key in production by default', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.REQUIRE_API_KEY;

      const { securityConfig } = await import('../../config/environment.config.js');

      expect(securityConfig.requireApiKey).toBe(true);
    });

    it('should not require API key in development by default', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.REQUIRE_API_KEY;

      const { securityConfig } = await import('../../config/environment.config.js');

      expect(securityConfig.requireApiKey).toBe(false);
    });

    it('should parse ALLOWED_ORIGINS as comma-separated list', async () => {
      process.env.ALLOWED_ORIGINS = 'http://example.com,https://app.example.com';

      const { securityConfig } = await import('../../config/environment.config.js');

      expect(securityConfig.allowedOrigins).toContain('http://example.com');
      expect(securityConfig.allowedOrigins).toContain('https://app.example.com');
    });

    it('should enable rate limiting by default', async () => {
      delete process.env.ENABLE_RATE_LIMITING;

      const { securityConfig } = await import('../../config/environment.config.js');

      expect(securityConfig.enableRateLimiting).toBe(true);
    });
  });

  describe('Database Configuration', () => {
    it('should use DATABASE_HOST over DB_HOST', async () => {
      process.env.DATABASE_HOST = 'db.example.com';
      process.env.DB_HOST = 'old.example.com';

      const { databaseConfig } = await import('../../config/environment.config.js');

      expect(databaseConfig.host).toBe('db.example.com');
    });

    it('should fallback to DB_HOST when DATABASE_HOST not set', async () => {
      delete process.env.DATABASE_HOST;
      process.env.DB_HOST = 'fallback.example.com';

      const { databaseConfig } = await import('../../config/environment.config.js');

      expect(databaseConfig.host).toBe('fallback.example.com');
    });

    it('should parse port as integer', async () => {
      process.env.DATABASE_PORT = '5433';

      const { databaseConfig } = await import('../../config/environment.config.js');

      expect(databaseConfig.port).toBe(5433);
      expect(typeof databaseConfig.port).toBe('number');
    });

    it('should use default port 5432 when not set', async () => {
      delete process.env.DATABASE_PORT;
      delete process.env.DB_PORT;

      const { databaseConfig } = await import('../../config/environment.config.js');

      expect(databaseConfig.port).toBe(5432);
    });
  });

  describe('Redis Configuration', () => {
    it('should load Redis host from environment', async () => {
      process.env.REDIS_HOST = 'redis.example.com';

      const { redisConfig } = await import('../../config/environment.config.js');

      expect(redisConfig.host).toBe('redis.example.com');
    });

    it('should parse Redis port as integer', async () => {
      process.env.REDIS_PORT = '6380';

      const { redisConfig } = await import('../../config/environment.config.js');

      expect(redisConfig.port).toBe(6380);
      expect(typeof redisConfig.port).toBe('number');
    });

    it('should use default Redis port 6379', async () => {
      delete process.env.REDIS_PORT;

      const { redisConfig } = await import('../../config/environment.config.js');

      expect(redisConfig.port).toBe(6379);
    });

    it('should load Redis password when set', async () => {
      process.env.REDIS_PASSWORD = 'secure-password';

      const { redisConfig } = await import('../../config/environment.config.js');

      expect(redisConfig.password).toBe('secure-password');
    });

    it('should have undefined password when not set', async () => {
      delete process.env.REDIS_PASSWORD;

      const { redisConfig } = await import('../../config/environment.config.js');

      expect(redisConfig.password).toBeUndefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should validate successfully with valid config', async () => {
      process.env.NODE_ENV = 'test';
      process.env.MCP_SERVER_STDIO_PORT = '3001';
      process.env.MCP_SERVER_EXPRESS_PORT = '3002';

      const { validateConfig } = await import('../../config/environment.config.js');

      expect(() => validateConfig()).not.toThrow();
    });

    it('should throw error when stdio and express ports are same', async () => {
      process.env.MCP_SERVER_STDIO_PORT = '3000';
      process.env.MCP_SERVER_EXPRESS_PORT = '3000';

      const { validateConfig } = await import('../../config/environment.config.js');

      expect(() => validateConfig()).toThrow(/cannot be the same/);
    });
  });
});
