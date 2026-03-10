/**
 * ENTERPRISE UNIT TESTS - Auth Middleware
 *
 * Purpose: Comprehensive testing of Express.js authentication middleware
 * Scope: Token extraction, authentication enforcement, role-based access control
 * Framework: Vitest
 *
 * ENTERPRISE FOCUS:
 * - Request authentication enforcement
 * - Role-based access control (RBAC)
 * - Token extraction from headers and cookies
 * - Error response standardization
 *
 * SECURITY COVERAGE:
 * - Unauthenticated request rejection
 * - Expired token handling
 * - Invalid token handling
 * - Role authorization enforcement
 * - Optional authentication flows
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthMiddleware } from '../middleware/auth.middleware.js';
import { createTestAuthConfig, createShortTokenConfig } from './mocks/config.mock.js';
import type { AuthConfig } from '../types/auth.types.js';

// Mock the logger
vi.mock('@ectropy/shared/utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

/**
 * Creates a mock Express Request object
 */
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    cookies: {},
    user: undefined,
    sessionId: undefined,
    ...overrides,
  } as Request;
}

/**
 * Creates a mock Express Response object with spy functions
 */
function createMockResponse(): Response & {
  _statusCode: number;
  _jsonData: any;
} {
  const res = {
    _statusCode: 200,
    _jsonData: null,
    status: vi.fn(function (this: any, code: number) {
      this._statusCode = code;
      return this;
    }),
    json: vi.fn(function (this: any, data: any) {
      this._jsonData = data;
      return this;
    }),
  } as Response & { _statusCode: number; _jsonData: any };

  return res;
}

/**
 * Creates a mock NextFunction
 */
function createMockNext(): NextFunction {
  return vi.fn();
}

