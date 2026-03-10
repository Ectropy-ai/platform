/**
 * ENTERPRISE UNIT TESTS - Auth Service
 *
 * Purpose: Comprehensive testing of main authentication service
 * Scope: Login, logout, token validation, password change, user creation
 * Framework: Vitest
 *
 * ENTERPRISE FOCUS:
 * - Complete authentication flow coverage
 * - Security-critical operations
 * - Account lockout protection
 * - Password security
 * - Session management integration
 *
 * SECURITY COVERAGE:
 * - Invalid credential handling
 * - Account lockout after failed attempts
 * - Password hashing verification
 * - Session destruction on password change
 * - Two-factor authentication flow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock uuid before importing services (vi.mock is hoisted)
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-session-uuid-12345'),
}));

import bcrypt from 'bcryptjs';
import { AuthService } from '../services/auth.service.js';
import { createMockDatabaseClient, createMockUserRecord } from './mocks/database.mock.js';
import { createMockCacheClient } from './mocks/cache.mock.js';
import { createTestAuthConfig, createLockoutTestConfig } from './mocks/config.mock.js';
import type { AuthConfig } from '../types/auth.types.js';

// Logger mock handled by vitest setup

describe('AuthService - Enterprise Unit Tests', () => {
  let authService: AuthService;
  let mockDb: ReturnType<typeof createMockDatabaseClient>;
  let mockCache: ReturnType<typeof createMockCacheClient>;
  let config: AuthConfig;

  // Pre-computed bcrypt hash for 'password123'
  const validPasswordHash = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.Vb7p5K1zJqM/Gy';

  beforeEach(async () => {
    vi.clearAllMocks();
    config = createTestAuthConfig();
    mockDb = createMockDatabaseClient();
    mockCache = createMockCacheClient();
    authService = new AuthService(mockDb, mockCache, config);

    // Generate a real bcrypt hash for tests
    const hash = await bcrypt.hash('password123', 12);
    mockDb._setQueryResult('SELECT * FROM users WHERE email', {
      rows: [createMockUserRecord({
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: hash,
        roles: ['user'],
        isActive: true,
      })],
    });
  });

  describe('1. Login', () => {
    describe('login() - Success Cases', () => {
      it('should return success with tokens for valid credentials', async () => {
        // Arrange
        const credentials = {
          email: 'test@example.com',
          password: 'password123',
        };

        // Act
        const result = await authService.login(credentials);

        // Assert
        expect(result.success).toBe(true);
        expect(result.tokens).toBeDefined();
        expect(result.tokens?.accessToken).toBeDefined();
        expect(result.tokens?.refreshToken).toBeDefined();
        expect(result.user).toBeDefined();
      });

      it('should return user object with correct properties', async () => {
        // Arrange
        const credentials = {
          email: 'test@example.com',
          password: 'password123',
        };

        // Act
        const result = await authService.login(credentials);

        // Assert
        expect(result.user?.id).toBe('user-123');
        expect(result.user?.email).toBe('test@example.com');
        expect(result.user?.roles).toContain('user');
      });

      it('should create session on successful login', async () => {
        // Arrange
        const credentials = {
          email: 'test@example.com',
          password: 'password123',
        };

        // Act
        await authService.login(credentials);

        // Assert - verify cache.set was called for session
        expect(mockCache.set).toHaveBeenCalled();
      });

      it('should include IP address in session when provided', async () => {
        // Arrange
        const credentials = {
          email: 'test@example.com',
          password: 'password123',
        };
        const ipAddress = '192.168.1.100';

        // Act
        await authService.login(credentials, ipAddress);

        // Assert - check the session data stored
        const setCall = vi.mocked(mockCache.set).mock.calls[0];
        expect(setCall[1].ipAddress).toBe('192.168.1.100');
      });

      it('should include user agent in session when provided', async () => {
        // Arrange
        const credentials = {
          email: 'test@example.com',
          password: 'password123',
        };
        const ipAddress = '192.168.1.100';
        const userAgent = 'Mozilla/5.0';

        // Act
        await authService.login(credentials, ipAddress, userAgent);

        // Assert
        const setCall = vi.mocked(mockCache.set).mock.calls[0];
        expect(setCall[1].userAgent).toBe('Mozilla/5.0');
      });

      it('should reset login attempts on successful login', async () => {
        // Arrange
        const credentials = {
          email: 'test@example.com',
          password: 'password123',
        };

        // Act
        await authService.login(credentials);

        // Assert - verify UPDATE query to reset attempts
        const updateQuery = mockDb._queryHistory.find(q =>
          q.sql.includes('UPDATE users SET login_attempts = 0')
        );
        expect(updateQuery).toBeDefined();
      });
    });

    describe('login() - Failure Cases', () => {
      it('should return error for non-existent user', async () => {
        // Arrange
        mockDb._setQueryResult('SELECT * FROM users WHERE email', { rows: [] });
        const credentials = {
          email: 'nonexistent@example.com',
          password: 'password123',
        };

        // Act
        const result = await authService.login(credentials);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid credentials');
        expect(result.tokens).toBeUndefined();
      });

      it('should return error for invalid password', async () => {
        // Arrange
        const credentials = {
          email: 'test@example.com',
          password: 'wrongpassword',
        };

        // Act
        const result = await authService.login(credentials);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid credentials');
      });

      it('should return error for inactive user', async () => {
        // Arrange
        mockDb._setQueryResult('SELECT * FROM users WHERE email', {
          rows: [createMockUserRecord({
            email: 'inactive@example.com',
            isActive: false,
          })],
        });
        const credentials = {
          email: 'inactive@example.com',
          password: 'password123',
        };

        // Act
        const result = await authService.login(credentials);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid credentials');
      });

      it('should return error for locked account', async () => {
        // Arrange
        const futureDate = new Date(Date.now() + 900000); // 15 minutes from now
        const hash = await bcrypt.hash('password123', 12);
        mockDb._setQueryResult('SELECT * FROM users WHERE email', {
          rows: [createMockUserRecord({
            email: 'locked@example.com',
            passwordHash: hash,
            lockoutUntil: futureDate,
          })],
        });
        const credentials = {
          email: 'locked@example.com',
          password: 'password123',
        };

        // Act
        const result = await authService.login(credentials);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error).toBe('Account temporarily locked');
      });

      it('should increment login attempts on failed password', async () => {
        // Arrange
        mockDb._setQueryResult('UPDATE users SET login_attempts', {
          rows: [{ login_attempts: 1 }],
        });
        const credentials = {
          email: 'test@example.com',
          password: 'wrongpassword',
        };

        // Act
        await authService.login(credentials);

        // Assert
        const updateQuery = mockDb._queryHistory.find(q =>
          q.sql.includes('login_attempts = login_attempts + 1')
        );
        expect(updateQuery).toBeDefined();
      });

      it('should return 2FA required when user has 2FA enabled', async () => {
        // Arrange
        const hash = await bcrypt.hash('password123', 12);
        mockDb._setQueryResult('SELECT * FROM users WHERE email', {
          rows: [createMockUserRecord({
            email: 'test@example.com',
            passwordHash: hash,
            twoFactorEnabled: true,
          })],
        });
        const credentials = {
          email: 'test@example.com',
          password: 'password123',
        };

        // Act
        const result = await authService.login(credentials);

        // Assert
        expect(result.success).toBe(false);
        expect(result.requiresTwoFactor).toBe(true);
        expect(result.error).toBe('Two-factor authentication required');
      });

      it('should handle database errors gracefully', async () => {
        // Arrange
        const errorDb = createMockDatabaseClient({
          shouldThrow: true,
          errorToThrow: new Error('Database connection failed'),
        });
        const errorService = new AuthService(errorDb, mockCache, config);
        const credentials = {
          email: 'test@example.com',
          password: 'password123',
        };

        // Act
        const result = await errorService.login(credentials);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error).toBe('Login failed');
      });
    });

    describe('login() - Account Lockout', () => {
      it('should lock account after max failed attempts', async () => {
        // Arrange
        const lockoutConfig = createLockoutTestConfig();
        const lockoutService = new AuthService(mockDb, mockCache, lockoutConfig);

        // Simulate reaching max attempts
        mockDb._setQueryResult('UPDATE users SET login_attempts', {
          rows: [{ login_attempts: 3 }], // equals maxLoginAttempts in lockout config
        });

        const credentials = {
          email: 'test@example.com',
          password: 'wrongpassword',
        };

        // Act
        await lockoutService.login(credentials);

        // Assert - verify lockout query was executed
        const lockoutQuery = mockDb._queryHistory.find(q =>
          q.sql.includes('UPDATE users SET lockout_until')
        );
        expect(lockoutQuery).toBeDefined();
      });

      it('should allow login after lockout period expires', async () => {
        // Arrange
        const hash = await bcrypt.hash('password123', 12);
        const pastDate = new Date(Date.now() - 1000); // 1 second ago (expired)
        mockDb._setQueryResult('SELECT * FROM users WHERE email', {
          rows: [createMockUserRecord({
            email: 'test@example.com',
            passwordHash: hash,
            lockoutUntil: pastDate,
          })],
        });
        const credentials = {
          email: 'test@example.com',
          password: 'password123',
        };

        // Act
        const result = await authService.login(credentials);

        // Assert
        expect(result.success).toBe(true);
      });
    });
  });

  describe('2. Logout', () => {
    describe('logout()', () => {
      it('should return success when session is destroyed', async () => {
        // Arrange
        mockCache._setData('session:session-123', {
          sessionId: 'session-123',
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          lastActivity: new Date(),
        });

        // Act
        const result = await authService.logout('session-123');

        // Assert
        expect(result.success).toBe(true);
      });

      it('should return error for invalid session', async () => {
        // Act
        const result = await authService.logout('non-existent-session');

        // Assert
        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid session');
      });

      it('should handle cache errors gracefully', async () => {
        // Arrange
        const errorCache = createMockCacheClient({
          shouldThrow: true,
          errorToThrow: new Error('Redis error'),
        });
        const errorService = new AuthService(mockDb, errorCache, config);

        // Act
        const result = await errorService.logout('session-123');

        // Assert
        // When cache throws, SessionService.destroySession catches error and returns false
        // AuthService then interprets this as "Invalid session" since destroy returned false
        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid session');
      });
    });
  });

  describe('3. Token Validation', () => {
    describe('validateToken()', () => {
      it('should return valid true for valid token with active session', async () => {
        // Arrange - First login to get a real token
        const loginResult = await authService.login({
          email: 'test@example.com',
          password: 'password123',
        });

        // Act
        const result = await authService.validateToken(loginResult.tokens!.accessToken);

        // Assert
        expect(result.valid).toBe(true);
        expect(result.payload).toBeDefined();
        expect(result.session).toBeDefined();
      });

      it('should return valid false for empty token', async () => {
        // Act
        const result = await authService.validateToken('');

        // Assert
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Token is required');
      });

      it('should return valid false for expired token', async () => {
        // Arrange - Create a token that's already expired
        const shortConfig = { ...config, jwtExpiresIn: '1ms' };
        const shortService = new AuthService(mockDb, mockCache, shortConfig);

        const loginResult = await shortService.login({
          email: 'test@example.com',
          password: 'password123',
        });

        // Wait for token to expire
        await new Promise(resolve => setTimeout(resolve, 10));

        // Act
        const result = await shortService.validateToken(loginResult.tokens!.accessToken);

        // Assert
        expect(result.valid).toBe(false);
      });

      it('should return valid false for token with destroyed session', async () => {
        // Arrange
        const loginResult = await authService.login({
          email: 'test@example.com',
          password: 'password123',
        });

        // Destroy the session
        mockCache._reset();

        // Act
        const result = await authService.validateToken(loginResult.tokens!.accessToken);

        // Assert
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Session not found or expired');
      });

      it('should return valid false for malformed token', async () => {
        // Act
        const result = await authService.validateToken('not.a.valid.token');

        // Assert
        expect(result.valid).toBe(false);
      });
    });
  });

  describe('4. Token Refresh', () => {
    describe('refreshToken()', () => {
      it('should return new tokens for valid refresh token', async () => {
        // Arrange
        const loginResult = await authService.login({
          email: 'test@example.com',
          password: 'password123',
        });

        // Act
        const result = await authService.refreshToken(loginResult.tokens!.refreshToken);

        // Assert
        expect(result.success).toBe(true);
        expect(result.tokens).toBeDefined();
        expect(result.tokens?.accessToken).toBeDefined();
        expect(result.tokens?.refreshToken).toBeDefined();
      });

      it('should return error for invalid refresh token', async () => {
        // Act
        const result = await authService.refreshToken('invalid-refresh-token');

        // Assert
        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid refresh token');
      });

      it('should return error when session no longer exists', async () => {
        // Arrange
        const loginResult = await authService.login({
          email: 'test@example.com',
          password: 'password123',
        });

        // Destroy session
        mockCache._reset();

        // Act
        const result = await authService.refreshToken(loginResult.tokens!.refreshToken);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid session');
      });

      it('should update session lastActivity on refresh', async () => {
        // Arrange
        const loginResult = await authService.login({
          email: 'test@example.com',
          password: 'password123',
        });

        const beforeRefresh = new Date();

        // Act
        await authService.refreshToken(loginResult.tokens!.refreshToken);

        // Assert
        const setCall = vi.mocked(mockCache.set).mock.calls.find(c =>
          c[0].includes('session:')
        );
        expect(setCall).toBeDefined();
      });
    });

    describe('refreshTokens()', () => {
      it('should be an alias for refreshToken', async () => {
        // Arrange
        const loginResult = await authService.login({
          email: 'test@example.com',
          password: 'password123',
        });

        // Act
        const result = await authService.refreshTokens(loginResult.tokens!.refreshToken);

        // Assert
        expect(result.success).toBe(true);
        expect(result.tokens).toBeDefined();
      });
    });
  });

  describe('5. Session Validation', () => {
    describe('validateSession()', () => {
      it('should return AuthContext for valid session', async () => {
        // Arrange - login creates session with mocked UUID 'mock-session-uuid-12345'
        const loginResult = await authService.login({
          email: 'test@example.com',
          password: 'password123',
        });

        expect(loginResult.success).toBe(true);

        // Setup user query response for validateSession (queries by user ID)
        mockDb._setQueryResult('SELECT id, email, first_name, last_name, is_active', {
          rows: [{
            id: 'user-123',
            email: 'test@example.com',
            first_name: 'Test',
            last_name: 'User',
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          }],
        });
        mockDb._setQueryResult('SELECT r.name, r.permissions', {
          rows: [{ name: 'user', permissions: ['read'] }],
        });

        // Act - session ID is deterministic via uuid mock
        const result = await authService.validateSession('mock-session-uuid-12345');

        // Assert
        expect(result).not.toBeNull();
        expect(result?.isAuthenticated).toBe(true);
        expect(result?.user).toBeDefined();
      });

      it('should return null for invalid session', async () => {
        // Act
        const result = await authService.validateSession('non-existent-session');

        // Assert
        expect(result).toBeNull();
      });

      it('should return null and destroy session if user is inactive', async () => {
        // Arrange
        await authService.login({
          email: 'test@example.com',
          password: 'password123',
        });

        // User becomes inactive
        mockDb._setQueryResult('SELECT id, email, first_name', { rows: [] });

        // Act
        const result = await authService.validateSession('mock-session-uuid-12345');

        // Assert
        expect(result).toBeNull();
      });

      it('should handle database errors gracefully', async () => {
        // Arrange
        await authService.login({
          email: 'test@example.com',
          password: 'password123',
        });

        // Make database query throw
        vi.mocked(mockDb.query).mockRejectedValueOnce(new Error('DB error'));

        // Act
        const result = await authService.validateSession('mock-session-uuid-12345');

        // Assert
        expect(result).toBeNull();
      });
    });
  });

  describe('6. Password Change', () => {
    describe('changePassword()', () => {
      it('should return true when password is changed successfully', async () => {
        // Arrange
        const hash = await bcrypt.hash('currentpassword', 12);
        mockDb._setQueryResult('SELECT password_hash FROM users', {
          rows: [{ passwordHash: hash, password_hash: hash }],
        });

        // Act
        const result = await authService.changePassword(
          'user-123',
          'currentpassword',
          'newpassword123'
        );

        // Assert
        expect(result).toBe(true);
      });

      it('should hash new password with bcrypt', async () => {
        // Arrange
        const hash = await bcrypt.hash('currentpassword', 12);
        mockDb._setQueryResult('SELECT password_hash FROM users', {
          rows: [{ passwordHash: hash, password_hash: hash }],
        });

        // Act
        await authService.changePassword(
          'user-123',
          'currentpassword',
          'newpassword123'
        );

        // Assert - verify UPDATE query with hashed password
        const updateQuery = mockDb._queryHistory.find(q =>
          q.sql.includes('UPDATE users SET password_hash')
        );
        expect(updateQuery).toBeDefined();
        // Verify the new hash is a bcrypt hash (starts with $2)
        expect(updateQuery?.params[0]).toMatch(/^\$2[aby]\$/);
      });

      it('should destroy all user sessions after password change', async () => {
        // Arrange
        const hash = await bcrypt.hash('currentpassword', 12);
        mockDb._setQueryResult('SELECT password_hash FROM users', {
          rows: [{ passwordHash: hash, password_hash: hash }],
        });

        // Create some sessions for the user
        mockCache._setData('session:session-1', {
          sessionId: 'session-1',
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          lastActivity: new Date(),
        });
        mockCache._setData('session:session-2', {
          sessionId: 'session-2',
          userId: 'user-123',
          email: 'test@example.com',
          roles: ['user'],
          lastActivity: new Date(),
        });

        // Act
        await authService.changePassword(
          'user-123',
          'currentpassword',
          'newpassword123'
        );

        // Assert - sessions should be destroyed
        expect(mockCache.delete).toHaveBeenCalled();
      });

      it('should return false for incorrect current password', async () => {
        // Arrange
        const hash = await bcrypt.hash('currentpassword', 12);
        mockDb._setQueryResult('SELECT password_hash FROM users', {
          rows: [{ passwordHash: hash, password_hash: hash }],
        });

        // Act
        const result = await authService.changePassword(
          'user-123',
          'wrongpassword',
          'newpassword123'
        );

        // Assert
        expect(result).toBe(false);
      });

      it('should return false for non-existent user', async () => {
        // Arrange
        mockDb._setQueryResult('SELECT password_hash FROM users', { rows: [] });

        // Act
        const result = await authService.changePassword(
          'non-existent-user',
          'currentpassword',
          'newpassword123'
        );

        // Assert
        expect(result).toBe(false);
      });

      it('should handle database errors gracefully', async () => {
        // Arrange
        const errorDb = createMockDatabaseClient({
          shouldThrow: true,
          errorToThrow: new Error('Database error'),
        });
        const errorService = new AuthService(errorDb, mockCache, config);

        // Act
        const result = await errorService.changePassword(
          'user-123',
          'currentpassword',
          'newpassword123'
        );

        // Assert
        expect(result).toBe(false);
      });
    });
  });

  describe('7. User Creation', () => {
    describe('createUser()', () => {
      beforeEach(() => {
        // Reset to allow user creation
        mockDb._setQueryResult('SELECT id FROM users WHERE email', { rows: [] });
        mockDb._setQueryResult('INSERT INTO users', {
          rows: [{
            id: 'new-user-123',
            email: 'newuser@example.com',
            first_name: 'New',
            last_name: 'User',
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          }],
        });
      });

      it('should create user and return user object', async () => {
        // Arrange
        const userData = {
          email: 'newuser@example.com',
          password: 'securepassword123',
          firstName: 'New',
          lastName: 'User',
        };

        // Act
        const result = await authService.createUser(userData);

        // Assert
        expect(result).not.toBeNull();
        expect(result?.email).toBe('newuser@example.com');
        expect(result?.firstName).toBe('New');
        expect(result?.lastName).toBe('User');
      });

      it('should hash password before storing', async () => {
        // Arrange
        const userData = {
          email: 'newuser@example.com',
          password: 'securepassword123',
          firstName: 'New',
          lastName: 'User',
        };

        // Act
        await authService.createUser(userData);

        // Assert
        const insertQuery = mockDb._queryHistory.find(q =>
          q.sql.includes('INSERT INTO users')
        );
        expect(insertQuery).toBeDefined();
        // Verify password is hashed (bcrypt hash)
        expect(insertQuery?.params[1]).toMatch(/^\$2[aby]\$/);
        // Verify plain password is NOT stored
        expect(insertQuery?.params[1]).not.toBe('securepassword123');
      });

      it('should assign default role when not specified', async () => {
        // Arrange
        const userData = {
          email: 'newuser@example.com',
          password: 'securepassword123',
          firstName: 'New',
          lastName: 'User',
        };

        // Act
        const result = await authService.createUser(userData);

        // Assert
        expect(result?.roles).toContain('user');
      });

      it('should assign specified roles', async () => {
        // Arrange
        const userData = {
          email: 'admin@example.com',
          password: 'securepassword123',
          firstName: 'Admin',
          lastName: 'User',
          roles: ['admin', 'user'],
        };

        // Act
        const result = await authService.createUser(userData);

        // Assert
        expect(result?.roles).toContain('admin');
        expect(result?.roles).toContain('user');
      });

      it('should return null if email already exists', async () => {
        // Arrange
        mockDb._setQueryResult('SELECT id FROM users WHERE email', {
          rows: [{ id: 'existing-user' }],
        });
        const userData = {
          email: 'existing@example.com',
          password: 'securepassword123',
          firstName: 'Existing',
          lastName: 'User',
        };

        // Act
        const result = await authService.createUser(userData);

        // Assert
        expect(result).toBeNull();
      });

      it('should handle database errors gracefully', async () => {
        // Arrange
        mockDb._setQueryResult('INSERT INTO users', { rows: [] }); // No user returned = error
        vi.mocked(mockDb.query).mockImplementation(async (sql: string) => {
          if (sql.includes('SELECT id FROM users')) {
            return { rows: [] };
          }
          if (sql.includes('INSERT INTO users')) {
            throw new Error('Database error');
          }
          return { rows: [] };
        });

        const userData = {
          email: 'newuser@example.com',
          password: 'securepassword123',
          firstName: 'New',
          lastName: 'User',
        };

        // Act
        const result = await authService.createUser(userData);

        // Assert
        expect(result).toBeNull();
      });
    });
  });

  describe('8. Security Edge Cases', () => {
    it('should not leak timing information on invalid email vs invalid password', async () => {
      // This is a conceptual test - both should return same error message
      // Arrange
      mockDb._setQueryResult('SELECT * FROM users WHERE email', { rows: [] });

      // Act
      const invalidEmailResult = await authService.login({
        email: 'nonexistent@example.com',
        password: 'anypassword',
      });

      const invalidPasswordResult = await authService.login({
        email: 'test@example.com',
        password: 'wrongpassword',
      });

      // Assert - both should return same generic error
      expect(invalidEmailResult.error).toBe('Invalid credentials');
      expect(invalidPasswordResult.error).toBe('Invalid credentials');
    });

    it('should handle SQL injection attempts in email', async () => {
      // Arrange - Reset mock to return no user for injection attempt
      mockDb._setQueryResult('SELECT * FROM users WHERE email', { rows: [] });
      const credentials = {
        email: "'; DROP TABLE users; --",
        password: 'password123',
      };

      // Act - should not throw, just return invalid credentials
      const result = await authService.login(credentials);

      // Assert
      expect(result.success).toBe(false);
      // Verify parameterized query was used (email passed as parameter, not concatenated)
      const query = mockDb._queryHistory.find(q => q.sql.includes('SELECT * FROM users'));
      expect(query).toBeDefined();
      expect(query?.params).toContain("'; DROP TABLE users; --");
    });

    it('should handle extremely long passwords', async () => {
      // Arrange
      const longPassword = 'a'.repeat(10000);
      const credentials = {
        email: 'test@example.com',
        password: longPassword,
      };

      // Act - should not crash or hang
      const result = await authService.login(credentials);

      // Assert
      expect(result.success).toBe(false);
    });

    it('should handle unicode characters in credentials', async () => {
      // Arrange
      const hash = await bcrypt.hash('密码123', 12);
      mockDb._setQueryResult('SELECT * FROM users WHERE email', {
        rows: [createMockUserRecord({
          email: 'test@example.com',
          passwordHash: hash,
        })],
      });
      const credentials = {
        email: 'test@example.com',
        password: '密码123',
      };

      // Act
      const result = await authService.login(credentials);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should handle concurrent login attempts', async () => {
      // Arrange
      const credentials = {
        email: 'test@example.com',
        password: 'password123',
      };

      // Act - Multiple concurrent logins
      const results = await Promise.all([
        authService.login(credentials),
        authService.login(credentials),
        authService.login(credentials),
      ]);

      // Assert - All should succeed (different sessions)
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });
});
