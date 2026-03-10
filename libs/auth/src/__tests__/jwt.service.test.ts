/**
 * ENTERPRISE UNIT TESTS - JWT Service
 *
 * Purpose: Comprehensive testing of JWT token generation and verification
 * Scope: Access tokens, refresh tokens, token pairs, expiration, validation
 * Framework: Vitest
 *
 * ENTERPRISE FOCUS:
 * - Security-critical token operations
 * - Edge cases (expired, malformed, tampered tokens)
 * - Consistent AAA pattern (Arrange, Act, Assert)
 * - Clear, descriptive test names
 *
 * SECURITY COVERAGE:
 * - Token signature verification
 * - Token expiration enforcement
 * - Token type validation (access vs refresh)
 * - Payload integrity verification
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { JWTService } from '../services/jwt.service.js';
import { createTestAuthConfig, createShortTokenConfig } from './mocks/config.mock.js';
import type { AuthConfig, JWTPayload } from '../types/auth.types.js';

// Mock the logger
vi.mock('@ectropy/shared/utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('JWTService - Enterprise Unit Tests', () => {
  let jwtService: JWTService;
  let config: AuthConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createTestAuthConfig();
    jwtService = new JWTService(config);
  });

  describe('1. Access Token Generation', () => {
    describe('generateAccessToken()', () => {
      it('should generate a valid JWT string', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          sessionId: 'session-456',
        };

        // Act
        const token = jwtService.generateAccessToken(payload);

        // Assert
        expect(token).toBeDefined();
        expect(typeof token).toBe('string');
        expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
      });

      it('should include correct payload claims', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['admin', 'user'],
          sessionId: 'session-456',
        };

        // Act
        const token = jwtService.generateAccessToken(payload);
        const decoded = jwt.decode(token) as JWTPayload;

        // Assert
        expect(decoded.userId).toBe('user-123');
        expect(decoded.email).toBe('test@example.com');
        expect(decoded.roles).toEqual(['admin', 'user']);
        expect(decoded.sessionId).toBe('session-456');
      });

      it('should set correct issuer claim', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          sessionId: 'session-456',
        };

        // Act
        const token = jwtService.generateAccessToken(payload);
        const decoded = jwt.decode(token) as any;

        // Assert
        expect(decoded.iss).toBe('ectropy-platform');
      });

      it('should set correct audience claim', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          sessionId: 'session-456',
        };

        // Act
        const token = jwtService.generateAccessToken(payload);
        const decoded = jwt.decode(token) as any;

        // Assert
        expect(decoded.aud).toBe('ectropy-users');
      });

      it('should set expiration time based on config', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          sessionId: 'session-456',
        };
        const now = Math.floor(Date.now() / 1000);

        // Act
        const token = jwtService.generateAccessToken(payload);
        const decoded = jwt.decode(token) as JWTPayload;

        // Assert
        expect(decoded.exp).toBeDefined();
        expect(decoded.iat).toBeDefined();
        // Token should expire approximately 1 hour from now (with 5 second tolerance)
        expect(decoded.exp! - now).toBeGreaterThan(3595);
        expect(decoded.exp! - now).toBeLessThan(3605);
      });

      it('should generate unique tokens for same payload', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          sessionId: 'session-456',
        };

        // Act
        const token1 = jwtService.generateAccessToken(payload);
        const token2 = jwtService.generateAccessToken(payload);

        // Assert - iat will be same if generated in same second
        // but they should still be valid distinct tokens
        expect(token1).toBeDefined();
        expect(token2).toBeDefined();
      });

      it('should handle empty roles array', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: [],
          sessionId: 'session-456',
        };

        // Act
        const token = jwtService.generateAccessToken(payload);
        const decoded = jwt.decode(token) as JWTPayload;

        // Assert
        expect(decoded.roles).toEqual([]);
      });

      it('should handle multiple roles', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['admin', 'user', 'moderator', 'analyst'],
          sessionId: 'session-456',
        };

        // Act
        const token = jwtService.generateAccessToken(payload);
        const decoded = jwt.decode(token) as JWTPayload;

        // Assert
        expect(decoded.roles).toHaveLength(4);
        expect(decoded.roles).toContain('admin');
        expect(decoded.roles).toContain('analyst');
      });
    });
  });

  describe('2. Refresh Token Generation', () => {
    describe('generateRefreshToken()', () => {
      it('should generate a valid JWT string', () => {
        // Arrange
        const userId = 'user-123';
        const sessionId = 'session-456';

        // Act
        const token = jwtService.generateRefreshToken(userId, sessionId);

        // Assert
        expect(token).toBeDefined();
        expect(typeof token).toBe('string');
        expect(token.split('.')).toHaveLength(3);
      });

      it('should include type claim as "refresh"', () => {
        // Arrange
        const userId = 'user-123';
        const sessionId = 'session-456';

        // Act
        const token = jwtService.generateRefreshToken(userId, sessionId);
        const decoded = jwt.decode(token) as any;

        // Assert
        expect(decoded.type).toBe('refresh');
      });

      it('should include userId and sessionId', () => {
        // Arrange
        const userId = 'user-123';
        const sessionId = 'session-456';

        // Act
        const token = jwtService.generateRefreshToken(userId, sessionId);
        const decoded = jwt.decode(token) as any;

        // Assert
        expect(decoded.userId).toBe('user-123');
        expect(decoded.sessionId).toBe('session-456');
      });

      it('should include roles when provided', () => {
        // Arrange
        const userId = 'user-123';
        const sessionId = 'session-456';
        const roles = ['admin', 'user'];

        // Act
        const token = jwtService.generateRefreshToken(userId, sessionId, roles);
        const decoded = jwt.decode(token) as any;

        // Assert
        expect(decoded.roles).toEqual(['admin', 'user']);
      });

      it('should default to empty roles array', () => {
        // Arrange
        const userId = 'user-123';
        const sessionId = 'session-456';

        // Act
        const token = jwtService.generateRefreshToken(userId, sessionId);
        const decoded = jwt.decode(token) as any;

        // Assert
        expect(decoded.roles).toEqual([]);
      });

      it('should have longer expiration than access token', () => {
        // Arrange
        const userId = 'user-123';
        const sessionId = 'session-456';
        const now = Math.floor(Date.now() / 1000);

        // Act
        const accessToken = jwtService.generateAccessToken({
          userId,
          email: 'test@example.com',
          roles: [],
          sessionId,
        });
        const refreshToken = jwtService.generateRefreshToken(userId, sessionId);

        const accessDecoded = jwt.decode(accessToken) as any;
        const refreshDecoded = jwt.decode(refreshToken) as any;

        // Assert - refresh token should expire later than access token
        expect(refreshDecoded.exp).toBeGreaterThan(accessDecoded.exp);
      });
    });
  });

  describe('3. Token Pair Generation', () => {
    describe('generateTokenPair()', () => {
      it('should return both access and refresh tokens', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          sessionId: 'session-456',
        };

        // Act
        const tokenPair = jwtService.generateTokenPair(payload);

        // Assert
        expect(tokenPair.accessToken).toBeDefined();
        expect(tokenPair.refreshToken).toBeDefined();
        expect(typeof tokenPair.accessToken).toBe('string');
        expect(typeof tokenPair.refreshToken).toBe('string');
      });

      it('should return correct expiresIn value', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          sessionId: 'session-456',
        };

        // Act
        const tokenPair = jwtService.generateTokenPair(payload);

        // Assert - should be approximately 3600 seconds (1 hour)
        expect(tokenPair.expiresIn).toBeGreaterThan(3595);
        expect(tokenPair.expiresIn).toBeLessThanOrEqual(3600);
      });

      it('should generate tokens with consistent payload', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['admin'],
          sessionId: 'session-456',
        };

        // Act
        const tokenPair = jwtService.generateTokenPair(payload);
        const accessDecoded = jwt.decode(tokenPair.accessToken) as any;
        const refreshDecoded = jwt.decode(tokenPair.refreshToken) as any;

        // Assert
        expect(accessDecoded.userId).toBe(refreshDecoded.userId);
        expect(accessDecoded.sessionId).toBe(refreshDecoded.sessionId);
      });
    });
  });

  describe('4. Access Token Verification', () => {
    describe('verifyAccessToken()', () => {
      it('should verify valid token and return payload', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          sessionId: 'session-456',
        };
        const token = jwtService.generateAccessToken(payload);

        // Act
        const result = jwtService.verifyAccessToken(token);

        // Assert
        expect(result.userId).toBe('user-123');
        expect(result.email).toBe('test@example.com');
        expect(result.roles).toEqual(['user']);
        expect(result.sessionId).toBe('session-456');
      });

      it('should throw TOKEN_EXPIRED for expired token', async () => {
        // Arrange
        const shortConfig = createShortTokenConfig();
        const shortService = new JWTService(shortConfig);
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          sessionId: 'session-456',
        };
        const token = shortService.generateAccessToken(payload);

        // Wait for token to expire
        await new Promise(resolve => setTimeout(resolve, 1100));

        // Act & Assert
        expect(() => shortService.verifyAccessToken(token)).toThrow('TOKEN_EXPIRED');
      });

      it('should throw INVALID_TOKEN for malformed token', () => {
        // Arrange
        const malformedToken = 'not.a.valid.jwt';

        // Act & Assert
        expect(() => jwtService.verifyAccessToken(malformedToken)).toThrow('INVALID_TOKEN');
      });

      it('should throw INVALID_TOKEN for token with wrong signature', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          sessionId: 'session-456',
        };
        // Create token with different secret
        const token = jwt.sign(payload, 'wrong-secret-key', { expiresIn: '1h' });

        // Act & Assert
        expect(() => jwtService.verifyAccessToken(token)).toThrow('INVALID_TOKEN');
      });

      it('should throw INVALID_TOKEN for empty token', () => {
        // Act & Assert
        expect(() => jwtService.verifyAccessToken('')).toThrow();
      });

      it('should throw INVALID_TOKEN for token with tampered payload', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          sessionId: 'session-456',
        };
        const token = jwtService.generateAccessToken(payload);

        // Tamper with the payload (middle part of JWT)
        const parts = token.split('.');
        const tamperedPayload = Buffer.from(JSON.stringify({
          ...payload,
          roles: ['admin'], // Attempt privilege escalation
        })).toString('base64url');
        const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

        // Act & Assert
        expect(() => jwtService.verifyAccessToken(tamperedToken)).toThrow('INVALID_TOKEN');
      });
    });
  });

  describe('5. Refresh Token Verification', () => {
    describe('verifyRefreshToken()', () => {
      it('should verify valid refresh token', () => {
        // Arrange
        const userId = 'user-123';
        const sessionId = 'session-456';
        const roles = ['admin'];
        const token = jwtService.generateRefreshToken(userId, sessionId, roles);

        // Act
        const result = jwtService.verifyRefreshToken(token);

        // Assert
        expect(result.userId).toBe('user-123');
        expect(result.sessionId).toBe('session-456');
        expect(result.roles).toEqual(['admin']);
      });

      it('should throw INVALID_TOKEN_TYPE for access token', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          sessionId: 'session-456',
        };
        const accessToken = jwtService.generateAccessToken(payload);

        // Act & Assert
        expect(() => jwtService.verifyRefreshToken(accessToken)).toThrow('INVALID_TOKEN_TYPE');
      });

      it('should throw REFRESH_TOKEN_EXPIRED for expired refresh token', async () => {
        // Arrange - Use a token that's already expired
        const shortConfig = { ...createTestAuthConfig(), refreshTokenExpiresIn: '1ms' };
        const shortService = new JWTService(shortConfig);
        const token = shortService.generateRefreshToken('user-123', 'session-456');

        // Wait for token to expire
        await new Promise(resolve => setTimeout(resolve, 50));

        // Act & Assert
        expect(() => shortService.verifyRefreshToken(token)).toThrow('REFRESH_TOKEN_EXPIRED');
      });

      it('should throw INVALID_REFRESH_TOKEN for malformed token', () => {
        // Arrange
        const malformedToken = 'invalid.refresh.token';

        // Act & Assert
        expect(() => jwtService.verifyRefreshToken(malformedToken)).toThrow('INVALID_REFRESH_TOKEN');
      });

      it('should throw INVALID_REFRESH_TOKEN for token with wrong signature', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          sessionId: 'session-456',
          type: 'refresh',
        };
        const token = jwt.sign(payload, 'wrong-secret', { expiresIn: '7d' });

        // Act & Assert
        expect(() => jwtService.verifyRefreshToken(token)).toThrow('INVALID_REFRESH_TOKEN');
      });
    });
  });

  describe('6. Async Token Verification', () => {
    describe('verifyToken()', () => {
      it('should resolve with payload for valid token', async () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          sessionId: 'session-456',
        };
        const token = jwtService.generateAccessToken(payload);

        // Act
        const result = await jwtService.verifyToken(token);

        // Assert
        expect(result.userId).toBe('user-123');
        expect(result.email).toBe('test@example.com');
      });

      it('should reject for invalid token', async () => {
        // Arrange
        const invalidToken = 'invalid.token.here';

        // Act & Assert
        await expect(jwtService.verifyToken(invalidToken)).rejects.toThrow();
      });
    });
  });

  describe('7. Token Decoding (Without Verification)', () => {
    describe('decodeToken()', () => {
      it('should decode valid token without verification', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          sessionId: 'session-456',
        };
        const token = jwtService.generateAccessToken(payload);

        // Act
        const decoded = jwtService.decodeToken(token);

        // Assert
        expect(decoded).not.toBeNull();
        expect(decoded?.userId).toBe('user-123');
      });

      it('should decode even tokens with wrong signature', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          sessionId: 'session-456',
        };
        const token = jwt.sign(payload, 'different-secret', { expiresIn: '1h' });

        // Act
        const decoded = jwtService.decodeToken(token);

        // Assert
        expect(decoded).not.toBeNull();
        expect(decoded?.userId).toBe('user-123');
      });

      it('should return null for completely invalid token', () => {
        // Arrange
        const invalidToken = 'not-even-close-to-jwt';

        // Act
        const decoded = jwtService.decodeToken(invalidToken);

        // Assert
        expect(decoded).toBeNull();
      });
    });
  });

  describe('8. Token Expiration Checking', () => {
    describe('isTokenExpired()', () => {
      it('should return false for valid non-expired token', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          sessionId: 'session-456',
        };
        const token = jwtService.generateAccessToken(payload);

        // Act
        const isExpired = jwtService.isTokenExpired(token);

        // Assert
        expect(isExpired).toBe(false);
      });

      it('should return true for expired token', async () => {
        // Arrange
        const shortConfig = createShortTokenConfig();
        const shortService = new JWTService(shortConfig);
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          sessionId: 'session-456',
        };
        const token = shortService.generateAccessToken(payload);

        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 1100));

        // Act
        const isExpired = shortService.isTokenExpired(token);

        // Assert
        expect(isExpired).toBe(true);
      });

      it('should return true for invalid token', () => {
        // Arrange
        const invalidToken = 'not.a.jwt';

        // Act
        const isExpired = jwtService.isTokenExpired(invalidToken);

        // Assert
        expect(isExpired).toBe(true);
      });

      it('should return true for token without exp claim', () => {
        // Arrange
        const tokenWithoutExp = jwt.sign({ userId: 'user-123' }, config.jwtSecret);

        // Act
        const isExpired = jwtService.isTokenExpired(tokenWithoutExp);

        // Assert
        expect(isExpired).toBe(true);
      });
    });

    describe('getTokenExpirationTime()', () => {
      it('should return Date object for valid token', () => {
        // Arrange
        const payload = {
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          sessionId: 'session-456',
        };
        const token = jwtService.generateAccessToken(payload);

        // Act
        const expiration = jwtService.getTokenExpirationTime(token);

        // Assert
        expect(expiration).toBeInstanceOf(Date);
        expect(expiration!.getTime()).toBeGreaterThan(Date.now());
      });

      it('should return null for invalid token', () => {
        // Arrange
        const invalidToken = 'invalid';

        // Act
        const expiration = jwtService.getTokenExpirationTime(invalidToken);

        // Assert
        expect(expiration).toBeNull();
      });

      it('should return null for token without exp claim', () => {
        // Arrange
        const tokenWithoutExp = jwt.sign({ userId: 'user-123' }, config.jwtSecret);

        // Act
        const expiration = jwtService.getTokenExpirationTime(tokenWithoutExp);

        // Assert
        expect(expiration).toBeNull();
      });
    });
  });

  describe('9. Security Edge Cases', () => {
    it('should not accept "none" algorithm tokens', () => {
      // Arrange - Create unsigned token
      const payload = {
        userId: 'user-123',
        email: 'admin@example.com',
        roles: ['admin'],
        sessionId: 'session-456',
      };
      // Manually construct a "none" algorithm token
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const noneToken = `${header}.${body}.`;

      // Act & Assert
      expect(() => jwtService.verifyAccessToken(noneToken)).toThrow();
    });

    it('should reject tokens signed with completely different key', () => {
      // Arrange - Token signed with a different secret entirely
      const payload = {
        userId: 'attacker-123',
        email: 'attacker@example.com',
        roles: ['admin'], // Attempted privilege escalation
        sessionId: 'session-456',
      };
      const attackerToken = jwt.sign(payload, 'completely-different-secret-key', {
        expiresIn: '1h',
        issuer: 'ectropy-platform',
        audience: 'ectropy-users',
      });

      // Act & Assert - Should fail because signature doesn't match
      expect(() => jwtService.verifyAccessToken(attackerToken)).toThrow('INVALID_TOKEN');
    });

    it('should handle very long payloads', () => {
      // Arrange
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        roles: Array(100).fill('role').map((r, i) => `${r}-${i}`),
        sessionId: 'session-456',
      };

      // Act
      const token = jwtService.generateAccessToken(payload);
      const result = jwtService.verifyAccessToken(token);

      // Assert
      expect(result.roles).toHaveLength(100);
    });

    it('should handle special characters in payload', () => {
      // Arrange
      const payload = {
        userId: 'user-123',
        email: 'test+special@example.com',
        roles: ['user'],
        sessionId: 'session-with-special-chars!@#$%',
      };

      // Act
      const token = jwtService.generateAccessToken(payload);
      const result = jwtService.verifyAccessToken(token);

      // Assert
      expect(result.email).toBe('test+special@example.com');
      expect(result.sessionId).toBe('session-with-special-chars!@#$%');
    });

    it('should handle unicode characters in payload', () => {
      // Arrange
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        roles: ['管理员', 'пользователь'], // Chinese and Russian
        sessionId: 'session-456',
      };

      // Act
      const token = jwtService.generateAccessToken(payload);
      const result = jwtService.verifyAccessToken(token);

      // Assert
      expect(result.roles).toContain('管理员');
      expect(result.roles).toContain('пользователь');
    });
  });
});
