/**
 * Account Lockout and Rate Limiting System for Ectropy Platform
 * Commercial-grade security for preventing brute force attacks
 */

import type { Redis } from 'ioredis';
import { randomBytes } from 'crypto';
// Type assertion helper for Redis methods that might not be in type definitions
const redisWithAllMethods = (redis: Redis): any => redis;
export interface LockoutConfig {
  maxFailedAttempts: number;
  lockoutDuration: number; // in seconds
  progressiveDelays: boolean;
  trackByIP: boolean;
  trackByUser: boolean;
  windowDuration: number; // sliding window in seconds
  notificationThreshold: number; // notify security team after this many attempts
}
export interface RateLimitConfig {
  maxRequests: number;
  windowSizeInSeconds: number;
  skipSuccessfulAttempts: boolean;
  burstAllowance: number; // Allow brief bursts
}

export interface LockoutStatus {
  isLocked: boolean;
  remainingTime?: number;
  attemptCount: number;
  lastAttempt: Date;
  lockReason?: string;
}

export interface RateLimitStatus {
  isLimited: boolean;
  remainingRequests: number;
  resetTime: Date;
  retryAfter?: number;
}
// Default configurations for production security
const DEFAULT_LOCKOUT_CONFIG: LockoutConfig = {
  maxFailedAttempts: 5,
  lockoutDuration: 30 * 60, // 30 minutes
  progressiveDelays: true,
  trackByIP: true,
  trackByUser: true,
  windowDuration: 15 * 60, // 15 minutes
  notificationThreshold: 10,
};
const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxRequests: 5,
  windowSizeInSeconds: 60, // 1 minute
  skipSuccessfulAttempts: false,
  burstAllowance: 2,
};

export class AccountSecurityService {
  private redis: Redis;
  private lockoutConfig: LockoutConfig;
  private rateLimitConfig: RateLimitConfig;
  constructor(
    redis: Redis,
    lockoutConfig?: Partial<LockoutConfig>,
    rateLimitConfig?: Partial<RateLimitConfig>
  ) {
    this.redis = redis;
    this.lockoutConfig = { ...DEFAULT_LOCKOUT_CONFIG, ...lockoutConfig };
    this.rateLimitConfig = { ...DEFAULT_RATE_LIMIT_CONFIG, ...rateLimitConfig };
  }
  /**
   * Check if account is locked due to failed attempts
   */
  async checkAccountLockout(
    identifier: string,
    type: 'user' | 'ip' | 'combined'
  ): Promise<LockoutStatus> {
    const key = this.generateLockoutKey(identifier, type);
    const lockData = await redisWithAllMethods(this.redis).hgetall(key);
    if (!lockData['attempts']) {
      return {
        isLocked: false,
        attemptCount: 0,
        lastAttempt: new Date(),
      };
    }
    const attemptCount = parseInt(lockData['attempts']);
    const lastAttemptValue = lockData['lastAttempt'];
    if (!lastAttemptValue) {
      throw new Error('Invalid lock data: missing lastAttempt');
    }
    const lastAttempt = new Date(lastAttemptValue);
    const lockUntil = lockData['lockUntil']
      ? new Date(lockData['lockUntil'])
      : null;
    // Check if lock has expired
    if (lockUntil !== null && lockUntil > new Date()) {
      const remainingTime = Math.ceil(
        (lockUntil.getTime() - Date.now()) / 1000
      );
      return {
        isLocked: true,
        remainingTime,
        attemptCount,
        lastAttempt,
        lockReason: lockData['reason'] || 'Too many failed attempts',
      };
    }
    // Check if we're in a sliding window
    const windowStart = new Date(
      Date.now() - this.lockoutConfig.windowDuration * 1000
    );
    if (lastAttempt < windowStart) {
      // Reset attempts if outside window
      await redisWithAllMethods(this.redis).del(key);
    }
    return {
      isLocked: false,
      attemptCount,
      lastAttempt,
    };
  }

