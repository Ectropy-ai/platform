/**
 * Redis Connection Factory Tests
 * Validates centralized Redis connection creation with password decoding
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseRedisUrl, createRedisClient } from '../config/redis.config';

describe('Redis Connection Factory', () => {
  describe('parseRedisUrl', () => {
    it('should parse Redis URL with encoded password containing + and =', () => {
      const url = 'redis://:hu5isVbdu2sDY59VNc%2BI0IGKy7imyKxai7LppZSy5ic%3D@ectropy-redis:6379';
      const config = parseRedisUrl(url);
      
      expect(config.host).toBe('ectropy-redis');
      expect(config.port).toBe(6379);
      expect(config.password).toBe('hu5isVbdu2sDY59VNc+I0IGKy7imyKxai7LppZSy5ic=');
    });

    it('should parse Redis URL without password', () => {
      const url = 'redis://localhost:6379';
      const config = parseRedisUrl(url);
      
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(6379);
      expect(config.password).toBeUndefined();
    });

    it('should parse Redis URL with simple password', () => {
      const url = 'redis://:mypassword@redis-server:6380';
      const config = parseRedisUrl(url);
      
      expect(config.host).toBe('redis-server');
      expect(config.port).toBe(6380);
      expect(config.password).toBe('mypassword');
    });

    it('should parse Redis URL with special characters in password', () => {
      const password = 'p@ssw0rd+with=special&chars!';
      const encoded = encodeURIComponent(password);
      const url = `redis://:${encoded}@redis-host:6379`;
      const config = parseRedisUrl(url);
      
      expect(config.password).toBe(password);
    });

    it('should handle malformed URL with fallback to env vars', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        REDIS_HOST: 'fallback-host',
        REDIS_PORT: '6380',
        REDIS_PASSWORD: 'fallback-pass',
      };

      const config = parseRedisUrl('not-a-valid-url');
      
      expect(config.host).toBe('fallback-host');
      expect(config.port).toBe(6380);
      expect(config.password).toBe('fallback-pass');

      process.env = originalEnv;
    });

    it('should use defaults when env vars not set and URL invalid', () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv };
      delete process.env.REDIS_HOST;
      delete process.env.REDIS_PORT;
      delete process.env.REDIS_PASSWORD;

      const config = parseRedisUrl('invalid');
      
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(6379);
      expect(config.password).toBeUndefined();

      process.env = originalEnv;
    });

    it('should parse URL with custom port', () => {
      const url = 'redis://redis-host:6380';
      const config = parseRedisUrl(url);
      
      expect(config.host).toBe('redis-host');
      expect(config.port).toBe(6380);
    });

    it('should decode URL-encoded password correctly', () => {
      // Test production scenario
      const productionPassword = 'hu5isVbdu2sDY59VNc+I0IGKy7imyKxai7LppZSy5ic=';
      const encodedPassword = encodeURIComponent(productionPassword);
      const url = `redis://:${encodedPassword}@ectropy-redis:6379`;
      
      const config = parseRedisUrl(url);
      
      expect(config.password).toBe(productionPassword);
      expect(config.password).toContain('+');
      expect(config.password).toContain('=');
    });
  });

  describe('createRedisClient', () => {
    it('should create Redis client with parsed configuration', () => {
      const url = 'redis://:testpass@localhost:6379';
      
      // We can't fully test Redis connection without a real Redis server,
      // but we can verify the client is created
      const client = createRedisClient(url);
      
      expect(client).toBeDefined();
      expect(client.options).toBeDefined();
      expect(client.options.host).toBe('localhost');
      expect(client.options.port).toBe(6379);
      expect(client.options.password).toBe('testpass');
      
      // Cleanup
      client.disconnect();
    });

    it('should create Redis client with custom options', () => {
      const url = 'redis://:testpass@localhost:6379';
      const client = createRedisClient(url, {
        db: 2,
        keyPrefix: 'cache:',
      });
      
      expect(client).toBeDefined();
      expect(client.options.db).toBe(2);
      expect(client.options.keyPrefix).toBe('cache:');
      
      // Cleanup
      client.disconnect();
    });

    it('should create client with production password containing special chars', () => {
      const productionPassword = 'hu5isVbdu2sDY59VNc+I0IGKy7imyKxai7LppZSy5ic=';
      const encodedPassword = encodeURIComponent(productionPassword);
      const url = `redis://:${encodedPassword}@ectropy-redis:6379`;
      
      const client = createRedisClient(url);
      
      expect(client).toBeDefined();
      expect(client.options.password).toBe(productionPassword);
      expect(client.options.host).toBe('ectropy-redis');
      
      // Cleanup
      client.disconnect();
    });

    it('should apply retry strategy', () => {
      const url = 'redis://localhost:6379';
      const client = createRedisClient(url);
      
      expect(client.options.retryStrategy).toBeDefined();
      expect(client.options.maxRetriesPerRequest).toBe(3);
      
      // Cleanup
      client.disconnect();
    });

    it('should set default connection timeout', () => {
      const url = 'redis://localhost:6379';
      const client = createRedisClient(url);
      
      expect(client.options.connectTimeout).toBe(10000);
      
      // Cleanup
      client.disconnect();
    });
  });

  describe('Password Encoding Round-Trip', () => {
    it('should correctly encode and decode password with special characters', () => {
      const originalPassword = 'p@ssw0rd+with=special&chars!';
      
      // Encode for URL
      const encoded = encodeURIComponent(originalPassword);
      
      // Build URL
      const url = `redis://:${encoded}@redis-host:6379`;
      
      // Parse back
      const config = parseRedisUrl(url);
      
      // Should match original
      expect(config.password).toBe(originalPassword);
    });

    it('should handle production password scenario', () => {
      const productionPassword = 'hu5isVbdu2sDY59VNc+I0IGKy7imyKxai7LppZSy5ic=';
      
      // This is what should be in REDIS_URL
      const encodedPassword = encodeURIComponent(productionPassword);
      expect(encodedPassword).toBe('hu5isVbdu2sDY59VNc%2BI0IGKy7imyKxai7LppZSy5ic%3D');
      
      // Build URL
      const url = `redis://:${encodedPassword}@ectropy-redis:6379`;
      
      // Parse and verify
      const config = parseRedisUrl(url);
      expect(config.password).toBe(productionPassword);
    });
  });
});
