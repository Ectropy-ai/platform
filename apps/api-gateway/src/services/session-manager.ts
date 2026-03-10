/**
 * Enterprise Session Manager with Redis Integration
 * Provides robust session management for the Ectropy Platform
 * CRITICAL FIX: Now uses centralized Redis factory with proper password decoding
 */

import { Redis } from 'ioredis';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { createRedisClient } from '../config/redis.config.js';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

export interface SessionData {
  userId: string;
  email: string;
  role: 'owner' | 'architect' | 'contractor' | 'engineer';
  projectIds: string[];
  permissions: string[];
  createdAt: number;
  lastActivity: number;
  ipAddress: string;
  userAgent: string;
}

export interface SessionConfig {
  redisUrl?: string;
  sessionTTL?: number; // Time to live in seconds
  cleanupInterval?: number;
  maxSessionsPerUser?: number;
}

export class SessionManager extends EventEmitter {
  private redis: Redis;
  private config: Required<SessionConfig>;
  private cleanupTimer?: NodeJS.Timeout;
  private isShutdown = false;

  constructor(config: SessionConfig = {}) {
    super();

    this.config = {
      redisUrl:
        config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      sessionTTL: config.sessionTTL || 24 * 60 * 60, // 24 hours default
      cleanupInterval: config.cleanupInterval || 60 * 60 * 1000, // 1 hour
      maxSessionsPerUser: config.maxSessionsPerUser || 5,
    };

    // CRITICAL FIX (2026-01-08): Remove keyPrefix to prevent double-prefix bug
    // Previous: keyPrefix: 'session:' + getSessionKey('abc') → 'session:session:abc'
    // Now: getSessionKey('abc') → 'session:abc' (single prefix, matches test expectations)
    // Test mock doesn't implement keyPrefix, so production code must handle prefixes manually
    this.redis = createRedisClient(this.config.redisUrl, {
      db: 4, // Use DB 4 for session manager (separate from other Redis uses)
    });

    this.setupRedisEventHandlers();
    this.startCleanupTimer();
  }

  private setupRedisEventHandlers(): void {
    this.redis.on('connect', () => {
      logger.info('✅ SessionManager: Connected to Redis');
      this.emit('connected');
    });

    this.redis.on('error', (error) => {
      logger.error('❌ SessionManager: Redis error:', error);
      this.emit('error', error);
    });

    this.redis.on('close', () => {
      logger.info('🔌 SessionManager: Redis connection closed');
      this.emit('disconnected');
    });
  }

  /**
   * Create a new session
   */
  public async createSession(
    userId: string,
    userData: Omit<SessionData, 'userId' | 'createdAt' | 'lastActivity'>
  ): Promise<string> {
    try {
      const sessionId = this.generateSessionId();
      const now = Date.now();

      const sessionData: SessionData = {
        userId,
        ...userData,
        createdAt: now,
        lastActivity: now,
      };

      // Check session limit per user
      await this.enforceSessionLimit(userId);

      // Store session data
      await this.redis.setex(
        this.getSessionKey(sessionId),
        this.config.sessionTTL,
        JSON.stringify(sessionData)
      );

      // Add to user sessions set
      await this.redis.sadd(this.getUserSessionsKey(userId), sessionId);
      await this.redis.expire(
        this.getUserSessionsKey(userId),
        this.config.sessionTTL
      );

      logger.info(`📝 Created session ${sessionId} for user ${userId}`);
      this.emit('sessionCreated', { sessionId, userId, userData });

      return sessionId;
    } catch (error) {
      logger.error('❌ Failed to create session:', error);
      throw new Error('Session creation failed');
    }
  }

  /**
   * Get session data
   */
  public async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const data = await this.redis.get(this.getSessionKey(sessionId));
      if (!data) return null;

      const sessionData = JSON.parse(data) as SessionData;

      // Update last activity
      sessionData.lastActivity = Date.now();
      await this.redis.setex(
        this.getSessionKey(sessionId),
        this.config.sessionTTL,
        JSON.stringify(sessionData)
      );