  /**
   * Record a failed authentication attempt
   */
  async recordFailedAttempt(
    identifier: string,
    type: 'user' | 'ip' | 'combined',
    additionalInfo?: { userAgent?: string; fingerprint?: string }
  ): Promise<void> {
    const key = this.generateLockoutKey(identifier, type);
    const now = new Date();
    // Get current attempt count
    const currentStatus = await this.checkAccountLockout(identifier, type);
    const newAttemptCount = currentStatus.attemptCount + 1;
    // Progressive delay calculation
    let lockoutDuration = this.lockoutConfig.lockoutDuration;
    if (
      this.lockoutConfig.progressiveDelays &&
      newAttemptCount > this.lockoutConfig.maxFailedAttempts
    ) {
      // Exponential backoff: 2^(attempts - maxAttempts) * base duration
      const multiplier = Math.pow(
        2,
        newAttemptCount - this.lockoutConfig.maxFailedAttempts
      );
      lockoutDuration = Math.min(lockoutDuration * multiplier, 24 * 60 * 60); // Max 24 hours
    }

    // Check if we should lock the account
    const shouldLock = newAttemptCount >= this.lockoutConfig.maxFailedAttempts;
    const lockUntil = shouldLock
      ? new Date(Date.now() + lockoutDuration * 1000)
      : null;

    // Store attempt data
    const attemptData: Record<string, string> = {
      attempts: newAttemptCount.toString(),
      lastAttempt: now.toISOString(),
      ...(lockUntil !== null && { lockUntil: lockUntil.toISOString() }),
      ...(shouldLock && { reason: 'Exceeded maximum failed attempts' }),
      ...(additionalInfo?.userAgent && { userAgent: additionalInfo.userAgent }),
      ...(additionalInfo?.fingerprint && {
        fingerprint: additionalInfo.fingerprint,
      }),
    };

    const fields = {
      attempts: String(attemptData['attempts']),
      lastAttempt: attemptData['lastAttempt'],
      lockUntil: attemptData['lockUntil'] || '',
      ip: attemptData['ip'] || '',
    };

    await redisWithAllMethods(this.redis).hset(key, fields);

    // Set expiration for cleanup
    await redisWithAllMethods(this.redis).expire(
      key,
      Math.max(lockoutDuration, this.lockoutConfig.windowDuration)
    );
    // Log security event
    await this.logSecurityEvent('failed_login_attempt', {
      identifier,
      type,
      attemptCount: newAttemptCount,
      locked: shouldLock,
      timestamp: now.toISOString(),
      ...additionalInfo,
    });
    // Check if we should notify security team
    if (newAttemptCount >= this.lockoutConfig.notificationThreshold) {
      await this.notifySecurityTeam('high_failed_attempts', {
        identifier,
        type,
        attemptCount: newAttemptCount,
        timestamp: now.toISOString(),
      });
    }

    // Store lockout data
    await redisWithAllMethods(this.redis).setex(
      key,
      Math.max(lockoutDuration, this.lockoutConfig.windowDuration),
      JSON.stringify({
        attemptCount: newAttemptCount,
        lastAttempt: now.toISOString(),
        lockoutUntil: shouldLock
          ? new Date(now.getTime() + lockoutDuration * 1000).toISOString()
          : null,
      })
    );

    // Log security event
    await this.logSecurityEvent('failed_attempt', {
      identifier,
      type,
      attemptCount: newAttemptCount,
      isLocked: shouldLock,
      timestamp: now.toISOString(),
    });
  }

