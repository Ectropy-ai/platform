/**
 * ENTERPRISE UNIT TESTS - Session Service
 *
 * Purpose: Comprehensive testing of session management with Redis
 * Scope: Session creation, retrieval, destruction, expiration, statistics
 * Framework: Vitest
 *
 * ENTERPRISE FOCUS:
 * - Session lifecycle management
 * - Redis cache operations
 * - Session expiration and cleanup
 * - Multi-session handling
 * - Security: session isolation and destruction
 *
 * SECURITY COVERAGE:
 * - Session isolation per user
 * - Proper session cleanup on logout
 * - Session timeout enforcement
 * - Concurrent session handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock uuid before importing SessionService (must be before import due to hoisting)
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-session-uuid-12345'),
}));

import { SessionService } from '../services/session.service.js';
import { createMockCacheClient, createMockSessionData } from './mocks/cache.mock.js';
import { createTestAuthConfig, createShortTokenConfig } from './mocks/config.mock.js';
import type { AuthConfig, SessionData } from '../types/auth.types.js';

// Logger mock handled by vitest setup

describe('SessionService - Enterprise Unit Tests', () => {
  let sessionService: SessionService;
  let mockCache: ReturnType<typeof createMockCacheClient>;
  let config: AuthConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createTestAuthConfig();
    mockCache = createMockCacheClient();
    sessionService = new SessionService(mockCache, config);
  });

  describe('1. Session Creation', () => {
    describe('createSession()', () => {
      it('should create a new session and return session ID', async () => {
        // Arrange
        const userId = 'user-123';
        const email = 'test@example.com';
        const roles = ['user'];

        // Act
        const sessionId = await sessionService.createSession(userId, email, roles);

        // Assert
        expect(sessionId).toBe('mock-session-uuid-12345');
      });

      it('should store session data in cache', async () => {
        // Arrange
        const userId = 'user-123';
        const email = 'test@example.com';
        const roles = ['user', 'admin'];

        // Act
        await sessionService.createSession(userId, email, roles);

        // Assert
        expect(mockCache.set).toHaveBeenCalledTimes(1);
        const setCall = vi.mocked(mockCache.set).mock.calls[0];
        expect(setCall[0]).toBe('session:mock-session-uuid-12345');

        const storedData = setCall[1] as SessionData;
        expect(storedData.userId).toBe('user-123');
        expect(storedData.email).toBe('test@example.com');
        expect(storedData.roles).toEqual(['user', 'admin']);
        expect(storedData.sessionId).toBe('mock-session-uuid-12345');
      });

      it('should set correct TTL from config', async () => {
        // Arrange
        const userId = 'user-123';
        const email = 'test@example.com';
        const roles = ['user'];

        // Act
        await sessionService.createSession(userId, email, roles);

        // Assert
        const setCall = vi.mocked(mockCache.set).mock.calls[0];
        expect(setCall[2]).toBe(config.sessionTimeout); // TTL should match config
      });

      it('should include IP address when provided', async () => {
        // Arrange
        const userId = 'user-123';
        const email = 'test@example.com';
        const roles = ['user'];
        const ipAddress = '192.168.1.100';

        // Act
        await sessionService.createSession(userId, email, roles, ipAddress);

        // Assert
        const setCall = vi.mocked(mockCache.set).mock.calls[0];
        const storedData = setCall[1] as SessionData;
        expect(storedData.ipAddress).toBe('192.168.1.100');
      });

      it('should include user agent when provided', async () => {
        // Arrange
        const userId = 'user-123';
        const email = 'test@example.com';
        const roles = ['user'];
        const ipAddress = '192.168.1.100';
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

        // Act
        await sessionService.createSession(userId, email, roles, ipAddress, userAgent);

        // Assert
        const setCall = vi.mocked(mockCache.set).mock.calls[0];
        const storedData = setCall[1] as SessionData;
        expect(storedData.userAgent).toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
      });

      it('should not include optional fields when not provided', async () => {
        // Arrange
        const userId = 'user-123';
        const email = 'test@example.com';
        const roles = ['user'];

        // Act
        await sessionService.createSession(userId, email, roles);

        // Assert
        const setCall = vi.mocked(mockCache.set).mock.calls[0];
        const storedData = setCall[1] as SessionData;
        expect(storedData.ipAddress).toBeUndefined();
        expect(storedData.userAgent).toBeUndefined();
      });

      it('should set lastActivity to current time', async () => {
        // Arrange
        const userId = 'user-123';
        const email = 'test@example.com';
        const roles = ['user'];
        const before = new Date();

        // Act
        await sessionService.createSession(userId, email, roles);
        const after = new Date();

        // Assert
        const setCall = vi.mocked(mockCache.set).mock.calls[0];
        const storedData = setCall[1] as SessionData;
        expect(storedData.lastActivity.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(storedData.lastActivity.getTime()).toBeLessThanOrEqual(after.getTime());
      });

      it('should throw error when cache fails', async () => {
        // Arrange
        const errorCache = createMockCacheClient({
          shouldThrow: true,
          errorToThrow: new Error('Redis connection failed')
        });
        const errorService = new SessionService(errorCache, config);

        // Act & Assert
        await expect(errorService.createSession('user-123', 'test@example.com', ['user']))
          .rejects.toThrow('Redis connection failed');
      });

      it('should handle empty roles array', async () => {
        // Arrange
        const userId = 'user-123';
        const email = 'test@example.com';
        const roles: string[] = [];

        // Act
        await sessionService.createSession(userId, email, roles);

        // Assert
        const setCall = vi.mocked(mockCache.set).mock.calls[0];
        const storedData = setCall[1] as SessionData;
        expect(storedData.roles).toEqual([]);
      });
    });
  });

  describe('2. Session Retrieval', () => {
    describe('getSession()', () => {
      it('should retrieve existing session', async () => {
        // Arrange
        const sessionData = createMockSessionData({
          sessionId: 'session-123',
          userId: 'user-456',
          email: 'test@example.com',
          roles: ['admin'],
        });
        mockCache._setData('session:session-123', sessionData);

        // Act
        const result = await sessionService.getSession('session-123');

        // Assert
        expect(result).not.toBeNull();
        expect(result?.userId).toBe('user-456');
        expect(result?.email).toBe('test@example.com');
        expect(result?.roles).toEqual(['admin']);
      });

      it('should return null for non-existent session', async () => {
        // Act
        const result = await sessionService.getSession('non-existent-session');

        // Assert
        expect(result).toBeNull();
      });

      it('should update lastActivity on retrieval', async () => {
        // Arrange
        const oldDate = new Date('2024-01-01');
        const sessionData = createMockSessionData({
          sessionId: 'session-123',
          lastActivity: oldDate,
        });
        mockCache._setData('session:session-123', sessionData);

        // Act
        const result = await sessionService.getSession('session-123');

        // Assert
        expect(result?.lastActivity.getTime()).toBeGreaterThan(oldDate.getTime());
      });

      it('should refresh session TTL on retrieval', async () => {
        // Arrange
        const sessionData = createMockSessionData({ sessionId: 'session-123' });
        mockCache._setData('session:session-123', sessionData);

        // Act
        await sessionService.getSession('session-123');

        // Assert - set should be called to update session with new TTL
        expect(mockCache.set).toHaveBeenCalledWith(
          'session:session-123',
          expect.any(Object),
          config.sessionTimeout
        );
      });

      it('should handle cache errors gracefully', async () => {
        // Arrange
        const errorCache = createMockCacheClient({
          shouldThrow: true,
          errorToThrow: new Error('Redis error')
        });
        const errorService = new SessionService(errorCache, config);

        // Act
        const result = await errorService.getSession('session-123');

        // Assert - should return null on error, not throw
        expect(result).toBeNull();
      });
    });
  });

  describe('3. Session Updates', () => {
    describe('updateSession()', () => {
      it('should update session with partial data', async () => {
        // Arrange
        const sessionData = createMockSessionData({
          sessionId: 'session-123',
          userId: 'user-456',
          roles: ['user'],
        });
        mockCache._setData('session:session-123', sessionData);

        // Act
        const result = await sessionService.updateSession('session-123', {
          roles: ['user', 'admin'],
        });

        // Assert
        expect(result).toBe(true);
      });

      it('should return false for non-existent session', async () => {
        // Act
        const result = await sessionService.updateSession('non-existent', {
          roles: ['admin'],
        });

        // Assert
        expect(result).toBe(false);
      });

      it('should preserve existing data when updating', async () => {
        // Arrange
        const sessionData = createMockSessionData({
          sessionId: 'session-123',
          userId: 'user-456',
          email: 'original@example.com',
          roles: ['user'],
        });
        mockCache._setData('session:session-123', sessionData);

        // Act
        await sessionService.updateSession('session-123', {
          roles: ['admin'],
        });

        // Assert - verify the updated data preserves email
        const setCall = vi.mocked(mockCache.set).mock.calls.find(
          call => call[0] === 'session:session-123' && (call[1] as SessionData).roles?.includes('admin')
        );
        expect(setCall).toBeDefined();
        expect((setCall![1] as SessionData).email).toBe('original@example.com');
      });

      it('should update lastActivity on every update', async () => {
        // Arrange
        const oldDate = new Date('2024-01-01');
        const sessionData = createMockSessionData({
          sessionId: 'session-123',
          lastActivity: oldDate,
        });
        mockCache._setData('session:session-123', sessionData);

        // Act
        await sessionService.updateSession('session-123', {});

        // Assert
        const setCall = vi.mocked(mockCache.set).mock.calls.find(
          call => call[0] === 'session:session-123'
        );
        expect((setCall![1] as SessionData).lastActivity.getTime()).toBeGreaterThan(oldDate.getTime());
      });

      it('should handle errors gracefully', async () => {
        // Arrange
        const sessionData = createMockSessionData({ sessionId: 'session-123' });
        mockCache._setData('session:session-123', sessionData);

        // Make set throw on the second call (after initial get)
        let callCount = 0;
        vi.mocked(mockCache.set).mockImplementation(async () => {
          callCount++;
          if (callCount > 1) {
            throw new Error('Cache write failed');
          }
        });

        // Act
        const result = await sessionService.updateSession('session-123', { roles: ['admin'] });

        // Assert
        expect(result).toBe(false);
      });
    });
  });

  describe('4. Session Destruction', () => {
    describe('destroySession()', () => {
      it('should destroy existing session', async () => {
        // Arrange
        const sessionData = createMockSessionData({ sessionId: 'session-123' });
        mockCache._setData('session:session-123', sessionData);

        // Act
        const result = await sessionService.destroySession('session-123');

        // Assert
        expect(result).toBe(true);
        expect(mockCache.delete).toHaveBeenCalledWith('session:session-123');
      });

      it('should return false for non-existent session', async () => {
        // Act
        const result = await sessionService.destroySession('non-existent');

        // Assert
        expect(result).toBe(false);
      });

      it('should handle cache errors gracefully', async () => {
        // Arrange
        const errorCache = createMockCacheClient({
          shouldThrow: true,
          errorToThrow: new Error('Redis error')
        });
        const errorService = new SessionService(errorCache, config);

        // Act
        const result = await errorService.destroySession('session-123');

        // Assert
        expect(result).toBe(false);
      });
    });

    describe('destroyAllUserSessions()', () => {
      it('should destroy all sessions for a user', async () => {
        // Arrange
        const user1Session1 = createMockSessionData({ sessionId: 'session-1', userId: 'user-123' });
        const user1Session2 = createMockSessionData({ sessionId: 'session-2', userId: 'user-123' });
        const user2Session = createMockSessionData({ sessionId: 'session-3', userId: 'user-456' });

        mockCache._setData('session:session-1', user1Session1);
        mockCache._setData('session:session-2', user1Session2);
        mockCache._setData('session:session-3', user2Session);

        // Act
        const destroyedCount = await sessionService.destroyAllUserSessions('user-123');

        // Assert
        expect(destroyedCount).toBe(2);
      });

      it('should not destroy sessions for other users', async () => {
        // Arrange
        const user1Session = createMockSessionData({ sessionId: 'session-1', userId: 'user-123' });
        const user2Session = createMockSessionData({ sessionId: 'session-2', userId: 'user-456' });

        mockCache._setData('session:session-1', user1Session);
        mockCache._setData('session:session-2', user2Session);

        // Act
        await sessionService.destroyAllUserSessions('user-123');

        // Assert - user2's session should still exist
        const user2Data = mockCache._getData('session:session-2');
        expect(user2Data).toBeDefined();
        expect(user2Data.userId).toBe('user-456');
      });

      it('should return 0 when user has no sessions', async () => {
        // Act
        const destroyedCount = await sessionService.destroyAllUserSessions('user-with-no-sessions');

        // Assert
        expect(destroyedCount).toBe(0);
      });

      it('should handle cache errors gracefully', async () => {
        // Arrange
        const errorCache = createMockCacheClient({
          shouldThrow: true,
          errorToThrow: new Error('Redis error')
        });
        const errorService = new SessionService(errorCache, config);

        // Act
        const destroyedCount = await errorService.destroyAllUserSessions('user-123');

        // Assert
        expect(destroyedCount).toBe(0);
      });
    });
  });

  describe('5. Session Validation', () => {
    describe('isSessionValid()', () => {
      it('should return true for valid session', async () => {
        // Arrange
        const sessionData = createMockSessionData({ sessionId: 'session-123' });
        mockCache._setData('session:session-123', sessionData);

        // Act
        const isValid = await sessionService.isSessionValid('session-123');

        // Assert
        expect(isValid).toBe(true);
      });

      it('should return false for non-existent session', async () => {
        // Act
        const isValid = await sessionService.isSessionValid('non-existent');

        // Assert
        expect(isValid).toBe(false);
      });

      it('should return false on cache error', async () => {
        // Arrange
        const errorCache = createMockCacheClient({
          shouldThrow: true,
          errorToThrow: new Error('Redis error')
        });
        const errorService = new SessionService(errorCache, config);

        // Act
        const isValid = await errorService.isSessionValid('session-123');

        // Assert
        expect(isValid).toBe(false);
      });
    });
  });

  describe('6. Active Sessions', () => {
    describe('getActiveSessions()', () => {
      it('should return all active sessions for a user', async () => {
        // Arrange
        const session1 = createMockSessionData({
          sessionId: 'session-1',
          userId: 'user-123',
          ipAddress: '192.168.1.1'
        });
        const session2 = createMockSessionData({
          sessionId: 'session-2',
          userId: 'user-123',
          ipAddress: '192.168.1.2'
        });

        mockCache._setData('session:session-1', session1);
        mockCache._setData('session:session-2', session2);

        // Act
        const sessions = await sessionService.getActiveSessions('user-123');

        // Assert
        expect(sessions).toHaveLength(2);
        expect(sessions.map(s => s.ipAddress)).toContain('192.168.1.1');
        expect(sessions.map(s => s.ipAddress)).toContain('192.168.1.2');
      });

      it('should return empty array for user with no sessions', async () => {
        // Act
        const sessions = await sessionService.getActiveSessions('user-with-no-sessions');

        // Assert
        expect(sessions).toEqual([]);
      });

      it('should not include sessions from other users', async () => {
        // Arrange
        const user1Session = createMockSessionData({ sessionId: 'session-1', userId: 'user-123' });
        const user2Session = createMockSessionData({ sessionId: 'session-2', userId: 'user-456' });

        mockCache._setData('session:session-1', user1Session);
        mockCache._setData('session:session-2', user2Session);

        // Act
        const sessions = await sessionService.getActiveSessions('user-123');

        // Assert
        expect(sessions).toHaveLength(1);
        expect(sessions[0].userId).toBe('user-123');
      });

      it('should handle cache errors gracefully', async () => {
        // Arrange
        const errorCache = createMockCacheClient({
          shouldThrow: true,
          errorToThrow: new Error('Redis error')
        });
        const errorService = new SessionService(errorCache, config);

        // Act
        const sessions = await errorService.getActiveSessions('user-123');

        // Assert
        expect(sessions).toEqual([]);
      });
    });
  });

  describe('7. Session Cleanup', () => {
    describe('cleanupExpiredSessions()', () => {
      it('should clean up expired sessions', async () => {
        // Arrange - Create session with old lastActivity
        const shortConfig = createTestAuthConfig({ sessionTimeout: 1 }); // 1 second timeout
        const shortService = new SessionService(mockCache, shortConfig);

        const expiredSession = createMockSessionData({
          sessionId: 'expired-session',
          userId: 'user-123',
          lastActivity: new Date(Date.now() - 5000), // 5 seconds ago
        });
        mockCache._setData('session:expired-session', expiredSession);

        // Act
        const cleanedCount = await shortService.cleanupExpiredSessions();

        // Assert
        expect(cleanedCount).toBe(1);
      });

      it('should not clean up active sessions', async () => {
        // Arrange
        const activeSession = createMockSessionData({
          sessionId: 'active-session',
          userId: 'user-123',
          lastActivity: new Date(), // Just now
        });
        mockCache._setData('session:active-session', activeSession);

        // Act
        const cleanedCount = await sessionService.cleanupExpiredSessions();

        // Assert
        expect(cleanedCount).toBe(0);
      });

      it('should handle mixed active and expired sessions', async () => {
        // Arrange
        const shortConfig = createTestAuthConfig({ sessionTimeout: 1 });
        const shortService = new SessionService(mockCache, shortConfig);

        const expiredSession = createMockSessionData({
          sessionId: 'expired',
          userId: 'user-123',
          lastActivity: new Date(Date.now() - 5000),
        });
        const activeSession = createMockSessionData({
          sessionId: 'active',
          userId: 'user-456',
          lastActivity: new Date(),
        });

        mockCache._setData('session:expired', expiredSession);
        mockCache._setData('session:active', activeSession);

        // Act
        const cleanedCount = await shortService.cleanupExpiredSessions();

        // Assert
        expect(cleanedCount).toBe(1);
        expect(mockCache._getData('session:active')).toBeDefined();
      });

      it('should return 0 when no sessions exist', async () => {
        // Act
        const cleanedCount = await sessionService.cleanupExpiredSessions();

        // Assert
        expect(cleanedCount).toBe(0);
      });

      it('should handle cache errors gracefully', async () => {
        // Arrange
        const errorCache = createMockCacheClient({
          shouldThrow: true,
          errorToThrow: new Error('Redis error')
        });
        const errorService = new SessionService(errorCache, config);

        // Act
        const cleanedCount = await errorService.cleanupExpiredSessions();

        // Assert
        expect(cleanedCount).toBe(0);
      });
    });
  });

  describe('8. Session Statistics', () => {
    describe('getSessionStats()', () => {
      it('should return correct total session count', async () => {
        // Arrange
        mockCache._setData('session:session-1', createMockSessionData({ sessionId: 'session-1', userId: 'user-1' }));
        mockCache._setData('session:session-2', createMockSessionData({ sessionId: 'session-2', userId: 'user-2' }));
        mockCache._setData('session:session-3', createMockSessionData({ sessionId: 'session-3', userId: 'user-1' }));

        // Act
        const stats = await sessionService.getSessionStats();

        // Assert
        expect(stats.totalSessions).toBe(3);
      });

      it('should return correct unique user count', async () => {
        // Arrange
        mockCache._setData('session:session-1', createMockSessionData({ sessionId: 'session-1', userId: 'user-1' }));
        mockCache._setData('session:session-2', createMockSessionData({ sessionId: 'session-2', userId: 'user-2' }));
        mockCache._setData('session:session-3', createMockSessionData({ sessionId: 'session-3', userId: 'user-1' }));

        // Act
        const stats = await sessionService.getSessionStats();

        // Assert
        expect(stats.uniqueUsers).toBe(2);
      });

      it('should return correct active session count', async () => {
        // Arrange
        const shortConfig = createTestAuthConfig({ sessionTimeout: 1 });
        const shortService = new SessionService(mockCache, shortConfig);

        // One active, one expired
        mockCache._setData('session:active', createMockSessionData({
          sessionId: 'active',
          userId: 'user-1',
          lastActivity: new Date(),
        }));
        mockCache._setData('session:expired', createMockSessionData({
          sessionId: 'expired',
          userId: 'user-2',
          lastActivity: new Date(Date.now() - 5000),
        }));

        // Act
        const stats = await shortService.getSessionStats();

        // Assert
        expect(stats.activeSessions).toBe(1);
        expect(stats.totalSessions).toBe(2);
      });

      it('should return zeros when no sessions exist', async () => {
        // Act
        const stats = await sessionService.getSessionStats();

        // Assert
        expect(stats.totalSessions).toBe(0);
        expect(stats.activeSessions).toBe(0);
        expect(stats.uniqueUsers).toBe(0);
      });

      it('should handle cache errors gracefully', async () => {
        // Arrange
        const errorCache = createMockCacheClient({
          shouldThrow: true,
          errorToThrow: new Error('Redis error')
        });
        const errorService = new SessionService(errorCache, config);

        // Act
        const stats = await errorService.getSessionStats();

        // Assert
        expect(stats.totalSessions).toBe(0);
        expect(stats.activeSessions).toBe(0);
        expect(stats.uniqueUsers).toBe(0);
      });
    });
  });

  describe('9. Security Edge Cases', () => {
    it('should isolate sessions with similar IDs', async () => {
      // Arrange
      const session1 = createMockSessionData({ sessionId: 'session-123', userId: 'user-1' });
      const session2 = createMockSessionData({ sessionId: 'session-1234', userId: 'user-2' });

      mockCache._setData('session:session-123', session1);
      mockCache._setData('session:session-1234', session2);

      // Act
      const result = await sessionService.getSession('session-123');

      // Assert
      expect(result?.userId).toBe('user-1');
    });

    it('should handle session ID with special characters', async () => {
      // Arrange
      const sessionData = createMockSessionData({
        sessionId: 'session-with-special!@#$%',
        userId: 'user-123',
      });
      mockCache._setData('session:session-with-special!@#$%', sessionData);

      // Act
      const result = await sessionService.getSession('session-with-special!@#$%');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.userId).toBe('user-123');
    });

    it('should handle very long session IDs', async () => {
      // Arrange
      const longSessionId = 'session-' + 'a'.repeat(1000);
      const sessionData = createMockSessionData({
        sessionId: longSessionId,
        userId: 'user-123',
      });
      mockCache._setData(`session:${longSessionId}`, sessionData);

      // Act
      const result = await sessionService.getSession(longSessionId);

      // Assert
      expect(result).not.toBeNull();
    });

    it('should handle concurrent session operations', async () => {
      // Arrange
      const sessionData = createMockSessionData({ sessionId: 'concurrent-session', userId: 'user-123' });
      mockCache._setData('session:concurrent-session', sessionData);

      // Act - Simulate concurrent operations
      const operations = [
        sessionService.getSession('concurrent-session'),
        sessionService.updateSession('concurrent-session', { roles: ['admin'] }),
        sessionService.isSessionValid('concurrent-session'),
      ];
      const results = await Promise.all(operations);

      // Assert - All operations should complete without error
      expect(results[0]).not.toBeNull();
      expect(typeof results[1]).toBe('boolean');
      expect(typeof results[2]).toBe('boolean');
    });
  });
});