      return sessionData;
    } catch (error) {
      logger.error('❌ Failed to get session:', error);
      return null;
    }
  }

  /**
   * Update session data
   */
  public async updateSession(
    sessionId: string,
    updates: Partial<SessionData>
  ): Promise<boolean> {
    try {
      const existingData = await this.getSession(sessionId);
      if (!existingData) return false;

      const updatedData: SessionData = {
        ...existingData,
        ...updates,
        lastActivity: Date.now(),
      };

      await this.redis.setex(
        this.getSessionKey(sessionId),
        this.config.sessionTTL,
        JSON.stringify(updatedData)
      );

      logger.info(`📝 Updated session ${sessionId}`);
      this.emit('sessionUpdated', { sessionId, updates });

      return true;
    } catch (error) {
      logger.error('❌ Failed to update session:', error);
      return false;
    }
  }

  /**
   * Delete session
   */
  public async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const sessionData = await this.getSession(sessionId);
      if (!sessionData) return false;

      // Remove from Redis
      await this.redis.del(this.getSessionKey(sessionId));

      // Remove from user sessions set
      await this.redis.srem(
        this.getUserSessionsKey(sessionData.userId),
        sessionId
      );

      logger.info(
        `🗑️ Deleted session ${sessionId} for user ${sessionData.userId}`
      );
      this.emit('sessionDeleted', { sessionId, userId: sessionData.userId });

      return true;
    } catch (error) {
      logger.error('❌ Failed to delete session:', error);
      return false;
    }
  }

  /**
   * Get all sessions for a user
   */
  public async getUserSessions(userId: string): Promise<string[]> {
    try {
      return await this.redis.smembers(this.getUserSessionsKey(userId));
    } catch (error) {
      logger.error('❌ Failed to get user sessions:', error);
      return [];
    }
  }

  /**
   * Delete all sessions for a user
   */
  public async deleteUserSessions(userId: string): Promise<number> {
    try {
      const sessionIds = await this.getUserSessions(userId);

      // ENTERPRISE FIX: Defensive check - sessionIds could be undefined/null if Redis fails
      // Core solution: Handle edge case instead of assuming always array
      if (!sessionIds || !Array.isArray(sessionIds)) {
        logger.warn('⚠️  Failed to get user sessions for deletion', {
          userId,
        });
        return 0;
      }

      if (sessionIds.length === 0) return 0;

      // Delete all session data
      const sessionKeys = sessionIds.map((id) => this.getSessionKey(id));
      await this.redis.del(...sessionKeys);

      // Clear user sessions set
      await this.redis.del(this.getUserSessionsKey(userId));

      logger.info(
        `🗑️ Deleted ${sessionIds.length} sessions for user ${userId}`
      );
      this.emit('userSessionsDeleted', { userId, count: sessionIds.length });

      return sessionIds.length;
    } catch (error) {
      logger.error('❌ Failed to delete user sessions:', error);
      return 0;
    }
  }

  /**
   * Validate session and check if it's active
   */
  public async validateSession(sessionId: string): Promise<boolean> {
    const sessionData = await this.getSession(sessionId);
    if (!sessionData) return false;

    // Check if session is too old (additional security)
    const maxAge = this.config.sessionTTL * 1000; // Convert to milliseconds
    const sessionAge = Date.now() - sessionData.createdAt;

    if (sessionAge > maxAge) {
      await this.deleteSession(sessionId);
      return false;
    }

    return true;
  }

  /**
   * Get session statistics
   */
  public async getSessionStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    userCount: number;
  }> {
    try {
      // This is a simplified implementation
      // In a real system, you'd maintain counters or scan patterns efficiently
      const keys = await this.redis.keys('session:*');

      // ENTERPRISE FIX: Defensive check - keys could be undefined/null if Redis fails
      // Core solution: Handle edge case instead of assuming always array
      if (!keys || !Array.isArray(keys)) {
        logger.warn('⚠️  Failed to retrieve session keys for stats');
        return { totalSessions: 0, activeSessions: 0, userCount: 0 };
      }

      const sessionKeys = keys.filter(
        (key) => key.startsWith('session:') && !key.includes(':user:')
      );

      return {
        totalSessions: sessionKeys.length,
        activeSessions: sessionKeys.length, // Simplified - would need activity check
        userCount: 0, // Would need to calculate unique users
      };
    } catch (error) {
      logger.error('❌ Failed to get session stats:', error);
      return { totalSessions: 0, activeSessions: 0, userCount: 0 };
    }
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    redisConnected: boolean;
    responseTime: number;
  }> {
    const start = Date.now();

    try {
      await this.redis.ping();
      const responseTime = Date.now() - start;

      return {
        status: responseTime < 100 ? 'healthy' : 'degraded',
        redisConnected: true,
        responseTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        redisConnected: false,
        responseTime: Date.now() - start,
      };
    }
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    if (this.isShutdown) return;

    this.isShutdown = true;

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // ENTERPRISE FIX: Defensive error handling - redis.quit() could throw if connection already closed
    // Core solution: Catch errors during shutdown to ensure graceful cleanup
    try {
      await this.redis.quit();
      logger.info('✅ SessionManager: Graceful shutdown completed');
    } catch (error) {
      logger.error('❌ SessionManager: Error during shutdown', error);
      // Continue - don't re-throw, shutdown should be non-blocking
    }
  }

  // Private helper methods

  private generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private getSessionKey(sessionId: string): string {
    // ENTERPRISE FIX (2026-01-08): Manual prefix required - Redis keyPrefix removed
    // Test mock doesn't implement keyPrefix, so we handle prefixes explicitly in code
    return `session:${sessionId}`;
  }

  private getUserSessionsKey(userId: string): string {
    // ENTERPRISE FIX (2026-01-08): Explicit prefix for user sessions set
    return `session:user:${userId}:sessions`;
  }

  private async enforceSessionLimit(userId: string): Promise<void> {
    const sessions = await this.getUserSessions(userId);

    // ENTERPRISE FIX: Defensive check - sessions could be undefined/null if Redis fails
    // Core solution: Handle edge case instead of assuming always array
    if (!sessions || !Array.isArray(sessions)) {
      logger.warn('⚠️  Failed to get user sessions for limit enforcement', {
        userId,
      });
      return; // Skip enforcement if we can't get sessions
    }

    if (sessions.length >= this.config.maxSessionsPerUser) {
      // Remove oldest sessions to make room
      const toRemove = sessions.length - this.config.maxSessionsPerUser + 1;
      const oldestSessions = sessions.slice(0, toRemove);

      for (const sessionId of oldestSessions) {
        await this.deleteSession(sessionId);
      }

      logger.info(`🧹 Removed ${toRemove} oldest sessions for user ${userId}`);
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(async () => {
      if (!this.isShutdown) {
        await this.cleanupExpiredSessions();
      }
    }, this.config.cleanupInterval);
  }

  private async cleanupExpiredSessions(): Promise<void> {
    try {
      // This is a simplified cleanup - in production, you'd use more efficient methods
      logger.info('🧹 Running session cleanup...');
      // Cleanup logic would go here
    } catch (error) {
      logger.error('❌ Session cleanup failed:', error);
    }
  }
}
