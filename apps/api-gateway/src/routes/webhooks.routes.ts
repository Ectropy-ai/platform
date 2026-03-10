/**
 * Webhook Routes - Payment & Subscription Events
 *
 * Phase 6 - Trial → Paid Shared Migration
 * Deliverable: Webhook handler architecture (Stripe integration design)
 *
 * Handles external service webhooks:
 * - Stripe payment events (subscription.created, subscription.deleted)
 * - Future: Other payment providers
 *
 * Security:
 * - Webhook signature verification
 * - Idempotent event handling
 * - Audit logging
 *
 * NOTE: This is the architecture design. Actual Stripe integration
 * requires STRIPE_WEBHOOK_SECRET and Stripe SDK setup.
 */

import {
  Router,
  Request,
  Response,
  type Router as ExpressRouter,
} from 'express';
// TODO: Remove unused imports when Stripe integration is implemented
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { TenantMigrationService } from '../services/tenant-migration.service.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { getPrismaClient } from '../database/prisma.js';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

const router: ExpressRouter = Router();
// TODO: Use these when implementing actual Stripe webhook handlers
// const _prisma = getPrismaClient();
// const _migrationService = new TenantMigrationService();

/**
 * Stripe Webhook Event Interface
 * (Simplified - actual Stripe events have many more fields)
 */
interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      customer?: string;
      status?: string;
      metadata?: Record<string, string>;
    };
  };
}

/**
 * POST /api/webhooks/stripe
 *
 * Handle Stripe webhook events
 *
 * Security:
 * - Verify webhook signature (TODO: implement with STRIPE_WEBHOOK_SECRET)
 * - Idempotent handling (check if event already processed)
 * - Audit logging
 *
 * Events Handled:
 * - customer.subscription.created → Trigger tenant migration
 * - customer.subscription.deleted → Suspend tenant
 * - customer.subscription.updated → Update tenant tier
 *
 * TODO: Stripe Integration Steps
 * 1. Install stripe package: pnpm add stripe
 * 2. Add STRIPE_WEBHOOK_SECRET to environment variables
 * 3. Implement signature verification
 * 4. Add Stripe customer_id to Tenant schema
 * 5. Create Stripe customer during trial signup
 * 6. Configure Stripe webhook endpoint in dashboard
 */
