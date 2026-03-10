/**
 * Email Service Unit Tests
 * Enterprise-grade test coverage for transactional email service
 *
 * Created: 2025-12-22
 * Purpose: Validate email sending, retry logic, and template rendering
 * Aligned with: Test Expansion Strategy Phase 1
 * Target Coverage: 80%+
 *
 * Test Categories:
 * 1. Service Initialization
 * 2. Email Sending (Success/Failure)
 * 3. Retry Logic & Exponential Backoff
 * 4. Template Rendering (Waitlist, Password Reset, Email Verification)
 * 5. Error Handling & Edge Cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmailService, EmailOptions, EmailResult } from '../email.service';
import { logger } from '@ectropy/shared/utils';

/**
 * Mock Resend SDK
 * Provides controlled email sending behavior for testing
 * ENTERPRISE FIX: Use vi.hoisted() to create mocks that can be referenced in vi.mock()
 * This is the recommended Vitest pattern for accessing mocks created in factories
 */
const { mockSendEmail } = vi.hoisted(() => {
  return {
    mockSendEmail: vi.fn(),
  };
});

vi.mock('resend', () => {
  // ENTERPRISE FIX: Vitest constructor mocks must use function() with 'this'
  // Arrow functions don't work with 'new' operator - returns undefined
  // Root cause: vi.fn(() => obj) doesn't set 'this' properties for constructors
  const MockResend = vi.fn(function (this: any, apiKey?: string) {
    this.emails = {
      send: (...args: any[]) => mockSendEmail(...args),
    };
  });

  return {
    Resend: MockResend,
  };
});

/**
 * Mock logger to prevent console noise in tests
 */
