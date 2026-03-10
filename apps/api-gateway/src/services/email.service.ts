/**
 * Enterprise Email Service - Resend Integration
 *
 * Provides transactional email functionality for the Ectropy platform using Resend.
 *
 * Features:
 * - Retry logic with exponential backoff
 * - Structured error logging
 * - Template management
 * - Rate limiting protection
 * - Environment-based configuration
 *
 * @module EmailService
 */

import { Resend } from 'resend';
import { logger } from '@ectropy/shared/utils';

/**
 * Email send options
 */
export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  tags?: Record<string, string>;
}

/**
 * Email send result
 */
export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Retry configuration
 */
interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Enterprise Email Service
 *
 * Handles all transactional email sending for the Ectropy platform.
 * Implements retry logic, error handling, and structured logging.
 */
export class EmailService {
  private resend: Resend;
  private defaultFrom: string;
  private retryConfig: RetryConfig;
  private isProduction: boolean;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      logger.warn('RESEND_API_KEY not configured. Email sending will fail.');
      logger.warn(
        'Set RESEND_API_KEY environment variable to enable email functionality.'
      );
    }

    this.resend = new Resend(apiKey || 'test-key');
    this.defaultFrom = process.env.RESEND_FROM_EMAIL || 'noreply@ectropy.ai';
    this.isProduction = process.env.NODE_ENV === 'production';

    // Enterprise retry configuration
    this.retryConfig = {
      maxAttempts: parseInt(process.env.EMAIL_RETRY_ATTEMPTS || '3', 10),
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
    };

    logger.info('Email service initialized', {
      defaultFrom: this.defaultFrom,
      environment: process.env.NODE_ENV,
      retryEnabled: this.retryConfig.maxAttempts > 1,
    });
  }

  /**
   * Send email with retry logic
   *
   * @param options - Email options
   * @returns Email send result
   */
  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    if (!process.env.RESEND_API_KEY) {
      logger.error('Cannot send email: RESEND_API_KEY not configured');
      return {
        success: false,
        error: 'Email service not configured',
      };
    }

    // ENTERPRISE FIX: Resend SDK requires at least one of: text, html, or react
    // We always provide html, text is optional (Resend auto-generates from html if not provided)
    //
    // Core insight from Resend docs:
    // - "Resend will automatically generate a plain text version from HTML if text not provided"
    // - TypeScript union type requires exact field matching (no undefined values)
    //
    // Solution: Build base payload, conditionally add optional fields
    // This matches Resend's CreateEmailOptions union type exactly
    const basePayload: any = {
      from: options.from || this.defaultFrom,
      to: options.to,
      subject: options.subject,
      html: options.html,
    };

    // Add optional fields only if defined (prevents undefined in payload)
    if (options.text) basePayload.text = options.text;
    if (options.replyTo) basePayload.reply_to = options.replyTo;
    if (options.cc) basePayload.cc = options.cc;
    if (options.bcc) basePayload.bcc = options.bcc;
    if (options.tags) basePayload.tags = options.tags;

    const emailPayload = basePayload;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        logger.info('Sending email', {
          attempt,
          to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
          subject: options.subject,
        });

        const { data, error } = await this.resend.emails.send(emailPayload);

        if (error) {
          throw new Error(
            `Resend API error: ${error.message || JSON.stringify(error)}`
          );
        }

        if (!data) {
          throw new Error('Resend API returned no data');
        }

        logger.info('Email sent successfully', {
          messageId: data.id,
          to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
          subject: options.subject,
        });

        return {
          success: true,
          messageId: data.id,
        };
      } catch (error) {
        lastError = error as Error;

        logger.warn(`Email send attempt ${attempt} failed`, {
          attempt,
          error: lastError.message,
          to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
          subject: options.subject,
        });

        if (attempt < this.retryConfig.maxAttempts) {
          const delay = this.calculateBackoffDelay(attempt);
          logger.info(`Retrying in ${delay}ms...`, { attempt: attempt + 1 });
          await this.sleep(delay);
        }
      }
    }

    // All retries failed
    logger.error('Email send failed after all retries', {
      attempts: this.retryConfig.maxAttempts,
      error: lastError?.message,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
    });

    return {
      success: false,
      error: lastError?.message || 'Unknown error',
    };
  }

  /**
   * Send welcome email to new waitlist signups
   *
   * @param email - Recipient email address
   * @param name - Optional recipient name
   * @returns Email send result
   */
  async sendWaitlistWelcome(
    email: string,
    name?: string
  ): Promise<EmailResult> {
    const displayName = name || email.split('@')[0];

    const html = this.renderWaitlistWelcomeTemplate(displayName);
    const text = this.renderWaitlistWelcomeText(displayName);

    return this.sendEmail({
      to: email,
      subject: 'Welcome to Ectropy - Construction Intelligence Platform',
      html,
      text,
      tags: {
        type: 'waitlist-welcome',
        environment: process.env.NODE_ENV || 'development',
      },
    });
  }

  /**
   * Send password reset email
   *
   * @param email - Recipient email address
   * @param resetToken - Password reset token
   * @returns Email send result
   */
  async sendPasswordReset(
    email: string,
    resetToken: string
  ): Promise<EmailResult> {
    const resetUrl = `${process.env.FRONTEND_URL || 'https://ectropy.ai'}/reset-password?token=${resetToken}`;

    const html = this.renderPasswordResetTemplate(resetUrl);
    const text = this.renderPasswordResetText(resetUrl);

    return this.sendEmail({
      to: email,
      subject: 'Reset Your Ectropy Password',
      html,
      text,
      tags: {
        type: 'password-reset',
        environment: process.env.NODE_ENV || 'development',
      },
    });
  }

  /**
   * Send user invitation email
   *
   * @param email - Recipient email address
   * @param inviterName - Name of the person who invited them
   * @param tenantName - Name of the tenant/organization
   * @param invitationToken - Unique invitation token
   * @param role - Role being assigned
   * @returns Email send result
   */
  async sendUserInvitation(
    email: string,
    inviterName: string,
    tenantName: string,
    invitationToken: string,
    role: string
  ): Promise<EmailResult> {
    const acceptUrl = `${process.env.FRONTEND_URL || 'https://ectropy.ai'}/accept-invitation?token=${invitationToken}`;

    const html = this.renderInvitationTemplate(inviterName, tenantName, acceptUrl, role);
    const text = this.renderInvitationText(inviterName, tenantName, acceptUrl, role);

    return this.sendEmail({
      to: email,
      subject: `You've been invited to join ${tenantName} on Ectropy`,
      html,
      text,
      tags: {
        type: 'user-invitation',
        tenant: tenantName,
        environment: process.env.NODE_ENV || 'development',
      },
    });
  }

  /**
   * Send email verification
   *
   * @param email - Recipient email address
   * @param verificationToken - Email verification token
   * @returns Email send result
   */
  async sendEmailVerification(
    email: string,
    verificationToken: string
  ): Promise<EmailResult> {
    const verifyUrl = `${process.env.FRONTEND_URL || 'https://ectropy.ai'}/verify-email?token=${verificationToken}`;

    const html = this.renderEmailVerificationTemplate(verifyUrl);
    const text = this.renderEmailVerificationText(verifyUrl);

    return this.sendEmail({
      to: email,
      subject: 'Verify Your Ectropy Email Address',
      html,
      text,
      tags: {
        type: 'email-verification',
        environment: process.env.NODE_ENV || 'development',
      },
    });
  }

  /**
   * Calculate exponential backoff delay
   *
   * @param attempt - Current attempt number (1-indexed)
   * @returns Delay in milliseconds
   */
  private calculateBackoffDelay(attempt: number): number {
    const delay =
      this.retryConfig.initialDelayMs *
      Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
    return Math.min(delay, this.retryConfig.maxDelayMs);
  }

  /**
   * Sleep for specified duration
   *
   * @param ms - Duration in milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Render waitlist welcome email HTML template
   *
   * @param name - Recipient name
   * @returns HTML content
   */
  private renderWaitlistWelcomeTemplate(name: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Ectropy</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background-color: #0066cc; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Welcome to Ectropy</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 24px;">
                Hi ${this.escapeHtml(name)},
              </p>

              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 24px;">
                Thank you for joining the Ectropy waitlist! We're building the future of construction intelligence, and we're excited to have you along for the journey.
              </p>

              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 24px;">
                Ectropy is an AI-powered platform that transforms how construction projects are planned, executed, and managed. Our platform provides:
              </p>

              <ul style="margin: 0 0 20px; padding-left: 20px; color: #333333; font-size: 16px; line-height: 24px;">
                <li style="margin-bottom: 10px;">Real-time BIM collaboration and 3D visualization</li>
                <li style="margin-bottom: 10px;">Intelligent schedule forecasting and risk prediction</li>
                <li style="margin-bottom: 10px;">Automated project insights and recommendations</li>
                <li style="margin-bottom: 10px;">Federated data management across stakeholders</li>
              </ul>

              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 24px;">
                We'll keep you updated on our progress and let you know when we're ready to launch.
              </p>

              <p style="margin: 0; color: #333333; font-size: 16px; line-height: 24px;">
                Best regards,<br>
                <strong>The Ectropy Team</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9f9f9; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #666666; font-size: 14px; line-height: 20px;">
                &copy; ${new Date().getFullYear()} Ectropy. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  /**
   * Render waitlist welcome email plain text version
   *
   * @param name - Recipient name
   * @returns Plain text content
   */
  private renderWaitlistWelcomeText(name: string): string {
    return `
Hi ${name},

Thank you for joining the Ectropy waitlist! We're building the future of construction intelligence, and we're excited to have you along for the journey.

Ectropy is an AI-powered platform that transforms how construction projects are planned, executed, and managed. Our platform provides:

- Real-time BIM collaboration and 3D visualization
- Intelligent schedule forecasting and risk prediction
- Automated project insights and recommendations
- Federated data management across stakeholders

We'll keep you updated on our progress and let you know when we're ready to launch.

Best regards,
The Ectropy Team

© ${new Date().getFullYear()} Ectropy. All rights reserved.
    `.trim();
  }

  /**
   * Render password reset email HTML template
   *
   * @param resetUrl - Password reset URL
   * @returns HTML content
   */
  private renderPasswordResetTemplate(resetUrl: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; color: #333333; font-size: 24px; font-weight: 600;">Reset Your Password</h1>

              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 24px;">
                You requested to reset your password. Click the button below to set a new password:
              </p>

              <table role="presentation" style="margin: 30px 0;">
                <tr>
                  <td style="border-radius: 6px; background-color: #0066cc;">
                    <a href="${this.escapeHtml(resetUrl)}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">Reset Password</a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 20px; color: #666666; font-size: 14px; line-height: 20px;">
                Or copy and paste this link into your browser:<br>
                <a href="${this.escapeHtml(resetUrl)}" style="color: #0066cc; word-break: break-all;">${this.escapeHtml(resetUrl)}</a>
              </p>

              <p style="margin: 0; color: #666666; font-size: 14px; line-height: 20px;">
                This link will expire in 24 hours. If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  /**
   * Render password reset email plain text version
   *
   * @param resetUrl - Password reset URL
   * @returns Plain text content
   */
  private renderPasswordResetText(resetUrl: string): string {
    return `
Reset Your Password

You requested to reset your password. Visit the following link to set a new password:

${resetUrl}

This link will expire in 24 hours. If you didn't request this, you can safely ignore this email.
    `.trim();
  }

  /**
   * Render email verification HTML template
   *
   * @param verifyUrl - Email verification URL
   * @returns HTML content
   */
  private renderEmailVerificationTemplate(verifyUrl: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; color: #333333; font-size: 24px; font-weight: 600;">Verify Your Email Address</h1>

              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 24px;">
                Please verify your email address to complete your Ectropy registration:
              </p>

              <table role="presentation" style="margin: 30px 0;">
                <tr>
                  <td style="border-radius: 6px; background-color: #0066cc;">
                    <a href="${this.escapeHtml(verifyUrl)}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">Verify Email</a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 20px; color: #666666; font-size: 14px; line-height: 20px;">
                Or copy and paste this link into your browser:<br>
                <a href="${this.escapeHtml(verifyUrl)}" style="color: #0066cc; word-break: break-all;">${this.escapeHtml(verifyUrl)}</a>
              </p>

              <p style="margin: 0; color: #666666; font-size: 14px; line-height: 20px;">
                This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  /**
   * Render email verification plain text version
   *
   * @param verifyUrl - Email verification URL
   * @returns Plain text content
   */
  private renderEmailVerificationText(verifyUrl: string): string {
    return `
Verify Your Email Address

Please verify your email address to complete your Ectropy registration:

${verifyUrl}

This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
    `.trim();
  }

  /**
   * Render user invitation email HTML template
   */
  private renderInvitationTemplate(inviterName: string, tenantName: string, acceptUrl: string, role: string): string {
    const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' ');
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited to Ectropy</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background-color: #0066cc; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">You're Invited!</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 24px;">
                <strong>${this.escapeHtml(inviterName)}</strong> has invited you to join <strong>${this.escapeHtml(tenantName)}</strong> on Ectropy as a <strong>${this.escapeHtml(roleDisplay)}</strong>.
              </p>

              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 24px;">
                Ectropy is a construction intelligence platform that helps teams collaborate on projects with AI-powered insights, BIM visualization, and automated decision support.
              </p>

              <table role="presentation" style="margin: 30px 0;">
                <tr>
                  <td style="border-radius: 6px; background-color: #0066cc;">
                    <a href="${this.escapeHtml(acceptUrl)}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">Accept Invitation</a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 20px; color: #666666; font-size: 14px; line-height: 20px;">
                Or copy and paste this link into your browser:<br>
                <a href="${this.escapeHtml(acceptUrl)}" style="color: #0066cc; word-break: break-all;">${this.escapeHtml(acceptUrl)}</a>
              </p>

              <p style="margin: 0; color: #666666; font-size: 14px; line-height: 20px;">
                This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9f9f9; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #666666; font-size: 14px; line-height: 20px;">
                &copy; ${new Date().getFullYear()} Ectropy. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  /**
   * Render user invitation email plain text version
   */
  private renderInvitationText(inviterName: string, tenantName: string, acceptUrl: string, role: string): string {
    const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' ');
    return `
You're Invited to Ectropy!

${inviterName} has invited you to join ${tenantName} on Ectropy as a ${roleDisplay}.

Ectropy is a construction intelligence platform that helps teams collaborate on projects with AI-powered insights, BIM visualization, and automated decision support.

Accept your invitation by clicking this link:
${acceptUrl}

This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.

© ${new Date().getFullYear()} Ectropy. All rights reserved.
    `.trim();
  }

  /**
   * Escape HTML special characters
   *
   * @param text - Text to escape
   * @returns Escaped text
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }
}

// Export singleton instance
export const emailService = new EmailService();
