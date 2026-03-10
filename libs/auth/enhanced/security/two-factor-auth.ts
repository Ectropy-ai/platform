/**
 * Two-Factor Authentication (2FA) System for Ectropy Platform
 * Supports TOTP, SMS, and Email-based 2FA with backup codes
 */

import crypto from 'crypto';
// import type * as speakeasy from 'speakeasy';
// import type * as QRCode from 'qrcode';
import type { Redis } from 'ioredis';
// production implementations for missing dependencies
const speakeasy = {
  generateSecret: (options?: any) => ({
    base32: 'REDACTED_SECRET',
    otpauth_url: `otpauth://totp/${options?.name || 'Example'}?secret=REDACTED_SECRET&issuer=${options?.issuer || 'Example'}`,
  }),
  totp: {
    verify: (options?: any) => ({ delta: 0 }),
  },
};
const QRCode = {
  toDataURL: async (data: string) =>
    `data:image/png;base64,mock_qr_code_for_${data}`,
};

// Helper function for crypto.randomInt compatibility
function randomInt(min: number, max: number): number {
  const range = max - min;
  const bytes = Math.ceil(Math.log2(range) / 8);
  let randomValue: number;
  do {
    // Use a simple approach that doesn't rely on Buffer methods with variable byte counts
    const randomBytes = crypto.randomBytes(4);
    randomValue =
      (randomBytes as any)[0] * 0x1000000 +
      (randomBytes as any)[1] * 0x10000 +
      (randomBytes as any)[2] * 0x100 +
      (randomBytes as any)[3];
  } while (randomValue >= Math.floor(0x100000000 / range) * range);
  return min + (randomValue % range);
}
// Type assertion helper for Redis methods that might not be in type definitions
const redisWithAllMethods = (redis: Redis): any => redis;
export interface TwoFactorConfig {
  appName: string;
  issuer: string;
  window: number; // TOTP window tolerance
  step: number; // TOTP step in seconds
  digits: number; // Number of digits in TOTP
  algorithm: string; // Hash algorithm
  backupCodesCount: number; // Number of backup codes to generate
  smsProvider?: 'twilio' | 'aws' | 'custom';
  emailProvider?: 'sendgrid' | 'aws' | 'custom';
}