describe('AuthMiddleware - Enterprise Unit Tests', () => {
  let authMiddleware: AuthMiddleware;
  let config: AuthConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createTestAuthConfig();
    authMiddleware = new AuthMiddleware(config);
  });

  /**
   * Helper to generate a valid test token
   */
  function generateValidToken(payload?: Partial<{
    userId: string;
    email: string;
    roles: string[];
    sessionId: string;
  }>): string {
    const defaultPayload = {
      userId: 'user-123',
      email: 'test@example.com',
      roles: ['user'],
      sessionId: 'session-456',
      ...payload,
    };
    return jwt.sign(defaultPayload, config.jwtSecret, {
      expiresIn: '1h',
      issuer: 'ectropy-platform',
      audience: 'ectropy-users',
    });
  }

  describe('1. requireAuth() Middleware', () => {
    describe('Token Extraction', () => {
      it('should extract token from Authorization header', async () => {
        // Arrange
        const token = generateValidToken();
        const req = createMockRequest({
          headers: { authorization: `Bearer ${token}` },
        });
        const res = createMockResponse();
        const next = createMockNext();

        // Act
        await authMiddleware.requireAuth()(req, res, next);

        // Assert
        expect(next).toHaveBeenCalled();
        expect(req.user).toBeDefined();
        expect(req.user?.id).toBe('user-123');
      });

      it('should extract token from cookie when header not present', async () => {
        // Arrange
        const token = generateValidToken();
        const req = createMockRequest({
          cookies: { accessToken: token },
        });
        const res = createMockResponse();
        const next = createMockNext();

        // Act
        await authMiddleware.requireAuth()(req, res, next);

        // Assert
        expect(next).toHaveBeenCalled();
        expect(req.user).toBeDefined();
      });

      it('should prefer header token over cookie', async () => {
        // Arrange
        const headerToken = generateValidToken({ userId: 'header-user' });
        const cookieToken = generateValidToken({ userId: 'cookie-user' });
        const req = createMockRequest({
          headers: { authorization: `Bearer ${headerToken}` },
          cookies: { accessToken: cookieToken },
        });
        const res = createMockResponse();
        const next = createMockNext();

        // Act
        await authMiddleware.requireAuth()(req, res, next);

        // Assert
        expect(req.user?.id).toBe('header-user');
      });

      it('should handle Authorization header as array', async () => {
        // Arrange
        const token = generateValidToken();
        const req = createMockRequest({
          headers: { authorization: [`Bearer ${token}`] as any },
        });
        const res = createMockResponse();
        const next = createMockNext();

        // Act
        await authMiddleware.requireAuth()(req, res, next);

        // Assert
        expect(next).toHaveBeenCalled();
        expect(req.user).toBeDefined();
      });

      it('should reject non-Bearer authorization schemes', async () => {
        // Arrange
        const token = generateValidToken();
        const req = createMockRequest({
          headers: { authorization: `Basic ${token}` },
        });
        const res = createMockResponse();
        const next = createMockNext();

        // Act
        await authMiddleware.requireAuth()(req, res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res._jsonData.code).toBe('NO_TOKEN');
      });
    });

    describe('Authentication Success', () => {
      it('should attach user object to request', async () => {
        // Arrange
        const token = generateValidToken({
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['admin', 'user'],
        });
        const req = createMockRequest({
          headers: { authorization: `Bearer ${token}` },
        });
        const res = createMockResponse();
        const next = createMockNext();

        // Act
        await authMiddleware.requireAuth()(req, res, next);

        // Assert
        expect(req.user).toBeDefined();
        expect(req.user?.id).toBe('user-123');
        expect(req.user?.email).toBe('test@example.com');
        expect(req.user?.roles).toContain('admin');
        expect(req.user?.roles).toContain('user');
      });

      it('should attach sessionId to request', async () => {
        // Arrange
        const token = generateValidToken({ sessionId: 'session-xyz' });
        const req = createMockRequest({
          headers: { authorization: `Bearer ${token}` },
        });
        const res = createMockResponse();
        const next = createMockNext();

        // Act
        await authMiddleware.requireAuth()(req, res, next);

        // Assert
        expect(req.sessionId).toBe('session-xyz');
      });

      it('should set primary role from first role in array', async () => {
        // Arrange
        const token = generateValidToken({ roles: ['admin', 'user', 'moderator'] });
        const req = createMockRequest({
          headers: { authorization: `Bearer ${token}` },
        });
        const res = createMockResponse();
        const next = createMockNext();

        // Act
        await authMiddleware.requireAuth()(req, res, next);

        // Assert
        expect(req.user?.role).toBe('admin');
      });

      it('should default to USER role when no roles present', async () => {
        // Arrange
        const token = generateValidToken({ roles: [] });
        const req = createMockRequest({
          headers: { authorization: `Bearer ${token}` },
        });
        const res = createMockResponse();
        const next = createMockNext();

        // Act
        await authMiddleware.requireAuth()(req, res, next);

        // Assert
        expect(req.user?.role).toBe('USER');
      });

      it('should call next() without arguments on success', async () => {
        // Arrange
        const token = generateValidToken();
        const req = createMockRequest({
          headers: { authorization: `Bearer ${token}` },
        });
        const res = createMockResponse();
        const next = createMockNext();

        // Act
        await authMiddleware.requireAuth()(req, res, next);

        // Assert
        expect(next).toHaveBeenCalledWith();
        expect(next).toHaveBeenCalledTimes(1);
      });
    });

    describe('Authentication Failure - No Token', () => {
      it('should return 401 when no token provided', async () => {
        // Arrange
        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        // Act
        await authMiddleware.requireAuth()(req, res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res._jsonData).toEqual({
          success: false,
          error: 'Authentication required',
          code: 'NO_TOKEN',
        });
        expect(next).not.toHaveBeenCalled();
      });

      it('should return 401 for empty Authorization header', async () => {
        // Arrange
        const req = createMockRequest({
          headers: { authorization: '' },
        });
        const res = createMockResponse();
        const next = createMockNext();

        // Act
        await authMiddleware.requireAuth()(req, res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res._jsonData.code).toBe('NO_TOKEN');
      });

      it('should return 401 for "Bearer " without token', async () => {
        // Arrange
        const req = createMockRequest({
          headers: { authorization: 'Bearer ' },
        });
        const res = createMockResponse();
        const next = createMockNext();

        // Act
        await authMiddleware.requireAuth()(req, res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(401);
      });
    });

    describe('Authentication Failure - Invalid Token', () => {
      it('should return 401 for malformed token', async () => {
        // Arrange
        const req = createMockRequest({
          headers: { authorization: 'Bearer not.a.valid.jwt' },
        });
        const res = createMockResponse();
        const next = createMockNext();

        // Act
        await authMiddleware.requireAuth()(req, res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res._jsonData).toEqual({
          success: false,
          error: 'Invalid token',
          code: 'INVALID_TOKEN',
        });
      });

      it('should return 401 for token with wrong signature', async () => {
        // Arrange
        const token = jwt.sign({ userId: 'user-123' }, 'wrong-secret');
        const req = createMockRequest({
          headers: { authorization: `Bearer ${token}` },
        });
        const res = createMockResponse();
        const next = createMockNext();

        // Act
        await authMiddleware.requireAuth()(req, res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res._jsonData.code).toBe('INVALID_TOKEN');
      });

      it('should return 401 for expired token', async () => {
        // Arrange
        const shortConfig = createShortTokenConfig();
        const shortMiddleware = new AuthMiddleware(shortConfig);
        const token = jwt.sign(
          { userId: 'user-123', email: 'test@example.com', roles: ['user'], sessionId: 'session-456' },
          shortConfig.jwtSecret,
          { expiresIn: '1ms' }
        );

        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 10));

        const req = createMockRequest({
          headers: { authorization: `Bearer ${token}` },
        });
        const res = createMockResponse();
        const next = createMockNext();

        // Act
        await shortMiddleware.requireAuth()(req, res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res._jsonData).toEqual({
          success: false,
          error: 'Token expired',
          code: 'TOKEN_EXPIRED',
        });
      });
    });

    describe('Authentication Failure - Server Error', () => {
      it('should return 500 for unexpected errors', async () => {
        // Arrange - Mock the JWT service to throw an unexpected error
        const { JWTService } = await import('../services/jwt.service.js');
        const verifyAccessTokenSpy = vi.spyOn(JWTService.prototype, 'verifyAccessToken');
        verifyAccessTokenSpy.mockImplementation(() => {
          throw new Error('DATABASE_CONNECTION_LOST'); // An unexpected error
        });

        // Create fresh middleware that will use the mocked method
        const testMiddleware = new AuthMiddleware(config);

        const req = createMockRequest({
          headers: { authorization: 'Bearer some.token.here' },
        });
        const res = createMockResponse();
        const next = createMockNext();

        // Act
        await testMiddleware.requireAuth()(req, res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res._jsonData).toEqual({
          success: false,
          error: 'Authentication failed',
          code: 'AUTH_ERROR',
        });

        // Cleanup
        verifyAccessTokenSpy.mockRestore();
      });
    });
  });

  describe('2. optionalAuth() Middleware', () => {
    it('should attach user when valid token provided', async () => {
      // Arrange
      const token = generateValidToken();
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      // Act
      await authMiddleware.optionalAuth()(req, res, next);

      // Assert
      expect(req.user).toBeDefined();
      expect(req.user?.id).toBe('user-123');
      expect(next).toHaveBeenCalled();
    });

    it('should continue without user when no token provided', async () => {
      // Arrange
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      // Act
      await authMiddleware.optionalAuth()(req, res, next);

      // Assert
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should continue without user when token is invalid', async () => {
      // Arrange
      const req = createMockRequest({
        headers: { authorization: 'Bearer invalid.token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      // Act
      await authMiddleware.optionalAuth()(req, res, next);

      // Assert
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should continue without user when token is expired', async () => {
      // Arrange
      const shortConfig = createShortTokenConfig();
      const shortMiddleware = new AuthMiddleware(shortConfig);
      const token = jwt.sign(
        { userId: 'user-123', email: 'test@example.com', roles: ['user'], sessionId: 'session-456' },
        shortConfig.jwtSecret,
        { expiresIn: '1ms' }
      );

      await new Promise(resolve => setTimeout(resolve, 10));

      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      // Act
      await shortMiddleware.optionalAuth()(req, res, next);

      // Assert
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should not send error response for invalid tokens', async () => {
      // Arrange
      const req = createMockRequest({
        headers: { authorization: 'Bearer invalid.token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      // Act
      await authMiddleware.optionalAuth()(req, res, next);

      // Assert
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('3. requireRoles() Middleware', () => {
    it('should allow access when user has required role', () => {
      // Arrange
      const req = createMockRequest();
      req.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        roles: ['admin', 'user'],
        firstName: 'Test',
        lastName: 'User',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const res = createMockResponse();
      const next = createMockNext();

      // Act
      authMiddleware.requireRoles('admin')(req, res, next);

      // Assert
      expect(next).toHaveBeenCalled();
    });

    it('should allow access when user has any of required roles', () => {
      // Arrange
      const req = createMockRequest();
      req.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'moderator',
        roles: ['moderator'],
        firstName: 'Test',
        lastName: 'User',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const res = createMockResponse();
      const next = createMockNext();

      // Act
      authMiddleware.requireRoles('admin', 'moderator', 'superuser')(req, res, next);

      // Assert
      expect(next).toHaveBeenCalled();
    });

    it('should deny access when user lacks required role', () => {
      // Arrange
      const req = createMockRequest();
      req.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'user',
        roles: ['user'],
        firstName: 'Test',
        lastName: 'User',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const res = createMockResponse();
      const next = createMockNext();

      // Act
      authMiddleware.requireRoles('admin')(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res._jsonData).toEqual({
        success: false,
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: ['admin'],
        current: ['user'],
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when user is not authenticated', () => {
      // Arrange
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      // Act
      authMiddleware.requireRoles('admin')(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res._jsonData).toEqual({
        success: false,
        error: 'Authentication required',
        code: 'NO_AUTH',
      });
    });

    it('should handle user with empty roles array', () => {
      // Arrange
      const req = createMockRequest();
      req.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'USER',
        roles: [],
        firstName: 'Test',
        lastName: 'User',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const res = createMockResponse();
      const next = createMockNext();

      // Act
      authMiddleware.requireRoles('admin')(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res._jsonData.current).toEqual([]);
    });

    it('should handle user with undefined roles', () => {
      // Arrange
      const req = createMockRequest();
      req.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'USER',
        roles: undefined as any,
        firstName: 'Test',
        lastName: 'User',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const res = createMockResponse();
      const next = createMockNext();

      // Act
      authMiddleware.requireRoles('admin')(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should handle multiple required roles', () => {
      // Arrange - User has 'editor' but not 'admin' or 'superuser'
      const req = createMockRequest();
      req.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'editor',
        roles: ['editor', 'viewer'],
        firstName: 'Test',
        lastName: 'User',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const res = createMockResponse();
      const next = createMockNext();

      // Act
      authMiddleware.requireRoles('admin', 'superuser')(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res._jsonData.required).toEqual(['admin', 'superuser']);
    });
  });

  describe('4. Static Factory Method', () => {
    describe('create()', () => {
      it('should create new AuthMiddleware instance', () => {
        // Act
        const middleware = AuthMiddleware.create(config);

        // Assert
        expect(middleware).toBeInstanceOf(AuthMiddleware);
      });

      it('should create functional middleware', async () => {
        // Arrange
        const middleware = AuthMiddleware.create(config);
        const token = generateValidToken();
        const req = createMockRequest({
          headers: { authorization: `Bearer ${token}` },
        });
        const res = createMockResponse();
        const next = createMockNext();

        // Act
        await middleware.requireAuth()(req, res, next);

        // Assert
        expect(next).toHaveBeenCalled();
        expect(req.user).toBeDefined();
      });
    });
  });

  describe('5. Security Edge Cases', () => {
    it('should reject tokens with "none" algorithm', async () => {
      // Arrange - Construct a "none" algorithm token
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        userId: 'attacker',
        email: 'attacker@evil.com',
        roles: ['admin'],
        sessionId: 'fake-session',
      })).toString('base64url');
      const noneToken = `${header}.${payload}.`;

      const req = createMockRequest({
        headers: { authorization: `Bearer ${noneToken}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      // Act
      await authMiddleware.requireAuth()(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle token with XSS payload in claims', async () => {
      // Arrange
      const token = generateValidToken({
        email: '<script>alert("xss")</script>@example.com',
      });
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      // Act
      await authMiddleware.requireAuth()(req, res, next);

      // Assert - Token should be valid (XSS is a presentation concern)
      expect(next).toHaveBeenCalled();
      // But the value should be preserved as-is (not executed)
      expect(req.user?.email).toBe('<script>alert("xss")</script>@example.com');
    });

    it('should handle very long tokens', async () => {
      // Arrange - Token with large payload
      const token = generateValidToken({
        roles: Array(100).fill('role').map((r, i) => `${r}-${i}`),
      });
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      // Act
      await authMiddleware.requireAuth()(req, res, next);

      // Assert
      expect(next).toHaveBeenCalled();
      expect(req.user?.roles).toHaveLength(100);
    });

    it('should handle unicode characters in token claims', async () => {
      // Arrange
      const token = generateValidToken({
        email: '用户@example.com',
        roles: ['管理员'],
      });
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      // Act
      await authMiddleware.requireAuth()(req, res, next);

      // Assert
      expect(next).toHaveBeenCalled();
      expect(req.user?.email).toBe('用户@example.com');
      expect(req.user?.roles).toContain('管理员');
    });

    it('should handle concurrent middleware calls', async () => {
      // Arrange
      const token = generateValidToken();
      const requests = Array(5).fill(null).map(() => {
        const req = createMockRequest({
          headers: { authorization: `Bearer ${token}` },
        });
        const res = createMockResponse();
        const next = createMockNext();
        return { req, res, next };
      });

      // Act - Process all requests concurrently
      await Promise.all(
        requests.map(({ req, res, next }) =>
          authMiddleware.requireAuth()(req, res, next)
        )
      );

      // Assert - All should succeed independently
      requests.forEach(({ req, next }) => {
        expect(next).toHaveBeenCalled();
        expect(req.user?.id).toBe('user-123');
      });
    });
  });
});
