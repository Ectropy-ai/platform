/**
 * Session Management Service with Redis
 */

import { CacheClient } from './interfaces.js';
import { SessionData, AuthConfig } from '../types/auth.types.js';
import { logger } from '@ectropy/shared/utils';
import { v4 as uuidv4 } from 'uuid';
export class SessionService {
  private cache: CacheClient;
  private config: AuthConfig;
  private readonly SESSION_PREFIX = 'session:';
  constructor(cache: CacheClient, config: AuthConfig) {
    this.cache = cache;
    this.config = config;
  }
  public async createSession(
    userId: string,
    email: string,
    roles: string[],
    ipAddress?: string,
    userAgent?: string
  ): Promise<string> {
    try {
      const sessionId = uuidv4();
      const sessionData: SessionData = {
        sessionId,
        userId,
        email,
        roles,
        lastActivity: new Date(),
      };
      // Only add optional properties if they exist
      if (ipAddress) {
        sessionData.ipAddress = ipAddress;
      }
      if (userAgent) {
        sessionData.userAgent = userAgent;
      }

      const sessionKey = this.getSessionKey(sessionId);
      const ttl = this.config.sessionTimeout;
      await this.cache.set(sessionKey, sessionData, ttl);
      logger.info('Session created', {
        sessionId,
        ttl,
      });
      return sessionId;
    } catch (_error) {
      const error = _error as Error;
      logger.error('Failed to create session', {
        error: error,
      });
      throw error;
    }
  }
  public async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const sessionData = await this.cache.get<SessionData>(sessionKey);
      if (sessionData) {
        // Update last activity
        sessionData.lastActivity = new Date();
        await this.cache.set(
          sessionKey,
          sessionData,
          this.config.sessionTimeout
        );
        logger.debug('Session retrieved and updated', {
          sessionId,
          userId: sessionData.userId,
        });
      }
      return sessionData;
    } catch (_error) {
      const error = _error as Error;
      logger.error('Failed to get session', {
        sessionId,
        error: error,
      });
      return null;
    }
  }
  public async updateSession(
    sessionId: string,
    updates: Partial<SessionData>
  ): Promise<boolean> {
    try {
      const sessionData = await this.getSession(sessionId);
      if (!sessionData) {
        return false;
      }

      const updatedData: SessionData = {
        ...sessionData,
        ...updates,
        lastActivity: new Date(),
      };

      const sessionKey = this.getSessionKey(sessionId);
      await this.cache.set(
        sessionKey,
        updatedData,
        this.config.sessionTimeout
      );

      logger.debug('Session updated', {
        sessionId,
        userId: sessionData.userId,
        updates: Object.keys(updates),
      });

      return true;
    } catch (_error) {
      const error = _error as Error;
      logger.error('Failed to update session', {
        sessionId,
        error: error,
      });
      return false;
    }
  }
  public async destroySession(sessionId: string): Promise<boolean> {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const deleted = await this.cache.delete(sessionKey);

      if (deleted) {
        logger.info('Session destroyed', { sessionId });
      } else {
        logger.warn('Session not found for destruction', { sessionId });
      }

      return deleted;
    } catch (_error) {
      const error = _error as Error;
      logger.error('Failed to destroy session', {
        sessionId,
        error: error,
      });
      return false;
    }
  }
  public async destroyAllUserSessions(userId: string): Promise<number> {
    try {
      const pattern = `${this.SESSION_PREFIX}*`;
      const sessionKeys = await this.cache.keys(pattern);
      let destroyedCount = 0;
      for (const key of sessionKeys) {
        const sessionData = await this.cache.get<SessionData>(key);
        if (sessionData && sessionData.userId === userId) {
          const sessionId = key.replace(this.SESSION_PREFIX, '');
          const deleted = await this.destroySession(sessionId);
          if (deleted) {
            destroyedCount++;
          }
        }
      }
      logger.info('All user sessions destroyed', {
        userId,
        destroyedCount,
      });
      return destroyedCount;
    } catch (error) {
      logger.error('Failed to destroy all user sessions', {
        userId,
        error: error as Error,
      });
      return 0;
    }
  }
  public async isSessionValid(sessionId: string): Promise<boolean> {
    try {
      const sessionData = await this.getSession(sessionId);
      return sessionData !== null;
    } catch (error) {
      logger.error('Failed to validate session', {
        sessionId,
        error: error as Error,
      });
      return false;
    }
  }
  public async getActiveSessions(userId: string): Promise<SessionData[]> {
    try {
      const pattern = `${this.SESSION_PREFIX}*`;
      const sessionKeys = await this.cache.keys(pattern);
      const userSessions: SessionData[] = [];

      for (const key of sessionKeys) {
        const sessionData = await this.cache.get<SessionData>(key);
        if (sessionData && sessionData.userId === userId) {
          userSessions.push(sessionData);
        }
      }

      logger.debug('Active sessions retrieved', {
        userId,
        sessionCount: userSessions.length,
      });
      return userSessions;
    } catch (error) {
      logger.error('Failed to get active sessions', {
        userId,
        error: error as Error,
      });
      return [];
    }
  }
  public async cleanupExpiredSessions(): Promise<number> {
    try {
      const pattern = `${this.SESSION_PREFIX}*`;
      const sessionKeys = await this.cache.keys(pattern);
      let cleanedCount = 0;
      const now = new Date();
      const maxAge = this.config.sessionTimeout * 1000; // Convert to milliseconds

      for (const key of sessionKeys) {
        const sessionData = await this.cache.get<SessionData>(key);
        if (sessionData) {
          const sessionAge = now.getTime() - sessionData.lastActivity.getTime();
          if (sessionAge > maxAge) {
            const sessionId = key.replace(this.SESSION_PREFIX, '');
            const deleted = await this.destroySession(sessionId);
            if (deleted) {
              cleanedCount++;
            }
          }
        }
      }

      if (cleanedCount > 0) {
        logger.info('Expired sessions cleaned up', { cleanedCount });
      }
      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', {
        error: error as Error,
      });
      return 0;
    }
  }

  private getSessionKey(sessionId: string): string {
    return `${this.SESSION_PREFIX}${sessionId}`;
  }
  public async getSessionStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    uniqueUsers: number;
  }> {
    try {
      const pattern = `${this.SESSION_PREFIX}*`;
      const sessionKeys = await this.cache.keys(pattern);
      const uniqueUsers = new Set<string>();
      let activeSessions = 0;
      const now = new Date();
      const maxAge = this.config.sessionTimeout * 1000;

      for (const key of sessionKeys) {
        const sessionData = await this.cache.get<SessionData>(key);
        if (sessionData) {
          uniqueUsers.add(sessionData.userId);
          const sessionAge = now.getTime() - sessionData.lastActivity.getTime();
          if (sessionAge <= maxAge) {
            activeSessions++;
          }
        }
      }

      return {
        totalSessions: sessionKeys.length,
        activeSessions,
        uniqueUsers: uniqueUsers.size,
      };
    } catch (error) {
      logger.error('Failed to get session stats', {
        error: error as Error,
      });
      return {
        totalSessions: 0,
        activeSessions: 0,
        uniqueUsers: 0,
      };
    }
  }
}