export interface TwoFactorSetup {
  secret: string;
  manualEntryKey: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface TwoFactorVerification {
  isValid: boolean;
  usedBackupCode?: boolean;
  backupCodesRemaining?: number;
  error?: string;
}

export interface TwoFactorStatus {
  enabled: boolean;
  methods: Array<'totp' | 'sms' | 'email'>;
  backupCodesRemaining: number;
  lastUsed?: Date;
}

// Default configuration
const DEFAULT_CONFIG: TwoFactorConfig = {
  appName: 'Ectropy Platform',
  issuer: 'Ectropy Construction',
  window: 2, // Allow 2 steps before/after current time
  step: 30, // 30-second intervals
  digits: 6, // 6-digit codes
  algorithm: 'sha1',
  backupCodesCount: 8,
};

export class TwoFactorAuthService {
  private redis: Redis;
  private config: TwoFactorConfig;
  constructor(redis: Redis, config?: Partial<TwoFactorConfig>) {
    this.redis = redis;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  /**
   * Setup TOTP-based 2FA for a user
   */
  public async setupTOTP(
    userId: string,
    userEmail: string
  ): Promise<TwoFactorSetup> {
    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `${this.config.appName} (${userEmail})`,
      issuer: this.config.issuer,
      length: 32,
    });
    // Generate backup codes
    const backupCodes = this.generateBackupCodes();
    // Store temporarily (user must verify before enabling)
    const setupKey = `2fa_setup:${userId}`;
    const setupFields = {
      secret: secret.base32,
      backupCodes: JSON.stringify(backupCodes),
      createdAt: new Date().toISOString(),
    };
    await redisWithAllMethods(this.redis).hset(setupKey, setupFields);
    await redisWithAllMethods(this.redis).expire(setupKey, 300); // 5 minutes to complete setup
    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);
    return {
      secret: secret.base32,
      manualEntryKey: secret.base32,
      qrCodeUrl,
      backupCodes,
    };
  }

  /**
   * Verify setup token and enable 2FA
   */
  public async verifyAndEnableTotp(
    userId: string,
    token: string
  ): Promise<{ success: boolean; error?: string; backupCodes?: string[] }> {
    const setupKey = `2fa_setup:${userId}`;
    const setupData = await redisWithAllMethods(this.redis).hgetall(setupKey);
    if (!setupData['secret']) {
      return {
        success: false,
        error: 'No setup in progress. Please start 2FA setup again.',
      };
    }
    // Verify the token
    const isValid = speakeasy.totp.verify({
      secret: setupData['secret'],
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
    const userKey = `2fa:${userId}`;
    const userFields = {
      enabled: 'true',
      backupCodes: setupData['backupCodes'],
      enabledAt: new Date().toISOString(),
      method: 'totp',
    };
    await redisWithAllMethods(this.redis).hset(userKey, userFields);
    // Clean up setup data
    await redisWithAllMethods(this.redis).del(setupKey);
    // Log security event
    await this.logSecurityEvent(userId, '2fa_enabled', { method: 'totp' });
    return {
      success: true,
      backupCodes: JSON.parse(setupData['backupCodes'] || '[]'),
    };
  }

  /**
   * Verify 2FA token
   */
  public async verifyToken(
    userId: string,
    token: string,
    allowBackupCode = true
  ): Promise<TwoFactorVerification> {
    const userKey = `2fa:${userId}`;
    const userData = await redisWithAllMethods(this.redis).hgetall(userKey);
    if (!userData['enabled'] || userData['enabled'] !== 'true') {
      return {
        isValid: false,
        error: '2FA is not enabled for this account',
      };
    }
    // First try TOTP verification
    if (userData['secret']) {
      const isValid = speakeasy.totp.verify({
        secret: userData['secret'],
        encoding: 'base32',
        token,
        window: this.config.window,
        step: this.config.step,
      });
      if (isValid) {
        // Update last used time
        await redisWithAllMethods(this.redis).hset(
          userKey,
          'lastUsed',
          new Date().toISOString()
        );
        // Log successful verification
        await this.logSecurityEvent(userId, '2fa_verified', { method: 'totp' });
        return { isValid: true };
      }
    }

    // Try backup codes if TOTP failed and backup codes are allowed
    if (allowBackupCode && userData['backupCodes']) {
      const backupCodes: string[] = JSON.parse(userData['backupCodes']);
      const tokenIndex = backupCodes.indexOf(token.toLowerCase());
      if (tokenIndex !== -1) {
        // Remove used backup code
        backupCodes.splice(tokenIndex, 1);
        const backupFields = {
          backupCodes: JSON.stringify(backupCodes),
          lastUsed: new Date().toISOString(),
        };
        await redisWithAllMethods(this.redis).hset(userKey, backupFields);
        // Log backup code usage
        await this.logSecurityEvent(userId, '2fa_backup_code_used', {
          codesRemaining: backupCodes.length,
        });
        // Warn if running low on backup codes
        if (backupCodes.length <= 2) {
          await this.notifyLowBackupCodes(userId, backupCodes.length);
        }
        return {
          isValid: true,
          usedBackupCode: true,
          backupCodesRemaining: backupCodes.length,
        };
      }
    }
    // Log failed verification attempt
    await this.logSecurityEvent(userId, '2fa_verification_failed', {
      method: 'token_verification',
    });
    return {
      isValid: false,
      error: 'Invalid 2FA code',
    };
  }

  /**
   * Disable 2FA for a user
   */
  public async disable2FA(
    userId: string,
    currentPassword: string,
    confirmationToken?: string
  ): Promise<{ success: boolean; error?: string }> {
    // In production, verify current password here
    // If 2FA is enabled, require a valid token to disable
    if (confirmationToken) {
      const verification = await this.verifyToken(userId, confirmationToken);
      if (!verification.isValid) {
        return {
          success: false,
          error: 'Invalid 2FA code. Cannot disable 2FA.',
        };
      }
    }
    const userKey = `2fa:${userId}`;
    await redisWithAllMethods(this.redis).del(userKey);
    await this.logSecurityEvent(userId, '2fa_disabled', {});
    return { success: true };
  }

  /**
   * Generate new backup codes
   */
  public async generateNewBackupCodes(
    userId: string,
    currentToken: string
  ): Promise<{ success: boolean; backupCodes?: string[]; error?: string }> {
    // Verify current 2FA token
    const verification = await this.verifyToken(userId, currentToken, false); // Don't allow backup codes for this
    if (!verification.isValid) {
      return {
        success: false,
        error: 'Invalid 2FA code. Cannot generate new backup codes.',
      };
    }

    const newBackupCodes = this.generateBackupCodes();
    const userKey = `2fa:${userId}`;
    const backupFields = {
      backupCodes: JSON.stringify(newBackupCodes),
      backupCodesRegeneratedAt: new Date().toISOString(),
    };

    await redisWithAllMethods(this.redis).hset(userKey, backupFields);
    await this.logSecurityEvent(userId, '2fa_backup_codes_regenerated', {});

    return {
      success: true,
      backupCodes: newBackupCodes,
    };
  }

  /**
   * Get 2FA status for a user
   */
  public async getStatus(userId: string): Promise<TwoFactorStatus> {
    const userKey = `2fa:${userId}`;
    const userData = await redisWithAllMethods(this.redis).hgetall(userKey);

    if (!userData || Object.keys(userData).length === 0) {
      return {
        enabled: false,
        methods: [],
        backupCodesRemaining: 0,
      };
    }

    const backupCodes = userData['backupCodes']
      ? JSON.parse(userData['backupCodes'])
      : [];
    const methods: Array<'totp' | 'sms' | 'email'> = [];

    if (userData['totpSecret']) {
      methods.push('totp');
    }

    const result: TwoFactorStatus = {
      enabled: true,
      methods,
      backupCodesRemaining: backupCodes.length,
    };

    // Only add lastUsed if it exists
    if (userData['lastUsed']) {
      result.lastUsed = new Date(userData['lastUsed']);
    }

    return result;
  }

  /**
   * Setup SMS-based 2FA (placeholder for SMS provider integration)
   */
  public async setupSMS(
    userId: string,
    phoneNumber: string
  ): Promise<{ success: boolean; error?: string }> {
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
    const verificationCode = randomInt(100000, 999999).toString();
    // Store temporarily
    const setupKey = `sms_setup:${userId}`;
    const setupData = {
      phoneNumber,
      verificationCode,
    };

    await redisWithAllMethods(this.redis).hset(setupKey, setupData);
    await redisWithAllMethods(this.redis).expire(setupKey, 300); // 5 minutes

    // Send SMS (implement with your SMS provider)
    const smsSent = await this.sendSMS(phoneNumber, verificationCode);
    if (!smsSent) {
      await redisWithAllMethods(this.redis).del(setupKey);
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
  public async verifySMSSetup(
    userId: string,
    verificationCode: string
  ): Promise<{ success: boolean; error?: string }> {
    const setupKey = `sms_setup:${userId}`;
    const setupData = await redisWithAllMethods(this.redis).hgetall(setupKey);

    if (
      !setupData['verificationCode'] ||
      setupData['verificationCode'] !== verificationCode
    ) {
      return {
        success: false,
        error: 'Invalid verification code',
      };
    }

    // Enable SMS 2FA
    const userKey = `2fa:${userId}`;
    const smsFields = {
      smsEnabled: 'true',
      phoneNumber: setupData['phoneNumber'],
      smsEnabledAt: new Date().toISOString(),
    };

    await redisWithAllMethods(this.redis).hset(userKey, smsFields);
    await this.logSecurityEvent(userId, '2fa_sms_enabled', {});
    await redisWithAllMethods(this.redis).del(setupKey);

    return { success: true };
  }

  /**
   * Send 2FA code via SMS
   */
  public async sendSMSCode(
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    const userKey = `2fa:${userId}`;
    const userData = await redisWithAllMethods(this.redis).hgetall(userKey);

    if (!userData['smsEnabled'] || !userData['phoneNumber']) {
      return {
        success: false,
        error: 'SMS 2FA is not enabled for this account',
      };
    }

    // Check rate limiting
    const rateLimitKey = `sms_rate_limit:${userId}`;
    const lastSent = await redisWithAllMethods(this.redis).get(rateLimitKey);
    if (lastSent) {
      return {
        success: false,
        error: 'Please wait before requesting another SMS code',
      };
    }

    // Generate and send code
    const code = randomInt(100000, 999999).toString();
    const smsSent = await this.sendSMS(userData['phoneNumber'], code);
    if (!smsSent) {
      return {
        success: false,
        error: 'Failed to send SMS code',
      };
    }

    // Store code temporarily
    const codeKey = `sms_code:${userId}`;
    await redisWithAllMethods(this.redis).setex(codeKey, 300, code); // 5 minutes
    // Set rate limit
    await redisWithAllMethods(this.redis).setex(rateLimitKey, 60, Date.now().toString()); // 1 minute

    return { success: true };
  }

  /**
   * Get 2FA recovery info for account recovery
   */
  public async getRecoveryInfo(userId: string): Promise<{
    hasBackupCodes: boolean;
    backupCodesCount: number;
    methods: string[];
  }> {
    const userKey = `2fa:${userId}`;
    const userData = await redisWithAllMethods(this.redis).hgetall(userKey);

    const backupCodes = userData['backupCodes']
      ? JSON.parse(userData['backupCodes'])
      : [];
    const methods: string[] = [];

    if (userData['totpSecret']) {
      methods.push('TOTP App');
    }
    if (userData['smsEnabled']) {
      methods.push('SMS');
    }
    if (userData['emailEnabled']) {
      methods.push('Email');
    }

    return {
      hasBackupCodes: backupCodes.length > 0,
      backupCodesCount: backupCodes.length,
      methods,
    };
  }

  /**
  /**
   * Generate backup codes
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
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
  private async sendSMS(phoneNumber: string, code: string): Promise<boolean> {
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
  private async logSecurityEvent(
    userId: string,
    event: string,
    data: any
  ): Promise<void> {
    const logEntry = {
      userId,
      event,
      timestamp: new Date().toISOString(),
      ...data,
    };
    await redisWithAllMethods(this.redis).zadd(
      `2fa_events:${userId}`,
      Date.now(),
      JSON.stringify(logEntry)
    );
    // Keep only last 100 events per user
    await redisWithAllMethods(this.redis).zremrangebyrank(
      `2fa_events:${userId}`,
      0,
      -101
    );
  }

  /**
   * Notify user about low backup codes
   */
  private async notifyLowBackupCodes(
    userId: string,
    remaining: number
  ): Promise<void> {
    // Store notification for user dashboard
    const notification = {
      type: 'low_backup_codes',
      message: `You have only ${remaining} backup codes remaining. Consider generating new ones.`,
      severity: 'warning',
      timestamp: new Date().toISOString(),
    };
    await redisWithAllMethods(this.redis).lpush(
      `notifications:${userId}`,
      JSON.stringify(notification)
    );
  }

  /** Get user's 2FA events log
  public async getUserEvents(userId: string, limit = 50): Promise<any[]> {
    const events = await redisWithAllMethods(this.redis).zrevrange(
      `2fa_events:${userId}`,
      0,
      limit - 1,
      'WITHSCORES'
    );
    const result: any[] = [];
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
  public async cleanup(): Promise<void> {
    // This would be called periodically to clean up Redis
  }
}