  /**
   * Record successful authentication (clears failed attempts)
   */
  async recordSuccessfulAttempt(
    identifier: string,
    type: 'user' | 'ip' | 'combined'
  ): Promise<void> {
    const key = this.generateLockoutKey(identifier, type);
    await redisWithAllMethods(this.redis).del(key);

    // Log successful authentication
    await this.logSecurityEvent('successful_login', {
      identifier,
      type,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Check rate limiting for authentication attempts
   */
  async checkRateLimit(
    identifier: string,
    endpoint = 'auth'
  ): Promise<RateLimitStatus> {
    const key = this.generateRateLimitKey(identifier, endpoint);
    const now = Date.now();
    const windowStart = now - this.rateLimitConfig.windowSizeInSeconds * 1000;

    // Use Redis sorted set for sliding window
    const pipe = redisWithAllMethods(this.redis).pipeline();
    // Remove old entries
    pipe.zremrangebyscore(key, '-inf', windowStart);
    // Count current requests in window
    pipe.zcard(key);
    // Set expiration
    pipe.expire(key, this.rateLimitConfig.windowSizeInSeconds);
    const results = await pipe.exec();
    const currentCount = (results?.[1]?.[1] as number) || 0;

    const maxAllowed =
      this.rateLimitConfig.maxRequests + this.rateLimitConfig.burstAllowance;
    const isLimited = currentCount >= maxAllowed;
    const remainingRequests = Math.max(0, maxAllowed - currentCount);
    const resetTime = new Date(
      now + this.rateLimitConfig.windowSizeInSeconds * 1000
    );

    return {
      isLimited,
      remainingRequests,
      resetTime,
      ...(isLimited && {
        retryAfter: this.rateLimitConfig.windowSizeInSeconds,
      }),
    };
  }

  /**
   * Record a rate limit attempt
   */
  async recordRateLimit(
    identifier: string,
    endpoint = 'auth',
    wasSuccessful = false
  ): Promise<RateLimitStatus> {
    // Skip recording if configured to ignore successful attempts
    if (wasSuccessful && this.rateLimitConfig.skipSuccessfulAttempts) {
      return this.checkRateLimit(identifier, endpoint);
    }

    const key = this.generateRateLimitKey(identifier, endpoint);
    const now = Date.now();

    // Add current timestamp to sorted set
    await redisWithAllMethods(this.redis).zadd(
      key,
      now,
      `${now}-${randomBytes(4).toString('hex')}`
    );

    return this.checkRateLimit(identifier, endpoint);
  }

  /**
   * Manually lock an account (admin action)
   */
  async manualLock(
    identifier: string,
    type: 'user' | 'ip' | 'combined',
    duration: number,
    reason: string,
    adminId: string
  ): Promise<void> {
    const key = this.generateLockoutKey(identifier, type);
    const lockUntil = new Date(Date.now() + duration * 1000);

    await redisWithAllMethods(this.redis).setex(
      key,
      duration,
      JSON.stringify({
        attemptCount: 999, // High number to indicate manual lock
        lastAttempt: new Date().toISOString(),
        lockUntil: lockUntil.toISOString(),
        reason,
        manualLock: 'true',
        lockedBy: adminId,
      })
    );

    await redisWithAllMethods(this.redis).expire(key, duration);

    // Log admin action
    await this.logSecurityEvent('manual_account_lock', {
      identifier,
      type,
      duration,
      reason,
      adminId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Manually unlock an account (admin action)
   */
  async manualUnlock(
    identifier: string,
    type: 'user' | 'ip' | 'combined',
    adminId: string
  ): Promise<void> {
    const key = this.generateLockoutKey(identifier, type);
    await redisWithAllMethods(this.redis).del(key);

    // Log admin action
    await this.logSecurityEvent('manual_account_unlock', {
      identifier,
      type,
      adminId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get security statistics
   */
  async getSecurityStats(timeframe: number = 24 * 60 * 60): Promise<{
    totalFailedAttempts: number;
    lockedAccounts: number;
    rateLimitedRequests: number;
    topFailedIPs: Array<{ ip: string; count: number }>;
  }> {
    const since = new Date(Date.now() - timeframe * 1000).toISOString();
    // Get events from security log
    const events = await redisWithAllMethods(this.redis).zrangebyscore(
      'security_events',
      `(${since}`,
      '+inf',
      'WITHSCORES'
    );

    const stats = {
      totalFailedAttempts: 0,
      lockedAccounts: 0,
      rateLimitedRequests: 0,
      topFailedIPs: [] as Array<{ ip: string; count: number }>,
    };

    const ipCounts: Record<string, number> = {};
    for (let i = 0; i < events.length; i += 2) {
      try {
        const eventData = JSON.parse(events[i]);
        switch (eventData.type) {
          case 'failed_login_attempt':
            stats.totalFailedAttempts++;
            if (eventData.locked) {
              stats.lockedAccounts++;
            }
            // Track IP if available
            if (eventData.identifier && eventData.identifier.includes('.')) {
              // Simple IP check
              ipCounts[eventData.identifier] =
                (ipCounts[eventData.identifier] || 0) + 1;
            }
            break;
          case 'rate_limit_exceeded':
            stats.rateLimitedRequests++;
            break;
        }
      } catch (_error) {
        // Skip malformed events
        continue;
      }
    }

    // Sort IPs by failure count
    stats.topFailedIPs = Object.entries(ipCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }));

    return stats;
  }

  /**
   * Clean up expired lockouts and rate limits
   */
  async cleanup(): Promise<void> {
    const now = Date.now();

    // Clean up old security events (keep last 30 days)
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    await redisWithAllMethods(this.redis).zremrangebyscore(
      'security_events',
      '-inf',
      thirtyDaysAgo
    );

    // Clean up old notification events
    await redisWithAllMethods(this.redis).zremrangebyscore(
      'security_notifications',
      '-inf',
      thirtyDaysAgo
    );

  }

  /**
   * Generate lockout key for Redis
   */
  private generateLockoutKey(identifier: string, type: string): string {
    return `lockout:${type}:${identifier}`;
  }

  /**
   * Generate rate limit key for Redis
   */
  private generateRateLimitKey(identifier: string, endpoint: string): string {
    return `ratelimit:${endpoint}:${identifier}`;
  }

  /**
   * Log security event to Redis sorted set
   */
  private async logSecurityEvent(type: string, data: any): Promise<void> {
    const event = {
      type,
      ...data,
      timestamp: Date.now(),
    };

    await redisWithAllMethods(this.redis).zadd(
      'security_events',
      Date.now(),
      JSON.stringify(event)
    );
  }

  /**
   * Notify security team of critical events
   */
  private async notifySecurityTeam(type: string, data: any): Promise<void> {
    const notification = {
      type,
      severity: 'high',
      timestamp: new Date().toISOString(),
      ...data,
    };

    // Store notification for dashboard
    await redisWithAllMethods(this.redis).zadd(
      'security_notifications',
      Date.now(),
      JSON.stringify(notification)
    );

    // In production, this would also send alerts via email, Slack, etc.
  }

  /**
   * Get current configuration
   */
  getConfig(): { lockout: LockoutConfig; rateLimit: RateLimitConfig } {
    return {
      lockout: { ...this.lockoutConfig },
      rateLimit: { ...this.rateLimitConfig },
    };
  }

  /**
   * Update configuration
   */
  updateConfig(
    lockoutConfig?: Partial<LockoutConfig>,
    rateLimitConfig?: Partial<RateLimitConfig>
  ): void {
    if (lockoutConfig) {
      this.lockoutConfig = { ...this.lockoutConfig, ...lockoutConfig };
    }
    if (rateLimitConfig) {
      this.rateLimitConfig = { ...this.rateLimitConfig, ...rateLimitConfig };
    }
  }
}
