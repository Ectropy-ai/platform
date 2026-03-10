/**
 * Integration Tests for Authentication System
 */

import { AuthService } from '../../../libs/auth/src/services/auth.service';
import { JWTService } from '../../../libs/auth/src/services/jwt.service';
import { SessionService } from '../../../libs/auth/src/services/session.service';
import { DatabaseService, CacheService } from '../../../libs/database/src';
import { AuthConfig } from '../../../libs/auth/src/types/auth.types';
import { vi } from 'vitest';
describe('Authentication Integration Tests', () => {
  let authService: AuthService;
  let databaseService: DatabaseService;
  let cacheService: CacheService;
  let sessionService: SessionService;
  let jwtService: JWTService;
  const testConfig: AuthConfig = {
    jwtSecret: 'test-secret-key-for-testing-only',
    jwtExpiresIn: '15m',
    refreshTokenExpiresIn: '7d',
    sessionTimeout: 3600, // 1 hour
    maxLoginAttempts: 3,
    lockoutDuration: 900, // 15 minutes
  };
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'User',
    roles: ['user'],
  };

  beforeAll(async () => {
    // Mock database service
    databaseService = {
      query: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      transaction: vi.fn(),
      getMetrics: vi.fn(),
      isHealthy: vi.fn(),
      healthCheck: vi.fn(),
    } as any;
    // Mock cache service
    cacheService = {
      set: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      keys: vi.fn(),
    sessionService = new SessionService(cacheService, testConfig);
    authService = new AuthService(databaseService, sessionService, testConfig);
    jwtService = new JWTService(testConfig);
  });
  describe('User Login Flow', () => {
    it('should successfully login with valid credentials', async () => {
      // Mock database responses
      const mockUserAuth = {
        id: mockUser.id,
        email: mockUser.email,
        passwordHash:
          '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewU5QH7Dv.V7h5m6', // hash of 'TestPassword123!'
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
        roles: mockUser.roles,
        isActive: true,
        loginAttempts: 0,
        lockoutUntil: null,
        twoFactorEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (databaseService.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ rows: [mockUserAuth] }) // User lookup
        .mockResolvedValueOnce({ rows: [] }); // Update login attempts
      (cacheService.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const result = await authService.login({
        password: mockUser.password,
      });
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.tokens).toBeDefined();
      expect(result.user?.email).toBe(mockUser.email);
      expect(result.tokens?.accessToken).toBeDefined();
      expect(result.tokens?.refreshToken).toBeDefined();
    });
    it('should fail login with invalid credentials', async () => {
      (databaseService.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] }); // User not found
        email: 'nonexistent@example.com',
        password: 'wrongpassword',
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
      expect(result.user).toBeUndefined();
      expect(result.tokens).toBeUndefined();
    it('should handle account lockout after failed attempts', async () => {
      const lockedUser = {
        ...mockUser,
        loginAttempts: 3,
        lockoutUntil: new Date(Date.now() + 900000), // 15 minutes from now
      (databaseService.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [lockedUser],
      expect(result.error).toBe('Account temporarily locked');
      expect(result.lockoutUntil).toBeDefined();
  describe('JWT Token Management', () => {
    it('should generate valid JWT tokens', () => {
      const payload = {
        userId: mockUser.id,
        sessionId: 'test-session-id',
      const tokenPair = jwtService.generateTokenPair(payload);
      expect(tokenPair.accessToken).toBeDefined();
      expect(tokenPair.refreshToken).toBeDefined();
      expect(tokenPair.expiresIn).toBeGreaterThan(0);
    it('should verify valid access tokens', () => {
      const accessToken = jwtService.generateAccessToken(payload);
      const verified = jwtService.verifyAccessToken(accessToken);
      expect(verified.userId).toBe(mockUser.id);
      expect(verified.email).toBe(mockUser.email);
      expect(verified.roles).toEqual(mockUser.roles);
      expect(verified.sessionId).toBe('test-session-id');
    it('should reject invalid tokens', () => {
      const invalidToken = 'invalid.jwt.token';
      expect(() => {
        jwtService.verifyAccessToken(invalidToken);
      }).toThrow();
    it('should handle token expiration', () => {
      // Create a token with very short expiration
      const shortConfig: AuthConfig = {
        ...testConfig,
        jwtExpiresIn: '1ms',
      const shortJwtService = new JWTService(shortConfig);
      const token = shortJwtService.generateAccessToken(payload);
      // Wait for expiration
      setTimeout(() => {
        expect(() => {
          shortJwtService.verifyAccessToken(token);
        }).toThrow('TOKEN_EXPIRED');
      }, 10);
  describe('Session Management', () => {
    it('should create and retrieve sessions', async () => {
      const sessionId = 'test-session-id';
      const sessionData = {
        lastActivity: new Date(),
      (cacheService.get as ReturnType<typeof vi.fn>).mockResolvedValue(sessionData);
      const createdSessionId = await sessionService.createSession(
        mockUser.id,
        mockUser.email,
        mockUser.roles
      );
      expect(createdSessionId).toBeDefined();
      expect(typeof createdSessionId).toBe('string');
      const retrievedSession =
        await sessionService.getSession(createdSessionId);
      expect(retrievedSession).toBeDefined();
      expect(retrievedSession?.userId).toBe(mockUser.id);
    it('should destroy sessions', async () => {
      (cacheService.delete as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      const destroyed = await sessionService.destroySession(sessionId);
      expect(destroyed).toBe(true);
      expect(cacheService.delete).toHaveBeenCalledWith(`session:${sessionId}`);
    it('should validate session existence', async () => {
      const isValid = await sessionService.isSessionValid(sessionId);
      expect(isValid).toBe(true);
    it('should return false for invalid sessions', async () => {
      const sessionId = 'invalid-session-id';
      (cacheService.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      expect(isValid).toBe(false);
  describe('Token Refresh Flow', () => {
    it('should refresh valid tokens', async () => {
      const refreshToken = jwtService.generateRefreshToken(
        sessionId
      const newTokens = await authService.refreshTokens(refreshToken);
      expect(newTokens).toBeDefined();
      expect(newTokens?.accessToken).toBeDefined();
      expect(newTokens?.refreshToken).toBeDefined();
    it('should reject refresh with invalid session', async () => {
      expect(newTokens).toBeNull();
  describe('User Registration', () => {
    it('should create new user with valid data', async () => {
      const newUserData = {
        email: 'newuser@example.com',
        password: 'NewPassword123!',
        firstName: 'New',
        lastName: 'User',
        roles: ['user'],
        .mockResolvedValueOnce({ rows: [] }) // No existing user
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'new-user-id',
              email: newUserData.email,
              first_name: newUserData.firstName,
              last_name: newUserData.lastName,
              is_active: true,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        });
      const createdUser = await authService.createUser(newUserData);
      expect(createdUser).toBeDefined();
      expect(createdUser?.email).toBe(newUserData.email);
      expect(createdUser?.firstName).toBe(newUserData.firstName);
      expect(createdUser?.roles).toEqual(newUserData.roles);
    it('should reject duplicate email registration', async () => {
      const existingUserData = {
        password: 'Password123!',
        firstName: 'Duplicate',
        rows: [{ id: 'existing-id' }],
      }); // Existing user found
      const createdUser = await authService.createUser(existingUserData);
      expect(createdUser).toBeNull();
  describe('Password Management', () => {
    it('should change password with valid current password', async () => {
      const userId = mockUser.id;
      const currentPassword = mockUser.password;
      const newPassword = 'NewPassword456!';
      const userWithHash = {
          '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewU5QH7Dv.V7h5m6',
        .mockResolvedValueOnce({ rows: [userWithHash] }) // Get current hash
        .mockResolvedValueOnce({ rows: [] }); // Update password
      (cacheService.keys as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const changed = await authService.changePassword(
        userId,
        currentPassword,
        newPassword
      expect(changed).toBe(true);
    it('should reject password change with invalid current password', async () => {
      const wrongCurrentPassword = 'WrongPassword123!';
        rows: [userWithHash],
        wrongCurrentPassword,
      expect(changed).toBe(false);
});
