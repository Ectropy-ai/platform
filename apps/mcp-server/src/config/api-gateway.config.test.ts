import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  API_GATEWAY_HOST,
  API_GATEWAY_PORT,
  API_GATEWAY_URL,
  getApiGatewayConfig,
  validateApiGatewayConfig,
} from '../config/api-gateway.config';

describe('API Gateway Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment variables
    process.env = originalEnv;
  });

  describe('API_GATEWAY_HOST', () => {
    it('should use environment variable when set', () => {
      process.env.API_GATEWAY_HOST = 'custom-host';
      // Need to re-import to get fresh values
      const config = getApiGatewayConfig();
      expect(config.host).toBe('custom-host');
    });

    it('should use ectropy-api in production environment', () => {
      delete process.env.API_GATEWAY_HOST;
      process.env.NODE_ENV = 'production';
      const config = getApiGatewayConfig();
      expect(config.host).toBe('ectropy-api');
    });

    it('should use ectropy-api in staging environment', () => {
      delete process.env.API_GATEWAY_HOST;
      process.env.NODE_ENV = 'staging';
      const config = getApiGatewayConfig();
      expect(config.host).toBe('ectropy-api');
    });

    it('should use localhost in development environment', () => {
      delete process.env.API_GATEWAY_HOST;
      process.env.NODE_ENV = 'development';
      const config = getApiGatewayConfig();
      expect(config.host).toBe('localhost');
    });

    it('should default to localhost when NODE_ENV is not set', () => {
      delete process.env.API_GATEWAY_HOST;
      delete process.env.NODE_ENV;
      const config = getApiGatewayConfig();
      expect(config.host).toBe('localhost');
    });
  });

  describe('API_GATEWAY_PORT', () => {
    it('should use environment variable when set', () => {
      process.env.API_GATEWAY_PORT = '8080';
      const config = getApiGatewayConfig();
      expect(config.port).toBe('8080');
    });

    it('should default to 4000', () => {
      delete process.env.API_GATEWAY_PORT;
      const config = getApiGatewayConfig();
      expect(config.port).toBe('4000');
    });
  });

  describe('API_GATEWAY_URL', () => {
    it('should construct URL from host and port', () => {
      process.env.API_GATEWAY_HOST = 'test-host';
      process.env.API_GATEWAY_PORT = '5000';
      const config = getApiGatewayConfig();
      expect(config.url).toBe('http://test-host:5000');
    });

    it('should use default values when not configured', () => {
      delete process.env.API_GATEWAY_HOST;
      delete process.env.API_GATEWAY_PORT;
      delete process.env.NODE_ENV;
      const config = getApiGatewayConfig();
      expect(config.url).toBe('http://localhost:4000');
    });
  });

  describe('getApiGatewayConfig', () => {
    it('should return complete configuration object', () => {
      process.env.API_GATEWAY_HOST = 'test-host';
      process.env.API_GATEWAY_PORT = '3000';
      process.env.API_GATEWAY_TIMEOUT = '10000';

      const config = getApiGatewayConfig();

      expect(config).toHaveProperty('host', 'test-host');
      expect(config).toHaveProperty('port', '3000');
      expect(config).toHaveProperty('url', 'http://test-host:3000');
      expect(config).toHaveProperty('timeout', 10000);
    });

    it('should use default timeout when not configured', () => {
      delete process.env.API_GATEWAY_TIMEOUT;
      const config = getApiGatewayConfig();
      expect(config.timeout).toBe(5000);
    });
  });

  describe('validateApiGatewayConfig', () => {
    it('should validate correct configuration', () => {
      const config = {
        host: 'localhost',
        port: '4000',
        url: 'http://localhost:4000',
        timeout: 5000,
      };

      const result = validateApiGatewayConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty host', () => {
      const config = {
        host: '',
        port: '4000',
        url: 'http://localhost:4000',
        timeout: 5000,
      };

      const result = validateApiGatewayConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('API Gateway host is required');
    });

    it('should reject empty port', () => {
      const config = {
        host: 'localhost',
        port: '',
        url: 'http://localhost:4000',
        timeout: 5000,
      };

      const result = validateApiGatewayConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('API Gateway port is required');
    });

    it('should reject invalid port number', () => {
      const config = {
        host: 'localhost',
        port: 'invalid',
        url: 'http://localhost:4000',
        timeout: 5000,
      };

      const result = validateApiGatewayConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'API Gateway port must be a valid number between 1 and 65535'
      );
    });

    it('should reject port out of range (too low)', () => {
      const config = {
        host: 'localhost',
        port: '0',
        url: 'http://localhost:0',
        timeout: 5000,
      };

      const result = validateApiGatewayConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'API Gateway port must be a valid number between 1 and 65535'
      );
    });

    it('should reject port out of range (too high)', () => {
      const config = {
        host: 'localhost',
        port: '70000',
        url: 'http://localhost:70000',
        timeout: 5000,
      };

      const result = validateApiGatewayConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'API Gateway port must be a valid number between 1 and 65535'
      );
    });

    it('should reject negative timeout', () => {
      const config = {
        host: 'localhost',
        port: '4000',
        url: 'http://localhost:4000',
        timeout: -1,
      };

      const result = validateApiGatewayConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('API Gateway timeout must be non-negative');
    });

    it('should return multiple errors for multiple issues', () => {
      const config = {
        host: '',
        port: 'invalid',
        url: 'http://localhost:4000',
        timeout: -5,
      };

      const result = validateApiGatewayConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});
