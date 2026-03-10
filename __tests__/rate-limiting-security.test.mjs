/**
 * Comprehensive Rate Limiting Test Suite
 * Enterprise-grade testing for IPv6 security fixes
 */

import { jest } from '@jest/globals';

// Mock dependencies
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

const mockAuditLogger = {
  logRateLimitEvent: jest.fn()
};

// Mock express-rate-limit with proper structure
const mockRateLimit = jest.fn((options) => ({
  _config: options,
  options: options,
  middleware: jest.fn()
}));

// Mock modules
jest.unstable_mockModule('@ectropy/shared/utils', () => ({
  logger: mockLogger
}));

jest.unstable_mockModule('@ectropy/shared/audit', () => ({
  auditLogger: mockAuditLogger
}));

jest.unstable_mockModule('express-rate-limit', () => ({
  default: mockRateLimit
}));

describe('Rate Limiting Security Fixes', () => {
  let createRateLimiter, createEnhancedRateLimiter;

  beforeAll(async () => {
    // Import the module after mocking
    const module = await import('../libs/shared/security/src/security.middleware.js');
    createRateLimiter = module.createRateLimiter;
    createEnhancedRateLimiter = module.createEnhancedRateLimiter;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('IPv6 Subnet Handling', () => {
    it('should properly handle IPv6 addresses with subnet masking', () => {
      const options = {
        windowMs: 60000,
        max: 100,
        message: 'Too many requests',
        keyPrefix: 'test'
      };

      createRateLimiter(options);

      expect(mockRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          keyGenerator: expect.any(Function),
          standardHeaders: 'draft-8',
          legacyHeaders: false
        })
      );
    });

    it('should generate proper keys for IPv6 addresses', () => {
      const mockReq = {
        ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        get: jest.fn().mockReturnValue('test-agent'),
        headers: {}
      };

      const options = {
        windowMs: 60000,
        max: 100,
        message: 'Too many requests',
        keyPrefix: 'test'
      };

      createRateLimiter(options);
      const callArgs = mockRateLimit.mock.calls[0][0];
      const keyGenerator = callArgs.keyGenerator;

      const result = keyGenerator(mockReq);

      expect(result).toBe('test:2001:0db8:85a3:0000::/64:test-agent');
    });

    it('should generate proper keys for IPv4 addresses', () => {
      const mockReq = {
        ip: '192.168.1.1',
        get: jest.fn().mockReturnValue('test-agent'),
        headers: {}
      };

      const options = {
        windowMs: 60000,
        max: 100,
        message: 'Too many requests',
        keyPrefix: 'test'
      };

      createRateLimiter(options);
      const callArgs = mockRateLimit.mock.calls[0][0];
      const keyGenerator = callArgs.keyGenerator;

      const result = keyGenerator(mockReq);

      expect(result).toBe('test:192.168.1.1:test-agent');
    });
  });

  describe('API Key Prioritization', () => {
    it('should prioritize API keys over IP addresses', () => {
      const mockReq = {
        ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        get: jest.fn().mockReturnValue('test-agent'),
        headers: { 'x-api-key': 'test-api-key-123' }
      };

      const options = {
        windowMs: 60000,
        max: 100,
        message: 'Too many requests',
        keyPrefix: 'test'
      };

      createRateLimiter(options);
      const callArgs = mockRateLimit.mock.calls[0][0];
      const keyGenerator = callArgs.keyGenerator;

      const result = keyGenerator(mockReq);

      expect(result).toContain('api:test-api-key-123');
    });
  });

  describe('Enhanced Rate Limiter', () => {
    it('should support per-user rate limiting', () => {
      const mockAuthReq = {
        ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        get: jest.fn().mockReturnValue('test-agent'),
        headers: {},
        user: { id: 'user-123' }
      };

      const options = {
        windowMs: 60000,
        max: 100,
        message: 'Too many requests',
        keyPrefix: 'test',
        perUser: true,
        userMax: 500
      };

      createEnhancedRateLimiter(options);
      const callArgs = mockRateLimit.mock.calls[0][0];
      const keyGenerator = callArgs.keyGenerator;

      const result = keyGenerator(mockAuthReq);

      expect(result).toBe('test:user:user-123');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Rate limiting per user',
        expect.any(Object)
      );
    });

    it('should fall back to IP-based limiting for unauthenticated users', () => {
      const mockReq = {
        ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        get: jest.fn().mockReturnValue('test-agent'),
        headers: {},
        user: null
      };

      const options = {
        windowMs: 60000,
        max: 100,
        message: 'Too many requests',
        keyPrefix: 'test',
        perUser: true,
        userMax: 500
      };

      createEnhancedRateLimiter(options);
      const callArgs = mockRateLimit.mock.calls[0][0];
      const keyGenerator = callArgs.keyGenerator;

      const result = keyGenerator(mockReq);
      expect(result).toBe('test:2001:0db8:85a3:0000::/64:test-agent');
    });

    it('should include standard headers configuration', () => {
      const options = {
        windowMs: 60000,
        max: 100,
        message: 'Too many requests',
        keyPrefix: 'test'
      };

      createEnhancedRateLimiter(options);

      expect(mockRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          standardHeaders: 'draft-8',
          legacyHeaders: false
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle undefined IP addresses gracefully', () => {
      const mockReq = {
        ip: undefined,
        get: jest.fn().mockReturnValue('test-agent'),
        headers: {}
      };

      const options = {
        windowMs: 60000,
        max: 100,
        message: 'Too many requests',
        keyPrefix: 'test'
      };

      createRateLimiter(options);
      const callArgs = mockRateLimit.mock.calls[0][0];
      const keyGenerator = callArgs.keyGenerator;

      const result = keyGenerator(mockReq);
      expect(result).toBe('test:unknown:test-agent');
    });

    it('should handle missing User-Agent headers', () => {
      const mockReq = {
        ip: '192.168.1.1',
        get: jest.fn().mockReturnValue(undefined),
        headers: {}
      };

      const options = {
        windowMs: 60000,
        max: 100,
        message: 'Too many requests',
        keyPrefix: 'test'
      };

      createRateLimiter(options);
      const callArgs = mockRateLimit.mock.calls[0][0];
      const keyGenerator = callArgs.keyGenerator;

      const result = keyGenerator(mockReq);

      expect(result).toContain('unknown');
    });
  });
});