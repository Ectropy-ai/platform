/**
 * Account Lockout and Rate Limiting System for Ectropy Platform
 * Commercial-grade security for preventing brute force attacks
 */
import crypto from 'crypto';
// Default configurations for production security
const DEFAULT_LOCKOUT_CONFIG = {
  maxFailedAttempts: 5,
  lockoutDuration: 30 * 60, // 30 minutes
  progressiveDelays: true,
  trackByIP: true,
  trackByUser: true,
  windowDuration: 15 * 60, // 15 minutes
  notificationThreshold: 10,
};
const DEFAULT_RATE_LIMIT_CONFIG = {
  maxRequests: 5,
  windowSizeInSeconds: 60, // 1 minute
  skipSuccessfulAttempts: false,
  burstAllowance: 2,
};
export class AccountSecurityService {
  constructor(redis, lockoutConfig, rateLimitConfig) {
    this.redis = redis;
    this.lockoutConfig = { ...DEFAULT_LOCKOUT_CONFIG, ...lockoutConfig };
    this.rateLimitConfig = { ...DEFAULT_RATE_LIMIT_CONFIG, ...rateLimitConfig };
  }
  /**
   * Check if account is locked due to failed attempts
   */
  async checkAccountLockout(_identifier, _type) {
    const key = 'REDACTED';
    const lockData = await this.redis.hgetall(key);
    if (!lockData.attempts) {
      return {
        isLocked: false,
        attemptCount: 0,
        lastAttempt: new Date(),
      };
    }
    const attemptCount = parseInt(lockData.attempts);
    const lastAttempt = new Date(lockData.lastAttempt);
    const lockUntil = lockData.lockUntil ? new Date(lockData.lockUntil) : null;
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
        lockReason: lockData.reason || 'Too many failed attempts',
      };
    }
    // Check if we're in a sliding window
    const windowStart = new Date(
      Date.now() - this.lockoutConfig.windowDuration * 1000
    );
    if (lastAttempt < windowStart) {
      // Reset attempts if outside window
      await this.redis.del(key);
      return {
        isLocked: false,
        attemptCount: 0,
        lastAttempt: new Date(),
      };
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
  async recordFailedAttempt(_identifier, _type, additionalInfo) {
    const key = 'REDACTED';
    const now = new Date();
    // Get current attempt count
    const currentStatus = await this.checkAccountLockout(_identifier, _type);
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
    const attemptData = {
      attempts: newAttemptCount.toString(),
      lastAttempt: now.toISOString(),
      ...(lockUntil !== null && { lockUntil: lockUntil.toISOString() }),
      ...(shouldLock && { reason: 'Exceeded maximum failed attempts' }),
      ...(additionalInfo?.userAgent && { userAgent: additionalInfo.userAgent }),
      ...(additionalInfo?.fingerprint && {
        fingerprint: additionalInfo.fingerprint,
      }),
    };
    await this.redis.hset(key, attemptData);
    // Set expiration for cleanup
    await this.redis.expire(
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
    return {
      isLocked: shouldLock,
      attemptCount: newAttemptCount,
      lastAttempt: now,
      ...(shouldLock && {
        remainingTime: lockoutDuration,
        lockReason: 'Too many failed attempts',
      }),
    };
  }
  /**
   * Record successful authentication (clears failed attempts)
   */
  async recordSuccessfulAttempt(_identifier, _type) {
    const key = 'REDACTED';
    await this.redis.del(key);
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
  async checkRateLimit(identifier, _endpoint = 'auth') {
    const key = 'REDACTED';
    const now = Date.now();
    const windowStart = now - this.rateLimitConfig.windowSizeInSeconds * 1000;
    // Use Redis sorted set for sliding window
    const pipe = this.redis.pipeline();
    // Remove old entries
    pipe.zremrangebyscore(key, '-inf', windowStart);
    // Count current requests in window
    pipe.zcard(key);
    // Set expiration
    pipe.expire(key, this.rateLimitConfig.windowSizeInSeconds);
    const results = await pipe.exec();
    const currentCount = results?.[1]?.[1] || 0;
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
  async recordRateLimit(identifier, _endpoint = 'auth', wasSuccessful = false) {
    // Skip recording if configured to ignore successful attempts
    if (wasSuccessful && this.rateLimitConfig.skipSuccessfulAttempts) {
      return this.checkRateLimit(identifier, endpoint);
    }
    const key = 'REDACTED';
    const now = Date.now();
    // Add current timestamp to sorted set
    await this.redis.zadd(
      key,
      now,
      `${now}-${crypto.randomBytes(4).toString('hex')}`
    );
    return this.checkRateLimit(identifier, endpoint);
  }
  /**
   * Manually lock an account (admin action)
   */
  async manualLock(_identifier, _type, duration, reason, adminId) {
    const key = 'REDACTED';
    const lockUntil = new Date(Date.now() + duration * 1000);
    await this.redis.hset(key, {
      attempts: '999', // High number to indicate manual lock
      lastAttempt: new Date().toISOString(),
      lockUntil: lockUntil.toISOString(),
      reason,
      manualLock: 'true',
      lockedBy: adminId,
    });
    await this.redis.expire(key, duration);
    // Log admin action
    await this.logSecurityEvent('manual_account_lock', {
      identifier,
      type,
      reason,
      duration,
      adminId,
      timestamp: new Date().toISOString(),
    });
  }
  /**
   * Manually unlock an account (admin action)
   */
  async manualUnlock(_identifier, _type, adminId) {
    const key = 'REDACTED';
    await this.redis.del(key);
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
  async getSecurityStats(timeframe = 24 * 60 * 60) {
    const since = new Date(Date.now() - timeframe * 1000).toISOString();
    // Get events from security log
    const events = await this.redis.zrangebyscore(
      'security_events',
      `(${since}`,
      '+inf',
      'WITHSCORES'
    );
    const stats = {
      totalFailedAttempts: 0,
      lockedAccounts: 0,
      rateLimitedRequests: 0,
      topFailedIPs: [],
    };
    const ipCounts = {};
    for (let i = 0; i < events.length; i += 2) {
      const eventData = JSON.parse(events[i]);
      switch (eventData.type) {
        case 'failed_login_attempt':
          stats.totalFailedAttempts++;
          if (eventData.locked) {
            stats.lockedAccounts++;
          }
          // Track IP if available
          if (eventData.identifier.includes('.')) {
            // Simple IP check
            ipCounts[eventData.identifier] =
              (ipCounts[eventData.identifier] || 0) + 1;
          }
          break;
        case 'rate_limit_exceeded':
          stats.rateLimitedRequests++;
          break;
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
  async cleanup() {
    const now = Date.now();
    // Clean up old security events (keep last 30 days)
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    await this.redis.zremrangebyscore('security_events', '-inf', thirtyDaysAgo);
    // Clean up old notification events
    await this.redis.zremrangebyscore(
      'security_notifications',
      '-inf',
      thirtyDaysAgo
    );
    // console.log('Security cleanup completed');
  }
  /**
   * Generate lockout key for Redis
   */
  getLockoutKey(_identifier, _type) {
    return `lockout:${type}:${identifier}`;
  }
  /**
   * Generate rate limit key for Redis
   */
  getRateLimitKey(identifier, endpoint) {
    return `ratelimit:${endpoint}:${identifier}`;
  }
  /**
   * Log security event to Redis sorted set
   */
  async logSecurityEvent(type, data) {
    const event = {
      type,
      ...data,
    };
    await this.redis.zadd('security_events', Date.now(), JSON.stringify(event));
  }
  /**
   * Notify security team of critical events
   */
  async notifySecurityTeam(type, data) {
    const notification = {
      type,
      severity: 'high',
      ...data,
    };
    // Store notification for dashboard
    await this.redis.zadd(
      'security_notifications',
      Date.now(),
      JSON.stringify(notification)
    );
    // In production, this would also send alerts via email, Slack, etc.
    // console.warn('SECURITY ALERT:', notification);
  }
  /**
   * Get current configuration
   */
  getConfig() {
    return {
      lockout: { ...this.lockoutConfig },
      rateLimit: { ...this.rateLimitConfig },
    };
  }
  /**
   * Update configuration
   */
  updateConfig(lockoutConfig, rateLimitConfig) {
    if (lockoutConfig !== null) {
      this.lockoutConfig = { ...this.lockoutConfig, ...lockoutConfig };
    }
    if (rateLimitConfig !== null) {
      this.rateLimitConfig = { ...this.rateLimitConfig, ...rateLimitConfig };
    }
  }
}
//# sourceMappingURL=account-security.js.map