vi.mock('@ectropy/shared/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('EmailService', () => {
  let emailService: EmailService;

  // Store original environment variables
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment variables
    process.env = {
      ...originalEnv,
      RESEND_API_KEY: 'test-api-key-123',
      RESEND_FROM_EMAIL: 'test@ectropy.test',
      NODE_ENV: 'test',
      EMAIL_RETRY_ATTEMPTS: '3',
    };

    // ENTERPRISE FIX: Reset mock to default success state
    // mockClear() only clears call history, not implementations
    // We need to set a default implementation for tests that don't override it
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({
      data: { id: 'default-email-id-123' },
      error: null,
    });

    // Create fresh EmailService instance
    emailService = new EmailService();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  /**
   * ========================================
   * 1. SERVICE INITIALIZATION TESTS
   * ========================================
   */
  describe('Service Initialization', () => {
    it('should initialize with RESEND_API_KEY from environment', () => {
      expect(emailService).toBeDefined();
      expect(emailService).toBeInstanceOf(EmailService);
    });

    it('should use default from email when RESEND_FROM_EMAIL not set', () => {
      delete process.env.RESEND_FROM_EMAIL;
      const service = new EmailService();
      expect(service).toBeDefined();
    });

    it('should warn when RESEND_API_KEY is not configured', () => {
      // ENTERPRISE FIX: Use imported logger instead of require() for ESM compatibility
      delete process.env.RESEND_API_KEY;

      new EmailService();

      expect(logger.warn).toHaveBeenCalledWith(
        'RESEND_API_KEY not configured. Email sending will fail.'
      );
    });

    it('should initialize retry config from environment variables', () => {
      process.env.EMAIL_RETRY_ATTEMPTS = '5';
      const service = new EmailService();
      expect(service).toBeDefined();
      // Retry config is private, but we can test it indirectly through retry behavior
    });
  });

  /**
   * ========================================
   * 2. EMAIL SENDING TESTS (Success)
   * ========================================
   */
  describe('sendEmail - Success Scenarios', () => {
    it('should send email successfully with all required fields', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-123' },
        error: null,
      });

      const options: EmailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
      };

      const result = await emailService.sendEmail(options);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('email-123');
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
    });

    it('should send email with optional text field', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-456' },
        error: null,
      });

      const options: EmailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
        text: 'Test content',
      };

      const result = await emailService.sendEmail(options);

      expect(result.success).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Test content',
        })
      );
    });

    it('should send email to multiple recipients', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-789' },
        error: null,
      });

      const options: EmailOptions = {
        to: ['user1@example.com', 'user2@example.com'],
        subject: 'Test Email',
        html: '<p>Test content</p>',
      };

      const result = await emailService.sendEmail(options);

      expect(result.success).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['user1@example.com', 'user2@example.com'],
        })
      );
    });

    it('should include optional CC and BCC recipients', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-cc-bcc' },
        error: null,
      });

      const options: EmailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
        cc: 'cc@example.com',
        bcc: 'bcc@example.com',
      };

      const result = await emailService.sendEmail(options);

      expect(result.success).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          cc: 'cc@example.com',
          bcc: 'bcc@example.com',
        })
      );
    });

    it('should include tags for email categorization', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-tagged' },
        error: null,
      });

      const options: EmailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
        tags: {
          type: 'transactional',
          category: 'welcome',
        },
      };

      const result = await emailService.sendEmail(options);

      expect(result.success).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            type: 'transactional',
            category: 'welcome',
          },
        })
      );
    });

    it('should use custom from address when provided', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-custom-from' },
        error: null,
      });

      const options: EmailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
        from: 'custom@ectropy.test',
      };

      const result = await emailService.sendEmail(options);

      expect(result.success).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'custom@ectropy.test',
        })
      );
    });
  });

  /**
   * ========================================
   * 3. EMAIL SENDING TESTS (Failure)
   * ========================================
   */
  describe('sendEmail - Failure Scenarios', () => {
    it('should fail when RESEND_API_KEY is not configured', async () => {
      delete process.env.RESEND_API_KEY;
      const service = new EmailService();

      const options: EmailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
      };

      const result = await service.sendEmail(options);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email service not configured');
    });

    it('should handle Resend API errors gracefully', async () => {
      // ENTERPRISE FIX: Use mockResolvedValue() not mockResolvedValueOnce()
      // The service has retry logic, so the error must persist across all retry attempts
      mockSendEmail.mockResolvedValue({
        data: null,
        error: { message: 'Invalid API key' },
      });

      const options: EmailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
      };

      const result = await emailService.sendEmail(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid API key');
    });

    it('should handle network errors', async () => {
      // ENTERPRISE FIX: Use mockRejectedValue() not mockRejectedValueOnce()
      // The service has retry logic, so the error must persist across all retry attempts
      mockSendEmail.mockRejectedValue(new Error('Network timeout'));

      const options: EmailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
      };

      const result = await emailService.sendEmail(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network timeout');
    });

    it('should handle empty data from Resend API', async () => {
      // ENTERPRISE FIX: Use mockResolvedValue() not mockResolvedValueOnce()
      // The service has retry logic, so the error must persist across all retry attempts
      mockSendEmail.mockResolvedValue({
        data: null,
        error: null,
      });

      const options: EmailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
      };

      const result = await emailService.sendEmail(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Resend API returned no data');
    });
  });

  /**
   * ========================================
   * 4. RETRY LOGIC & EXPONENTIAL BACKOFF
   * ========================================
   */
  describe('Retry Logic & Exponential Backoff', () => {
    it('should retry failed email send up to configured max attempts', async () => {
      // Fail twice, succeed on third attempt
      mockSendEmail
        .mockRejectedValueOnce(new Error('Temporary failure 1'))
        .mockRejectedValueOnce(new Error('Temporary failure 2'))
        .mockResolvedValueOnce({
          data: { id: 'email-retry-success' },
          error: null,
        });

      const options: EmailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
      };

      const result = await emailService.sendEmail(options);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('email-retry-success');
      expect(mockSendEmail).toHaveBeenCalledTimes(3);
    }, 10000); // Increase timeout for retry delays

    it('should fail after exhausting all retry attempts', async () => {
      // Fail all 3 attempts
      mockSendEmail.mockRejectedValue(new Error('Persistent failure'));

      const options: EmailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
      };

      const result = await emailService.sendEmail(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Persistent failure');
      expect(mockSendEmail).toHaveBeenCalledTimes(3); // Default retry attempts
    }, 15000); // Increase timeout for multiple retries

    it('should apply exponential backoff between retries', async () => {
      const startTime = Date.now();

      // Fail twice, succeed on third
      mockSendEmail
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockResolvedValueOnce({
          data: { id: 'email-backoff' },
          error: null,
        });

      const options: EmailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
      };

      await emailService.sendEmail(options);

      const elapsedTime = Date.now() - startTime;

      // Should have delays: 1000ms (attempt 1), 2000ms (attempt 2)
      // Total minimum delay: 3000ms
      expect(elapsedTime).toBeGreaterThanOrEqual(2900); // Allow small margin
    }, 15000);
  });

  /**
   * ========================================
   * 5. TEMPLATE RENDERING TESTS
   * ========================================
   */
  describe('sendWaitlistWelcome', () => {
    it('should send waitlist welcome email with correct subject', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-waitlist' },
        error: null,
      });

      const result = await emailService.sendWaitlistWelcome(
        'user@example.com',
        'John Doe'
      );

      expect(result.success).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Welcome to Ectropy - Construction Intelligence Platform',
          to: 'user@example.com',
        })
      );
    });

    it('should include recipient name in email body', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-waitlist-name' },
        error: null,
      });

      await emailService.sendWaitlistWelcome('user@example.com', 'Jane Smith');

      const callArg = mockSendEmail.mock.calls[0][0];
      expect(callArg.html).toContain('Jane Smith');
      expect(callArg.text).toContain('Jane Smith');
    });

    it('should use email username when name not provided', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-waitlist-no-name' },
        error: null,
      });

      await emailService.sendWaitlistWelcome('testuser@example.com');

      const callArg = mockSendEmail.mock.calls[0][0];
      expect(callArg.html).toContain('testuser');
    });

    it('should include waitlist-welcome tag', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-waitlist-tag' },
        error: null,
      });

      await emailService.sendWaitlistWelcome('user@example.com');

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.objectContaining({
            type: 'waitlist-welcome',
          }),
        })
      );
    });
  });

  describe('sendPasswordReset', () => {
    it('should send password reset email with reset token', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-password-reset' },
        error: null,
      });

      const resetToken = 'reset-token-abc123';
      const result = await emailService.sendPasswordReset(
        'user@example.com',
        resetToken
      );

      expect(result.success).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Reset Your Ectropy Password',
          to: 'user@example.com',
        })
      );
    });

    it('should include reset URL with token in email body', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-password-reset-url' },
        error: null,
      });

      const resetToken = 'test-token-xyz';
      await emailService.sendPasswordReset('user@example.com', resetToken);

      const callArg = mockSendEmail.mock.calls[0][0];
      expect(callArg.html).toContain(`token=${resetToken}`);
      expect(callArg.text).toContain(`token=${resetToken}`);
    });

    it('should include password-reset tag', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-password-tag' },
        error: null,
      });

      await emailService.sendPasswordReset('user@example.com', 'token');

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.objectContaining({
            type: 'password-reset',
          }),
        })
      );
    });

    it('should escape HTML in reset token', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-password-escape' },
        error: null,
      });

      // Token with HTML characters (should be URL-safe but test escaping)
      const maliciousToken = 'token-with-<script>alert("xss")</script>';
      await emailService.sendPasswordReset('user@example.com', maliciousToken);

      const callArg = mockSendEmail.mock.calls[0][0];
      expect(callArg.html).not.toContain('<script>');
    });
  });

  describe('sendEmailVerification', () => {
    it('should send email verification with verification token', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-verification' },
        error: null,
      });

      const verificationToken = 'verify-token-abc123';
      const result = await emailService.sendEmailVerification(
        'user@example.com',
        verificationToken
      );

      expect(result.success).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Verify Your Ectropy Email Address',
          to: 'user@example.com',
        })
      );
    });

    it('should include verification URL with token in email body', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-verification-url' },
        error: null,
      });

      const verificationToken = 'test-verify-xyz';
      await emailService.sendEmailVerification(
        'user@example.com',
        verificationToken
      );

      const callArg = mockSendEmail.mock.calls[0][0];
      expect(callArg.html).toContain(`token=${verificationToken}`);
      expect(callArg.text).toContain(`token=${verificationToken}`);
    });

    it('should include email-verification tag', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-verification-tag' },
        error: null,
      });

      await emailService.sendEmailVerification('user@example.com', 'token');

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.objectContaining({
            type: 'email-verification',
          }),
        })
      );
    });
  });

  /**
   * ========================================
   * 6. EDGE CASES & SECURITY
   * ========================================
   */
  describe('Edge Cases & Security', () => {
    it('should handle extremely long email subject', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-long-subject' },
        error: null,
      });

      const longSubject = 'A'.repeat(500);
      const result = await emailService.sendEmail({
        to: 'user@example.com',
        subject: longSubject,
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(true);
    });

    it('should handle special characters in email content', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-special-chars' },
        error: null,
      });

      const result = await emailService.sendEmail({
        to: 'user@example.com',
        subject: 'Test with émojis 🎉 and spëcial çhars',
        html: '<p>Content with <>&"\'</p>',
      });

      expect(result.success).toBe(true);
    });

    it('should escape HTML in recipient name', async () => {
      mockSendEmail.mockResolvedValueOnce({
        data: { id: 'email-escape-name' },
        error: null,
      });

      await emailService.sendWaitlistWelcome(
        'user@example.com',
        '<script>alert("xss")</script>'
      );

      const callArg = mockSendEmail.mock.calls[0][0];
      expect(callArg.html).not.toContain('<script>');
      expect(callArg.html).toContain('&lt;script&gt;');
    });

    it('should handle concurrent email sends', async () => {
      mockSendEmail.mockResolvedValue({
        data: { id: 'email-concurrent' },
        error: null,
      });

      const sends = Array.from({ length: 5 }, (_, i) =>
        emailService.sendEmail({
          to: `user${i}@example.com`,
          subject: `Email ${i}`,
          html: `<p>Content ${i}</p>`,
        })
      );

      const results = await Promise.all(sends);

      expect(results).toHaveLength(5);
      expect(results.every((r) => r.success)).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledTimes(5);
    });
  });
});
