/**
 * Two-Factor Authentication (2FA) System for Ectropy Platform
 * Supports TOTP, SMS, and Email-based 2FA with backup codes
 */
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
// Default configuration
const DEFAULT_CONFIG = {
  appName: 'Ectropy Platform',
  issuer: 'Ectropy Construction',
  window: 2, // Allow 2 steps before/after current time
  step: 30, // 30-second intervals
  digits: 6, // 6-digit codes
  algorithm: 'sha1',
  backupCodesCount: 8,
};
export class TwoFactorAuthService {
  constructor(redis, config) {
    this.redis = redis;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  /**
   * Setup TOTP-based 2FA for a user
   */
  async setupTOTP(_userId, _userEmail) {
    // Generate secret
    const secret = 'REDACTED'; // speakeasy.generateSecret({
    //   name: `${this.config.appName} (${userEmail})`,
    //   issuer: this.config.issuer,
    //   length: 32,
    // });
    // Generate backup codes
    const backupCodes = this.generateBackupCodes();
    // Store temporarily (user must verify before enabling)
    const setupKey = 'REDACTED'; // `2fa_setup:${userId}`;
    await this.redis.hset(setupKey, {
      secret: 'REDACTED',
      backupCodes: JSON.stringify(backupCodes),
      createdAt: new Date().toISOString(),
    });
    await this.redis.expire(setupKey, 300); // 5 minutes to complete setup
    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
    return {
      secret: 'REDACTED',
      manualEntryKey: secret.base32,
      qrCodeUrl,
      backupCodes,
    };
  }
  /**
   * Verify setup token and enable 2FA
   */
  async verifyAndEnableTotp(_userId, token) {
    const setupKey = 'REDACTED';
    const setupData = await this.redis.hgetall(setupKey);
    if (!setupData.secret) {
      return {
        success: false,
        error: 'No setup in progress. Please start 2FA setup again.',
      };
    }
    // Verify the token
    const isValid = speakeasy.totp.verify({
      secret: 'REDACTED',
      encoding: 'base32',
      token,
      window: this.config.window,
      step: this.config.step,
    });
    if (!isValid) {
      return {
        success: false,
        error: 'Invalid verification code. Please try again.',
      };
    }
    // Enable 2FA for the user
    const userKey = 'REDACTED';
    await this.redis.hset(userKey, {
      enabled: 'true',
      secret: 'REDACTED',
      backupCodes: setupData.backupCodes,
      enabledAt: new Date().toISOString(),
      method: 'totp',
    });
    // Clean up setup data
    await this.redis.del(setupKey);
    // Log security event
    await this.logSecurityEvent(_userId, '2fa_enabled', { method: 'totp' });
    return {
      success: true,
      backupCodes: JSON.parse(setupData.backupCodes),
    };
  }
  /**
   * Verify 2FA token
   */
  async verifyToken(_userId, token, allowBackupCode = true) {
    const userKey = 'REDACTED';
    const userData = await this.redis.hgetall(userKey);
    if (!userData.enabled || userData.enabled !== 'true') {
      return {
        isValid: false,
        error: '2FA is not enabled for this account',
      };
    }
    // First try TOTP verification
    if (userData.secret) {
      const isValid = speakeasy.totp.verify({
        secret: 'REDACTED',
        encoding: 'base32',
        token,
        window: this.config.window,
        step: this.config.step,
      });
      if (isValid) {
        // Update last used time
        await this.redis.hset(userKey, 'lastUsed', new Date().toISOString());
        // Log successful verification
        await this.logSecurityEvent(_userId, '2fa_verified', {
          method: 'totp',
        });
        return { isValid: true };
      }
    }
    // Try backup codes if TOTP failed and backup codes are allowed
    if (allowBackupCode && userData.backupCodes) {
      const backupCodes = JSON.parse(userData.backupCodes);
      const tokenIndex = backupCodes.indexOf(token.toLowerCase());
      if (tokenIndex !== -1) {
        // Remove used backup code
        backupCodes.splice(tokenIndex, 1);
        await this.redis.hset(userKey, {
          backupCodes: JSON.stringify(backupCodes),
          lastUsed: new Date().toISOString(),
        });
        // Log backup code usage
        await this.logSecurityEvent(_userId, '2fa_backup_code_used', {
          codesRemaining: backupCodes.length,
        });
        // Warn if running low on backup codes
        if (backupCodes.length <= 2) {
          await this.notifyLowBackupCodes(_userId, backupCodes.length);
        }
        return {
          isValid: true,
          usedBackupCode: true,
          backupCodesRemaining: backupCodes.length,
        };
      }
    }
    // Log failed verification attempt
    await this.logSecurityEvent(_userId, '2fa_verification_failed', {
      token: 'REDACTED',
    });
    return {
      isValid: false,
      error: 'Invalid 2FA code',
    };
  }
  /**
   * Disable 2FA for a user
   */
  async disable2FA(_userId, currentPassword, confirmationToken) {
    // In production, verify current password here
    // If 2FA is enabled, require a valid token to disable
    if (confirmationToken) {
      const verification = await this.verifyToken(_userId, confirmationToken);
      if (!verification.isValid) {
        return {
          success: false,
          error: 'Invalid 2FA code. Cannot disable 2FA.',
        };
      }
    }
    const userKey = 'REDACTED';
    await this.redis.del(userKey);
    // Log security event
    await this.logSecurityEvent(_userId, '2fa_disabled', {});
    return { success: true };
  }
  /**
   * Generate new backup codes
   */
  async generateNewBackupCodes(_userId, currentToken) {
    // Verify current 2FA token
    const verification = await this.verifyToken(_userId, currentToken, false); // Don't allow backup codes for this
    if (!verification.isValid) {
      return {
        success: false,
        error: 'Invalid 2FA code. Cannot generate new backup codes.',
      };
    }
    const newBackupCodes = this.generateBackupCodes();
    const userKey = 'REDACTED';
    await this.redis.hset(userKey, {
      backupCodes: JSON.stringify(newBackupCodes),
      backupCodesRegeneratedAt: new Date().toISOString(),
    });
    // Log security event
    await this.logSecurityEvent(_userId, '2fa_backup_codes_regenerated', {});
    return {
      success: true,
      backupCodes: newBackupCodes,
    };
  }
  /**
   * Get 2FA status for a user
   */
  async getStatus(_userId) {
    const userKey = 'REDACTED';
    const userData = await this.redis.hgetall(userKey);
    if (!userData.enabled || userData.enabled !== 'true') {
      return {
        enabled: false,
        methods: [],
        backupCodesRemaining: 0,
      };
    }
    const backupCodes = userData.backupCodes
      ? JSON.parse(userData.backupCodes)
      : [];
    const methods = [];
    if (userData.secret) {
      methods.push('totp');
    }
    return {
      enabled: true,
      methods,
      backupCodesRemaining: backupCodes.length,
      lastUsed: userData.lastUsed ? new Date(userData.lastUsed) : undefined,
    };
  }
  /**
   * Setup SMS-based 2FA (placeholder for SMS provider integration)
   */
  async setupSMS(_userId, phoneNumber) {
    // Validate phone number format
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return {
        success: false,
        error:
          'Invalid phone number format. Use international format (+1234567890)',
      };
    }
    // Generate verification code
    const verificationCode = crypto.randomInt(100000, 999999).toString();
    // Store temporarily
    const setupKey = 'REDACTED';
    await this.redis.hset(setupKey, {
      phoneNumber,
      verificationCode,
      createdAt: new Date().toISOString(),
    });
    await this.redis.expire(setupKey, 300); // 5 minutes
    // Send SMS (implement with your SMS provider)
    const smsSent = await this.sendSMS(phoneNumber, verificationCode);
    if (!smsSent) {
      await this.redis.del(setupKey);
      return {
        success: false,
        error: 'Failed to send SMS verification code',
      };
    }
    return { success: true };
  }
  /**
   * Verify SMS setup and enable SMS 2FA
   */
  async verifySMSSetup(_userId, verificationCode) {
    const setupKey = 'REDACTED';
    const setupData = await this.redis.hgetall(setupKey);
    if (
      !setupData.verificationCode ||
      setupData.verificationCode !== verificationCode
    ) {
      return {
        success: false,
        error: 'Invalid verification code',
      };
    }
    // Enable SMS 2FA
    const userKey = 'REDACTED';
    await this.redis.hset(userKey, {
      smsEnabled: 'true',
      phoneNumber: setupData.phoneNumber,
      smsEnabledAt: new Date().toISOString(),
    });
    // Clean up setup data
    await this.redis.del(setupKey);
    // Log security event
    await this.logSecurityEvent(_userId, '2fa_sms_enabled', {});
    return { success: true };
  }
  /**
   * Send 2FA code via SMS
   */
  async sendSMSCode(_userId) {
    const userKey = 'REDACTED';
    const userData = await this.redis.hgetall(userKey);
    if (!userData.smsEnabled || !userData.phoneNumber) {
      return {
        success: false,
        error: 'SMS 2FA is not enabled for this account',
      };
    }
    // Check rate limiting
    const rateLimitKey = 'REDACTED';
    const lastSent = await this.redis.get(rateLimitKey);
    if (lastSent) {
      return {
        success: false,
        error: 'Please wait before requesting another SMS code',
      };
    }
    // Generate and send code
    const code = crypto.randomInt(100000, 999999).toString();
    const smsSent = await this.sendSMS(userData.phoneNumber, code);
    if (!smsSent) {
      return {
        success: false,
        error: 'Failed to send SMS code',
      };
    }
    // Store code temporarily
    const codeKey = 'REDACTED';
    await this.redis.setex(codeKey, 300, code); // 5 minutes
    // Set rate limit
    await this.redis.setex(rateLimitKey, 60, Date.now().toString()); // 1 minute
    return { success: true };
  }
  /**
   * Get 2FA recovery info for account recovery
   */
  async getRecoveryInfo(_userId) {
    const userKey = 'REDACTED';
    const userData = await this.redis.hgetall(userKey);
    const backupCodes = userData.backupCodes
      ? JSON.parse(userData.backupCodes)
      : [];
    const methods = [];
    if (userData.secret) {
      methods.push('TOTP App');
    }
    if (userData.smsEnabled) {
      methods.push('SMS');
    }
    if (userData.emailEnabled) {
      methods.push('Email');
    }
    return {
      hasBackupCodes: backupCodes.length > 0,
      backupCodesCount: backupCodes.length,
      methods,
    };
  }
  /**
   * Generate backup codes
   */
  generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < this.config.backupCodesCount; i++) {
      // Generate 8-character alphanumeric codes
      const code = crypto.randomBytes(4).toString('hex').toLowerCase();
      codes.push(code);
    }
    return codes;
  }
  /**
   * Send SMS (implement with your preferred SMS provider)
   */
  async sendSMS(phoneNumber, code) {
    // Placeholder implementation
    // In production, integrate with Twilio, AWS SNS, or other SMS provider
    console.log(
      `SMS to ${phoneNumber}: Your Ectropy verification code is: ${code}`
    );
    // Simulate SMS sending delay
    await new Promise((resolve) => setTimeout(resolve, 100));
    return true; // Return false if SMS fails
  }
  /**
   * Log security events
   */
  async logSecurityEvent(_userId, event, data) {
    const logEntry = {
      _userId,
      event,
      timestamp: new Date().toISOString(),
      ...data,
    };
    await this.redis.zadd(
      `2fa_events:${userId}`,
      Date.now(),
      JSON.stringify(logEntry)
    );
    // Keep only last 100 events per user
    await this.redis.zremrangebyrank(`2fa_events:${userId}`, 0, -101);
  }
  /**
   * Notify user about low backup codes
   */
  async notifyLowBackupCodes(_userId, remaining) {
    // Store notification for user dashboard
    const notification = {
      type: 'low_backup_codes',
      message: `You have only ${remaining} backup codes remaining. Consider generating new ones.`,
      severity: 'warning',
      timestamp: new Date().toISOString(),
    };
    await this.redis.zadd(
      `notifications:${userId}`,
      Date.now(),
      JSON.stringify(notification)
    );
  }
  /**
   * Get user's 2FA events log
   */
  async getUserEvents(_userId, limit = 50) {
    const events = await this.redis.zrevrange(
      `2fa_events:${userId}`,
      0,
      limit - 1,
      'WITHSCORES'
    );
    const result = [];
    for (let i = 0; i < events.length; i += 2) {
      const event = JSON.parse(events[i]);
      const timestamp = parseInt(events[i + 1]);
      result.push({ ...event, timestamp: new Date(timestamp) });
    }
    return result;
  }
  /**
   * Clean up expired setup attempts and codes
   */
  async cleanup() {
    // This would be called periodically to clean up Redis
    // console.log('2FA cleanup completed');
  }
}
//# sourceMappingURL=two-factor-auth.js.map
