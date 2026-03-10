/**
 * Enhanced Password Security Policy for Ectropy Platform
 * Commercial-grade password requirements and validation
 */
import bcrypt from 'bcryptjs';
import { z } from 'zod';
// Production password policy configuration
const DEFAULT_POLICY = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: true,
  preventCommonPasswords: true,
  preventUserInfoInPassword: true,
  maxConsecutiveChars: 3,
  maxRepeatingChars: 3,
};
// Common passwords blacklist (subset for demo - production should use larger list)
const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  '123456',
  '123456789',
  'qwerty',
  'abc123',
  'letmein',
  'monkey',
  '1234567890',
  'dragon',
  'master',
  'admin',
  'welcome',
  'login',
  'passw0rd',
  'Password123',
  'password1',
  'test',
  'demo',
  'guest',
  'user',
  'root',
  'administrator',
  'changeme',
  'default',
  'temp',
  'temporary',
  'ectropy',
  'construction',
]);
export class PasswordSecurityPolicy {
  constructor(customPolicy) {
    this.policy = { ...DEFAULT_POLICY, ...customPolicy };
  }
  /**
   * Validate password against security policy
   */
  validatePassword(password, userInfo) {
    const requirements = {
      length:
        password.length >= this.policy.minLength &&
        password.length <= this.policy.maxLength,
      uppercase: this.policy.requireUppercase ? /[A-Z]/.test(password) : true,
      lowercase: this.policy.requireLowercase ? /[a-z]/.test(password) : true,
      numbers: this.policy.requireNumbers ? /\d/.test(password) : true,
      symbols: this.policy.requireSymbols
        ? /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
        : true,
      noCommonWords: this.policy.preventCommonPasswords
        ? !this.isCommonPassword(password)
        : true,
      noUserInfo: this.policy.preventUserInfoInPassword
        ? !this.containsUserInfo(password, userInfo)
        : true,
    };
    const feedback = [];
    let score = 0;
    // Length check
    if (!requirements.length) {
      feedback.push(
        `Password must be between ${this.policy.minLength} and ${this.policy.maxLength} characters`
      );
    } else {
      score += 20;
    }
    // Character type checks
    if (!requirements.uppercase) {
      feedback.push('Password must contain at least one uppercase letter');
    } else {
      score += 15;
    }
    if (!requirements.lowercase) {
      feedback.push('Password must contain at least one lowercase letter');
    } else {
      score += 15;
    }
    if (!requirements.numbers) {
      feedback.push('Password must contain at least one number');
    } else {
      score += 15;
    }
    if (!requirements.symbols) {
      feedback.push('Password must contain at least one special character');
    } else {
      score += 15;
    }
    // Advanced checks
    if (!requirements.noCommonWords) {
      feedback.push(
        'Password is too common. Please choose a more unique password'
      );
    } else {
      score += 10;
    }
    if (!requirements.noUserInfo) {
      feedback.push('Password must not contain your email, name, or username');
    } else {
      score += 10;
    }
    // Additional complexity checks
    if (this.hasConsecutiveChars(password)) {
      feedback.push(
        `Password must not contain more than ${this.policy.maxConsecutiveChars} consecutive characters`
      );
    } else {
      score += 5;
    }
    if (this.hasRepeatingChars(password)) {
      feedback.push(
        `Password must not contain more than ${this.policy.maxRepeatingChars} repeating characters`
      );
    } else {
      score += 5;
    }
    // Entropy bonus
    const entropyScore = this.calculateEntropy(password);
    score += Math.min(entropyScore / 10, 10); // Max 10 bonus points
    const isValid =
      Object.values(requirements).every((req) => req) &&
      !this.hasConsecutiveChars(password) &&
      !this.hasRepeatingChars(password);
    return {
      score: Math.min(score, 100),
      requirements,
      feedback,
      isValid,
    };
  }
  /**
   * Hash password securely with salt
   */
  async hashPassword(password) {
    const saltRounds = 14; // Higher than default for enhanced security
    return bcrypt.hash(password, saltRounds);
  }
  /**
   * Verify password against hash
   */
  async verifyPassword(password, hash) {
    try {
      return await bcrypt.compare(password, hash);
    } catch (_error) {
      // console.error('Password verification error:', error);
      return false;
    }
  }
  /**
   * Generate secure random password
   */
  generateSecurePassword(length = 16) {
    const charset = {
      uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      lowercase: 'abcdefghijklmnopqrstuvwxyz',
      numbers: '0123456789',
      symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
    };
    let password = 'REDACTED';
    const allChars = Object.values(charset).join('');
    // Ensure at least one character from each required set
    if (this.policy.requireUppercase) {
      password += charset.uppercase.charAt(
        Math.floor(Math.random() * charset.uppercase.length)
      );
    }
    if (this.policy.requireLowercase) {
      password += charset.lowercase.charAt(
        Math.floor(Math.random() * charset.lowercase.length)
      );
    }
    if (this.policy.requireNumbers) {
      password += charset.numbers.charAt(
        Math.floor(Math.random() * charset.numbers.length)
      );
    }
    if (this.policy.requireSymbols) {
      password += charset.symbols.charAt(
        Math.floor(Math.random() * charset.symbols.length)
      );
    }
    // Fill remaining length with random characters
    for (let i = password.length; i < length; i++) {
      password += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }
    // Shuffle the password
    return password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
  }
  /**
   * Check if password is in common passwords list
   */
  isCommonPassword(password) {
    return COMMON_PASSWORDS.has(password.toLowerCase());
  }
  /**
   * Check if password contains user information
   */
  containsUserInfo(password, userInfo) {
    if (userInfo === null) {
      return false;
    }
    const lowerPassword = 'REDACTED';
    if (userInfo.email) {
      const emailParts = userInfo.email.toLowerCase().split('@');
      if (emailParts[0] && lowerPassword.includes(emailParts[0])) {
        return true;
      }
    }
    if (userInfo.name) {
      const nameParts = userInfo.name.toLowerCase().split(' ');
      for (const part of nameParts) {
        if (part.length > 2 && lowerPassword.includes(part)) {
          return true;
        }
      }
    }
    if (
      userInfo.username &&
      lowerPassword.includes(userInfo.username.toLowerCase())
    ) {
      return true;
    }
    return false;
  }
  /**
   * Check for consecutive characters
   */
  hasConsecutiveChars(password) {
    for (
      let i = 0;
      i < password.length - this.policy.maxConsecutiveChars;
      i++
    ) {
      let consecutive = true;
      for (let j = 1; j <= this.policy.maxConsecutiveChars; j++) {
        if (password.charCodeAt(i + j) !== password.charCodeAt(i) + j) {
          consecutive = false;
          break;
        }
      }
      if (consecutive) {
        return true;
      }
    }
    return false;
  }
  /**
   * Check for repeating characters
   */
  hasRepeatingChars(password) {
    for (let i = 0; i < password.length - this.policy.maxRepeatingChars; i++) {
      const char = password[i];
      let count = 1;
      for (let j = i + 1; j < password.length && password[j] === char; j++) {
        count++;
        if (count > this.policy.maxRepeatingChars) {
          return true;
        }
      }
    }
    return false;
  }
  /**
   * Calculate password entropy
   */
  calculateEntropy(password) {
    const charSets = {
      lowercase: /[a-z]/.test(password) ? 26 : 0,
      uppercase: /[A-Z]/.test(password) ? 26 : 0,
      numbers: /\d/.test(password) ? 10 : 0,
      symbols: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) ? 32 : 0,
    };
    const poolSize = Object.values(charSets).reduce(
      (sum, size) => sum + size,
      0
    );
    return Math.log2(Math.pow(poolSize, password.length));
  }
  /**
   * Get policy configuration
   */
  getPolicy() {
    return { ...this.policy };
  }
  /**
   * Update policy configuration
   */
  updatePolicy(updates) {
    this.policy = { ...this.policy, ...updates };
  }
}
// Zod schema for password validation
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters long')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/\d/, 'Password must contain at least one number')
  .regex(
    /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
    'Password must contain at least one special character'
  );
// Export default instance
export const passwordPolicy = new PasswordSecurityPolicy();
//# sourceMappingURL=password-policy.js.map
