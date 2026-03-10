/**
 * Waitlist Routes - Simple email capture for landing page
 * 
 * Phase 47: Integrated with n8n lead capture pipeline
 * - Email handled by n8n → Resend (hello@luh.tech)
 * - CRM contact created in Twenty
 * - Slack #leads notification
 */

import express, { Request, Response, Router, IRouter } from 'express';
import { body, validationResult } from 'express-validator';
import { Pool } from 'pg';
import { logger } from '@ectropy/shared/utils';
// Phase 47: Email now handled by n8n pipeline
// import { emailService } from '../services/email.service';
interface WaitlistRequest extends Request {
  body: {
    email: string;
  };
}
export class WaitlistRoutes {
  private router: IRouter;
  private dbPool: Pool;
  constructor(dbPool: Pool) {
    this.router = express.Router();
    this.dbPool = dbPool;
    this.setupRoutes(); // Note: this will be async now
  }

  private async createRateLimit() {
    try {
      const rateLimitModule = await import('express-rate-limit');
      const rateLimit = rateLimitModule.default || rateLimitModule;

      return rateLimit({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 5,
        message: 'Too many waitlist requests. Please try again later.',
      });
    } catch (error) {
      logger.info(
        'express-rate-limit not available for waitlist, using fallback'
      );
      return (req: Request, res: Response, next: Function) => next();
    }
  }

  private async setupRoutes(): Promise<void> {
    // Rate limiting: 5 requests per hour per IP
    const waitlistRateLimit = await this.createRateLimit();

    // Validation middleware
    const validateWaitlist = [
      body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email is required'),
    ];

    // POST /api/waitlist - Join waitlist
    this.router.post(
      '/',
      waitlistRateLimit,
      ...validateWaitlist,
      this.joinWaitlist.bind(this)
    );
    // GET /api/waitlist/count - Get waitlist count (optional)
    this.router.get('/count', this.getWaitlistCount.bind(this));
  }

  /**
   * Join waitlist endpoint
   */
  private async joinWaitlist(
    req: WaitlistRequest,
    res: Response
  ): Promise<void> {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Invalid email address',
          errors: errors.array(),
        });
        return;
      }
      const { email } = req.body;
      // Insert into waitlist table with conflict handling
      const query = `
        INSERT INTO waitlist (email, created_at, source)
        VALUES ($1, NOW(), 'landing_page')
        ON CONFLICT (email) DO NOTHING
        RETURNING id, email, created_at
      `;
      const result = await this.dbPool.query(query, [email]);
      if (result.rows.length > 0) {
        // New email added
        logger.info(`New waitlist signup: ${email}`);

        // Phase 47: Forward to n8n lead capture pipeline (CRM + Email + Slack)
        // Fire-and-forget - don't block response on n8n
        this.forwardToN8n(email).catch((error) => {
          logger.error('Failed to forward lead to n8n pipeline', {
            email,
            error: error.message,
          });
        });

        res.status(201).json({
          success: true,
          message: 'Successfully joined the waitlist!',
        });
      } else {
        // Email already exists
        res.status(200).json({
          success: true,
          message: 'You are already on our waitlist!',
        });
      }
    } catch (_error) {
      logger.error('Waitlist signup error:', _error as Error);
      res.status(500).json({
        success: false,
        message: 'Internal server error. Please try again later.',
      });
    }
  }

  /**
   * Get waitlist count endpoint
   */
  private async getWaitlistCount(req: Request, res: Response): Promise<void> {
    try {
      const query = 'SELECT COUNT(*) as count FROM waitlist';
      const result = await this.dbPool.query(query);
      res.json({
        success: true,
        count: parseInt(result.rows[0].count, 10),
      });
    } catch (_error) {
      logger.error('Waitlist count error:', _error as Error);
      res.status(500).json({
        success: false,
        message: 'Could not retrieve waitlist count',
      });
    }
  }

  /**
   * Forward lead to n8n pipeline for CRM, email, and Slack notification
   * Phase 47: Centralized lead capture pipeline
   *
   * @param email - Lead email address
   */
  private async forwardToN8n(email: string): Promise<void> {
    const N8N_WEBHOOK_URL = process.env.N8N_LEAD_CAPTURE_WEBHOOK || 'https://n8n.luh.tech/webhook/lead-capture';

    const payload = {
      email: email,
      venture: 'Ectropy',
      source: 'ectropy.ai',
    };

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`n8n webhook returned ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    logger.info('Lead forwarded to n8n pipeline', {
      email,
      status: result.status,
      pipeline: result.pipeline,
    });
  }

  /**
   * Get configured router
   */
  public getRouter(): IRouter {
    return this.router;
  }
}

export default WaitlistRoutes;
