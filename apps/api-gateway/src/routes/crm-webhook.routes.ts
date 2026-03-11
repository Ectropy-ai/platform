/**
 * ==============================================================================
 * CRM WEBHOOK ROUTES (M3.4)
 * ==============================================================================
 * Twenty CRM webhook integration for bidirectional sync
 * Milestone: User Management M3 (API Endpoints Layer)
 * Purpose: Enable automated CRM sync and lifecycle event handling
 * ==============================================================================
 */

import { Router, Request, Response, NextFunction } from 'express';
import { body, header, validationResult } from 'express-validator';
import { PrismaClient } from '@prisma/client';
import {
  logger,
  asyncHandler,
  createResponse,
  ValidationError,
  AuthenticationError,
} from '@ectropy/shared/utils';
import {
  CRMWebhookEvent,
  LifecycleStage,
} from '../services/user-management/index.js';

// Import Express type augmentation
import '../../../../libs/shared/types/src/express.js';

// ==============================================================================
// Route Configuration
// ==============================================================================

export interface CRMWebhookRoutesConfig {
  prisma: PrismaClient;
  crmWebhookSecret?: string;
}

// ==============================================================================
// CRM Webhook Routes Class
// ==============================================================================

/**
 * CRM Webhook Routes - Twenty CRM integration
 *
 * Security:
 * - Webhook signature validation (HMAC-SHA256)
 * - API key authentication fallback
 * - IP whitelist (optional, configured at gateway)
 * - Async processing with graceful degradation
 *
 * Endpoints:
 * - POST /api/webhooks/crm  Process CRM webhook event
 */
export class CRMWebhookRoutes {
  private router: Router;
  private prisma: PrismaClient;
  private webhookSecret?: string;

  constructor(config: CRMWebhookRoutesConfig) {
    this.router = Router();
    this.prisma = config.prisma;
    this.webhookSecret = config.crmWebhookSecret;

    this.setupRoutes();
  }

  /**
   * Get configured router
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Setup webhook route
   */
  private setupRoutes(): void {
    // POST /api/webhooks/crm - Process webhook event
    this.router.post(
      '/',
      [
        header('x-webhook-signature')
          .optional()
          .isString()
          .withMessage('Invalid signature format'),
        header('x-api-key')
          .optional()
          .isString()
          .withMessage('Invalid API key format'),
        body('eventType')
          .isString()
          .isIn([
            'lead.created',
            'lead.updated',
            'lead.qualified',
            'contact.created',
            'contact.updated',
            'company.created',
            'company.updated',
            'trial.started',
            'trial.converted',
            'subscription.cancelled',
          ])
          .withMessage('Invalid event type'),
        body('timestamp').isISO8601().withMessage('Invalid timestamp format'),
        body('data').isObject().withMessage('Event data is required'),
      ],
      asyncHandler(this.handleWebhook.bind(this))
    );
  }

  // ===========================================================================
  // Route Handlers
  // ===========================================================================