router.post('/stripe', async (req: Request, res: Response) => {
  try {
    logger.info('[WEBHOOK] Stripe webhook received', {
      headers: {
        'stripe-signature': req.headers['stripe-signature']
          ? 'present'
          : 'missing',
      },
    });

    // TODO: Verify webhook signature
    // const sig = req.headers['stripe-signature'];
    // const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    // const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

    // For now, parse the event manually (INSECURE - only for architecture demo)
    const event: StripeWebhookEvent = req.body;

    logger.info('[WEBHOOK] Processing Stripe event', {
      eventId: event.id,
      eventType: event.type,
    });

    // Check if event already processed (idempotency)
    // TODO: Check webhook_events table for event.id
    // const alreadyProcessed = await prisma.webhookEvent.findUnique({
    //   where: { externalId: event.id }
    // });
    // if (alreadyProcessed) {
    //   logger.info('[WEBHOOK] Event already processed, skipping', { eventId: event.id });
    //   return res.status(200).json({ received: true, skipped: true });
    // }

    // Handle event based on type
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event);
        break;

      default:
        logger.info('[WEBHOOK] Unhandled event type', {
          eventType: event.type,
        });
    }

    // TODO: Record event as processed
    // await prisma.webhookEvent.create({
    //   data: {
    //     externalId: event.id,
    //     provider: 'stripe',
    //     eventType: event.type,
    //     processedAt: new Date(),
    //   }
    // });

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('[WEBHOOK] Stripe webhook error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Handle customer.subscription.created event
 *
 * Triggered when user subscribes to paid plan
 *
 * Logic:
 * 1. Extract customer_id from Stripe event
 * 2. Find tenant WHERE metadata->>'stripe_customer_id' = customer_id
 * 3. Call migrateTenantToShared(tenant.id, 'paid_shared')
 * 4. Send confirmation email to user (TODO)
 * 5. Log to audit_logs (TODO)
 *
 * @param event Stripe webhook event
 */
async function handleSubscriptionCreated(
  event: StripeWebhookEvent
): Promise<void> {
  logger.info('[WEBHOOK] Handling subscription.created', {
    eventId: event.id,
    customerId: event.data.object.customer,
  });

  try {
    const customerId = event.data.object.customer;

    if (!customerId) {
      logger.error('[WEBHOOK] No customer ID in subscription event', {
        eventId: event.id,
      });
      return;
    }

    // TODO: Find tenant by Stripe customer_id
    // Requires adding stripe_customer_id field to Tenant schema
    // const tenant = await prisma.tenant.findFirst({
    //   where: {
    //     metadata: {
    //       path: ['stripe_customer_id'],
    //       equals: customerId
    //     }
    //   }
    // });

    // PLACEHOLDER: For now, log what would happen
    logger.info('[WEBHOOK] Would migrate tenant to paid tier', {
      eventId: event.id,
      customerId,
      // tenantId: tenant?.id,
    });

    // TODO: Call migration service
    // if (tenant) {
    //   const result = await migrationService.migrateTenantToShared(
    //     tenant.id,
    //     'BASIC' // or 'PROFESSIONAL' based on subscription plan
    //   );
    //
    //   if (result.success) {
    //     logger.info('[WEBHOOK] Tenant migrated successfully', {
    //       eventId: event.id,
    //       tenantId: tenant.id,
    //       newTier: result.newTier,
    //     });
    //
    //     // TODO: Send confirmation email
    //     // await sendUpgradeConfirmationEmail(tenant, result);
    //   } else {
    //     logger.error('[WEBHOOK] Tenant migration failed', {
    //       eventId: event.id,
    //       tenantId: tenant.id,
    //       errors: result.errors,
    //     });
    //   }
    // }

    logger.info('[WEBHOOK] Subscription created event processed', {
      eventId: event.id,
    });
  } catch (error) {
    logger.error('[WEBHOOK] Error handling subscription.created', {
      eventId: event.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Handle customer.subscription.deleted event
 *
 * Triggered when user cancels subscription
 *
 * Logic:
 * 1. Find tenant by stripe_customer_id
 * 2. Update tenant status to 'suspended'
 * 3. Schedule data archival (90 days grace period)
 * 4. Send cancellation confirmation email (TODO)
 *
 * @param event Stripe webhook event
 */
async function handleSubscriptionDeleted(
  event: StripeWebhookEvent
): Promise<void> {
  logger.info('[WEBHOOK] Handling subscription.deleted', {
    eventId: event.id,
    customerId: event.data.object.customer,
  });

  try {
    const customerId = event.data.object.customer;

    if (!customerId) {
      logger.error('[WEBHOOK] No customer ID in subscription event', {
        eventId: event.id,
      });
      return;
    }

    // TODO: Find tenant and update status
    // const tenant = await prisma.tenant.findFirst({
    //   where: {
    //     metadata: {
    //       path: ['stripe_customer_id'],
    //       equals: customerId
    //     }
    //   }
    // });
    //
    // if (tenant) {
    //   await prisma.tenant.update({
    //     where: { id: tenant.id },
    //     data: {
    //       status: 'SUSPENDED',
    //       // TODO: Add suspended_at timestamp
    //       // suspended_at: new Date(),
    //       // TODO: Add data_archival_scheduled_at (90 days from now)
    //       // data_archival_scheduled_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    //     }
    //   });
    //
    //   logger.info('[WEBHOOK] Tenant suspended', {
    //     eventId: event.id,
    //     tenantId: tenant.id,
    //   });
    //
    //   // TODO: Send cancellation email
    //   // await sendCancellationEmail(tenant);
    // }

    logger.info('[WEBHOOK] Subscription deleted event processed', {
      eventId: event.id,
    });
  } catch (error) {
    logger.error('[WEBHOOK] Error handling subscription.deleted', {
      eventId: event.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Handle customer.subscription.updated event
 *
 * Triggered when user changes subscription plan
 *
 * Logic:
 * 1. Find tenant by stripe_customer_id
 * 2. Determine new tier from subscription metadata
 * 3. Update tenant tier and limits
 * 4. Send update confirmation email (TODO)
 *
 * @param event Stripe webhook event
 */
async function handleSubscriptionUpdated(
  event: StripeWebhookEvent
): Promise<void> {
  logger.info('[WEBHOOK] Handling subscription.updated', {
    eventId: event.id,
    customerId: event.data.object.customer,
  });

  try {
    const customerId = event.data.object.customer;

    if (!customerId) {
      logger.error('[WEBHOOK] No customer ID in subscription event', {
        eventId: event.id,
      });
      return;
    }

    // TODO: Find tenant and update tier
    // const tenant = await prisma.tenant.findFirst({
    //   where: {
    //     metadata: {
    //       path: ['stripe_customer_id'],
    //       equals: customerId
    //     }
    //   }
    // });
    //
    // if (tenant) {
    //   // Determine new tier from subscription metadata
    //   const newTier = event.data.object.metadata?.tier || 'BASIC';
    //
    //   await prisma.tenant.update({
    //     where: { id: tenant.id },
    //     data: {
    //       subscription_tier: newTier,
    //       // Update limits based on new tier
    //     }
    //   });
    //
    //   logger.info('[WEBHOOK] Tenant tier updated', {
    //     eventId: event.id,
    //     tenantId: tenant.id,
    //     newTier,
    //   });
    // }

    logger.info('[WEBHOOK] Subscription updated event processed', {
      eventId: event.id,
    });
  } catch (error) {
    logger.error('[WEBHOOK] Error handling subscription.updated', {
      eventId: event.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * GET /api/webhooks/health
 *
 * Health check endpoint for webhook service
 */
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    service: 'webhooks',
    timestamp: new Date().toISOString(),
  });
});

export default router;
