/**
 * Enterprise Unit Tests - AuthService
 * Target: 100% code coverage with comprehensive test scenarios
 */

import bcrypt from 'bcryptjs';
import { AuthService, JWTService, SessionService } from '@ectropy/auth';
import { DatabaseService } from '@ectropy/database';
import { AuthConfig, LoginCredentials, LoginResult } from '@ectropy/auth';
import { vi } from 'vitest';

// Mock dependencies
vi.mock('bcryptjs');
vi.mock('@ectropy/database');
vi.mock('@ectropy/shared/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('AuthService - Enterprise Unit Tests', () => {
  let authService: AuthService;
  let mockDbService: ReturnType<typeof vi.fn>ed<DatabaseService>;
  let mockSessionService: ReturnType<typeof vi.fn>ed<SessionService>;
  let mockConfig: AuthConfig;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    password_hash: '$2b$12$hashedpassword',
    roles: ['user'],
    is_active: true,
    failed_login_attempts: 0,
    locked_until: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    // Setup mock configuration
    mockConfig = {
      jwtSecret: 'test-jwt-secret',
      jwtExpiresIn: '1h',
      refreshTokenExpiresIn: '7d',
      sessionTimeout: 3600000,
      maxLoginAttempts: 5,
      lockoutDuration: 900000,
    };

    // Setup mock database service
    mockDbService = {
      query: vi.fn(),
      transaction: vi.fn(),
      close: vi.fn(),
    } as any;

    // Setup mock session service
    mockSessionService = {
      createSession: vi.fn(),
      getSession: vi.fn(),
      destroySession: vi.fn(),
      updateSession: vi.fn(),
      cleanupExpiredSessions: vi.fn(),
    } as any;

    // Initialize AuthService
    authService = new AuthService(
      mockDbService,
      mockSessionService,
      mockConfig
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should initialize service correctly', () => {
      expect(authService).toBeDefined();
      expect(authService).toBeInstanceOf(AuthService);
    });

    it('should have all required public methods', () => {
      expect(typeof authService.login).toBe('function');
      expect(typeof authService.logout).toBe('function');
      expect(typeof authService.validateToken).toBe('function');
      expect(typeof authService.refreshToken).toBe('function');
      expect(typeof authService.changePassword).toBe('function');
    });
  });

  describe('Login Functionality', () => {
    const validCredentials: LoginCredentials = {
      email: 'test@example.com',
      password: 'ValidPassword123!',
      rememberMe: false,
    };

    beforeEach(() => {
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    });

    it('should login successfully with valid credentials', async () => {
      // Mock database response
      mockDbService.query.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      // Mock session creation
      mockSessionService.createSession.mockResolvedValueOnce({
        sessionId: 'session-123',
        expiresAt: new Date(Date.now() + 3600000),
      });

      const result = await authService.login(validCredentials);

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.tokens).toBeDefined();
      expect(result.tokens?.accessToken).toBeDefined();
      expect(result.tokens?.refreshToken).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should fail login with invalid email', async () => {
      mockDbService.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const invalidCredentials = {
        ...validCredentials,
        email: 'nonexistent@example.com',
      };

      const result = await authService.login(invalidCredentials);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
      expect(result.user).toBeUndefined();
      expect(result.tokens).toBeUndefined();
    });

    it('should fail login with invalid password', async () => {
      mockDbService.query.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      const invalidCredentials = {
        ...validCredentials,
        password: 'WrongPassword',
      };

      const result = await authService.login(invalidCredentials);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
      expect(mockDbService.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET failed_login_attempts'),
        expect.any(Array)
      );
    });

    it('should lock account after max failed attempts', async () => {
      const lockedUser = {
        ...mockUser,
        failed_login_attempts: 5,
      };

      mockDbService.query.mockResolvedValueOnce({
        rows: [lockedUser],
        rowCount: 1,
      } as any);

      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      const result = await authService.login(validCredentials);

      expect(result.success).toBe(false);
      expect(result.error).toContain('locked');
      expect(result.lockoutUntil).toBeDefined();
    });

    it('should handle inactive user accounts', async () => {
      const inactiveUser = {
        ...mockUser,
        is_active: false,
      };

      mockDbService.query.mockResolvedValueOnce({
        rows: [inactiveUser],
        rowCount: 1,
      } as any);

      const result = await authService.login(validCredentials);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Account is inactive');
    });

    it('should handle database errors gracefully', async () => {
      mockDbService.query.mockRejectedValueOnce(
        new Error('Database connection error')
      );

      const result = await authService.login(validCredentials);

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        'Authentication service temporarily unavailable'
      );
    });
  });

  describe('Token Validation', () => {
    const validToken = 'valid.jwt.token';
    const invalidToken = 'invalid.token';

    it('should validate valid token successfully', async () => {
      const mockPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        roles: ['user'],
        sessionId: 'session-123',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      // Mock JWT validation
      jest
        .spyOn(authService['jwtService'], 'verifyToken')
        .mockResolvedValueOnce(mockPayload);

      // Mock session validation
      mockSessionService.getSession.mockResolvedValueOnce({
        userId: 'user-123',
        sessionId: 'session-123',
        email: 'test@example.com',
        roles: ['user'],
        lastActivity: new Date(),
        isValid: true,
      });

      const result = await authService.validateToken(validToken);

      expect(result.valid).toBe(true);
      expect(result.payload).toEqual(mockPayload);
      expect(result.session).toBeDefined();
    });

    it('should reject invalid tokens', async () => {
      jest
        .spyOn(authService['jwtService'], 'verifyToken')
        .mockRejectedValueOnce(new Error('Invalid token'));

      const result = await authService.validateToken(invalidToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token');
    });

    it('should reject tokens with invalid sessions', async () => {
      const mockPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        roles: ['user'],
        sessionId: 'session-123',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      jest
        .spyOn(authService['jwtService'], 'verifyToken')
        .mockResolvedValueOnce(mockPayload);
      mockSessionService.getSession.mockResolvedValueOnce(null);

      const result = await authService.validateToken(validToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Session not found or expired');
    });
  });

  describe('Password Management', () => {
    it('should change password successfully', async () => {
      const userId = 'user-123';
      const oldPassword = 'OldPassword123!';
      const newPassword = 'NewPassword123!';

      // Mock user lookup
      mockDbService.query.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      // Mock password verification
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

      // Mock password hashing
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        '$2b$12$newhashedpassword'
      );

      // Mock password update
      mockDbService.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      } as any);

      const result = await authService.changePassword(
        userId,
        oldPassword,
        newPassword
      );

      expect(result.success).toBe(true);
      expect(bcrypt.hash).toHaveBeenCalledWith(newPassword, 12);
      expect(mockDbService.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET password_hash'),
        expect.arrayContaining(['$2b$12$newhashedpassword', userId])
      );
    });

    it('should reject password change with incorrect old password', async () => {
      const userId = 'user-123';
      const oldPassword = 'WrongOldPassword';
      const newPassword = 'NewPassword123!';

      mockDbService.query.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      const result = await authService.changePassword(
        userId,
        oldPassword,
        newPassword
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Current password is incorrect');
    });

    it('should validate password strength', async () => {
      const userId = 'user-123';
      const oldPassword = 'OldPassword123!';
      const weakPassword = '123';

      const result = await authService.changePassword(
        userId,
        oldPassword,
        weakPassword
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        'Password does not meet security requirements'
      );
    });
  });

  describe('Session Management', () => {
    it('should logout user successfully', async () => {
      const sessionId = 'session-123';

      mockSessionService.destroySession.mockResolvedValueOnce(true);

      const result = await authService.logout(sessionId);

      expect(result.success).toBe(true);
      expect(mockSessionService.destroySession).toHaveBeenCalledWith(sessionId);
    });

    it('should handle logout errors gracefully', async () => {
      const sessionId = 'session-123';

      mockSessionService.destroySession.mockRejectedValueOnce(
        new Error('Session service error')
      );

      const result = await authService.logout(sessionId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Logout failed');
    });
  });

  describe('Token Refresh', () => {
    it('should refresh tokens successfully', async () => {
      const refreshToken = 'valid.refresh.token';
      const mockPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        roles: ['user'],
        sessionId: 'session-123',
      };

      jest
        .spyOn(authService['jwtService'], 'verifyRefreshToken')
        .mockResolvedValueOnce(mockPayload);
      mockSessionService.getSession.mockResolvedValueOnce({
        userId: 'user-123',
        sessionId: 'session-123',
        email: 'test@example.com',
        roles: ['user'],
        lastActivity: new Date(),
        isValid: true,
      });

      const result = await authService.refreshToken(refreshToken);

      expect(result.success).toBe(true);
      expect(result.tokens).toBeDefined();
      expect(result.tokens?.accessToken).toBeDefined();
      expect(result.tokens?.refreshToken).toBeDefined();
    });

    it('should reject invalid refresh tokens', async () => {
      const invalidRefreshToken = 'invalid.refresh.token';

      jest
        .spyOn(authService['jwtService'], 'verifyRefreshToken')
        .mockRejectedValueOnce(new Error('Invalid refresh token'));

      const result = await authService.refreshToken(invalidRefreshToken);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid refresh token');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null/undefined inputs gracefully', async () => {
      await expect(authService.login(null as any)).rejects.toThrow(
        'Invalid credentials'
      );
      await expect(
        authService.validateToken(null as any)
      ).resolves.toMatchObject({
        valid: false,
        error: 'Token is required',
      });
    });

    it('should handle malformed email addresses', async () => {
      const invalidCredentials = {
        email: 'not-an-email',
        password: 'ValidPassword123!',
      };

      const result = await authService.login(invalidCredentials);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid email format');
    });

    it('should handle concurrent login attempts', async () => {
      mockDbService.query.mockResolvedValue({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      mockSessionService.createSession.mockResolvedValue({
        sessionId: 'session-123',
        expiresAt: new Date(Date.now() + 3600000),
      });

      const credentials = {
        email: 'test@example.com',
        password: 'ValidPassword123!',
      };

      const concurrentLogins = Array(10)
        .fill(null)
        .map(() => authService.login(credentials));

      const results = await Promise.all(concurrentLogins);
      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.tokens).toBeDefined();
      });
    });
  });

  describe('Performance Tests', () => {
    it('should complete login within acceptable time limits', async () => {
      mockDbService.query.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      mockSessionService.createSession.mockResolvedValueOnce({
        sessionId: 'session-123',
        expiresAt: new Date(Date.now() + 3600000),
      });

      const credentials = {
        email: 'test@example.com',
        password: 'ValidPassword123!',
      };

      const startTime = Date.now();
      await authService.login(credentials);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // 1 second max
    });

    it('should handle high concurrency without performance degradation', async () => {
      const validToken = 'valid.jwt.token';
      const mockPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        roles: ['user'],
        sessionId: 'session-123',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      jest
        .spyOn(authService['jwtService'], 'verifyToken')
        .mockResolvedValue(mockPayload);
      mockSessionService.getSession.mockResolvedValue({
        userId: 'user-123',
        sessionId: 'session-123',
        email: 'test@example.com',
        roles: ['user'],
        lastActivity: new Date(),
        isValid: true,
      });

      const validations = Array(100)
        .fill(null)
        .map(() => authService.validateToken(validToken));

      const startTime = Date.now();
      const results = await Promise.all(validations);
      const endTime = Date.now();

      expect(results).toHaveLength(100);
      results.forEach((result) => expect(result.valid).toBe(true));
      expect(endTime - startTime).toBeLessThan(2000); // 2 seconds max for 100 validations
    });
  });

  describe('Memory Management', () => {
    it('should not cause memory leaks during repeated operations', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'ValidPassword123!',
      };

      mockDbService.query.mockResolvedValue({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      mockSessionService.createSession.mockResolvedValue({
        sessionId: 'session-123',
        expiresAt: new Date(Date.now() + 3600000),
      });

      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 100; i++) {
        await authService.login(credentials);
      }

      // Force garbage collection if available
      global.gc && global.gc();

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });
});