  /**
   * POST /api/webhooks/crm
   * Handle incoming CRM webhook event
   */
  private async handleWebhook(
    req: Request,
    res: Response,
    _next?: NextFunction
  ): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        `Invalid webhook payload: ${errors
          .array()
          .map((e) => e.msg)
          .join(', ')}`
      );
    }

    // Validate webhook signature or API key
    const signature = req.headers['x-webhook-signature'] as string;
    const apiKey = req.headers['x-api-key'] as string;

    if (this.webhookSecret && signature) {
      // Validate HMAC signature
      const isValid = await this.validateWebhookSignature(req.body, signature);
      if (!isValid) {
        logger.warn('[CRMWebhookRoutes] Invalid webhook signature', {
          eventType: req.body.eventType,
          signaturePrefix: signature.substring(0, 8),
        });
        throw new AuthenticationError('Invalid webhook signature');
      }
    } else if (apiKey) {
      // Fallback to API key validation
      // TODO: Validate against stored API key
      logger.debug('[CRMWebhookRoutes] API key authentication used', {
        eventType: req.body.eventType,
      });
    } else {
      throw new AuthenticationError('Webhook signature or API key required');
    }

    const { eventType, timestamp, data } = req.body;

    logger.info('[CRMWebhookRoutes] Processing webhook event', {
      eventType,
      timestamp,
      dataKeys: Object.keys(data),
    });

    // Build webhook event
    const event: CRMWebhookEvent = {
      eventType: eventType as CRMWebhookEvent['eventType'],
      timestamp: new Date(timestamp),
      data,
    };

    try {
      // Process webhook asynchronously (fire-and-forget)
      // Don't block webhook response on processing completion
      this.processWebhookEvent(event).catch((error) => {
        logger.error('[CRMWebhookRoutes] Webhook processing failed', {
          eventType,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });

      // Immediate response to CRM (webhook best practice)
      res.status(202).json(
        createResponse.success(
          {
            eventType,
            timestamp,
            accepted: true,
            processing: 'async',
          },
          'Webhook received and processing'
        )
      );
    } catch (error) {
      // Even if initial validation fails, return 202 to prevent retries
      logger.error('[CRMWebhookRoutes] Webhook acceptance failed', {
        eventType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(202).json(
        createResponse.success(
          {
            eventType,
            timestamp,
            accepted: true,
            warning: 'Processing may have failed, check logs',
          },
          'Webhook received'
        )
      );
    }
  }

  /**
   * Validate webhook signature using HMAC-SHA256
   */
  private async validateWebhookSignature(
    payload: any,
    signature: string
  ): Promise<boolean> {
    if (!this.webhookSecret) {
      return false;
    }

    try {
      const crypto = await import('crypto');
      const hmac = crypto.createHmac('sha256', this.webhookSecret);
      const payloadString = JSON.stringify(payload);
      hmac.update(payloadString);
      const expectedSignature = hmac.digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      logger.error('[CRMWebhookRoutes] Signature validation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Process inbound CRM webhook event (database-only, no outbound CRM calls)
   */
  private async processWebhookEvent(event: CRMWebhookEvent): Promise<void> {
    const email = event.data?.email as string | undefined;
    if (!email) {
      logger.warn('[CRMWebhookRoutes] Webhook missing email in data', {
        eventType: event.eventType,
      });
      return;
    }

    switch (event.eventType) {
      case 'lead.qualified': {
        const registration = await this.prisma.userRegistration.findUnique({
          where: { email: email.toLowerCase() },
        });
        if (
          registration &&
          (registration.lifecycle_stage === LifecycleStage.WAITLIST ||
            registration.lifecycle_stage === LifecycleStage.EMAIL_SENT)
        ) {
          logger.info('[CRMWebhookRoutes] Lead qualified from CRM', {
            email,
            currentStage: registration.lifecycle_stage,
          });
        }
        break;
      }

      case 'trial.started': {
        logger.info('[CRMWebhookRoutes] Trial started confirmed from CRM', {
          email,
        });
        break;
      }

      case 'trial.converted': {
        const reg = await this.prisma.userRegistration.findUnique({
          where: { email: email.toLowerCase() },
        });
        if (reg && reg.lifecycle_stage === LifecycleStage.TRIAL) {
          await this.prisma.userRegistration.update({
            where: { id: reg.id },
            data: {
              lifecycle_stage: LifecycleStage.PAID,
              converted_at: new Date(),
            },
          });
          logger.info(
            '[CRMWebhookRoutes] Trial converted to PAID via CRM webhook',
            { email }
          );
        }
        break;
      }

      case 'subscription.cancelled': {
        const reg = await this.prisma.userRegistration.findUnique({
          where: { email: email.toLowerCase() },
        });
        if (reg) {
          await this.prisma.userRegistration.update({
            where: { id: reg.id },
            data: { lifecycle_stage: LifecycleStage.CHURNED },
          });
          logger.info(
            '[CRMWebhookRoutes] Subscription cancelled via CRM webhook',
            { email }
          );
        }
        break;
      }

      default:
        logger.warn('[CRMWebhookRoutes] Unhandled webhook event type', {
          eventType: event.eventType,
        });
    }
  }
}
