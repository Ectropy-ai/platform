/**
 * ==============================================================================
 * REGISTRATION ROUTES (M3.1)
 * ==============================================================================
 * Self-service customer registration and onboarding API endpoints
 * Milestone: User Management M3 (API Endpoints Layer)
 * Purpose: Enable zero-touch customer acquisition for March 2026 pilot
 * ==============================================================================
 */

import { Router, Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';
import {
  PrismaClient,
  StakeholderRole,
  SubscriptionTier,
} from '@prisma/client';
import {
  logger,
  asyncHandler,
  createResponse,
  ValidationError,
  NotFoundError,
} from '@ectropy/shared/utils';
import {
  UserRegistrationService,
  TenantProvisioningService,
  UserManagementError,
  UserManagementErrorCode,
} from '../services/user-management/index.js';

// Import Express type augmentation
import '../../../../libs/shared/types/src/express.js';

// ==============================================================================
// Route Configuration
// ==============================================================================

export interface RegistrationRoutesConfig {
  prisma: PrismaClient;
  frontendUrl: string;
  verificationLinkPattern: string;
}

// ==============================================================================
// Registration Routes Class
// ==============================================================================

/**
 * Registration Routes - Self-service customer onboarding
 *
 * Security:
 * - Email verification required before trial activation
 * - Cryptographically secure tokens (64-byte randomBytes)
 * - Rate limiting applied at gateway level
 * - UTM tracking for attribution
 *
 * Endpoints:
 * - POST   /api/registration/signup           Create registration
 * - POST   /api/registration/verify-email     Verify email with token
 * - POST   /api/registration/complete-profile Complete onboarding
 * - GET    /api/registration/status/:email    Check registration status
 */
export class RegistrationRoutes {
  private router: Router;
  private registrationService: UserRegistrationService;
  private provisioningService: TenantProvisioningService;
  private prisma: PrismaClient;

  constructor(config: RegistrationRoutesConfig) {
    this.router = Router();
    this.prisma = config.prisma;

    // Initialize services
    this.registrationService = new UserRegistrationService(config.prisma, {
      frontendUrl: config.frontendUrl,
      verificationLinkPattern: config.verificationLinkPattern,
    });

    this.provisioningService = new TenantProvisioningService(config.prisma);

    this.setupRoutes();
  }

  /**
   * Get configured router
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Setup all routes with validation middleware
   */
  private setupRoutes(): void {
    // POST /api/registration/signup - Create registration
    this.router.post(
      '/signup',
      [
        body('email')
          .isEmail()
          .normalizeEmail()
          .withMessage('Valid email is required'),
        body('fullName')
          .optional()
          .trim()
          .isLength({ min: 2, max: 100 })
          .withMessage('Full name must be 2-100 characters'),
        body('companyName')
          .optional()
          .trim()
          .isLength({ min: 2, max: 200 })
          .withMessage('Company name must be 2-200 characters'),
        body('utmSource').optional().trim(),
        body('utmMedium').optional().trim(),
        body('utmCampaign').optional().trim(),
      ],
      asyncHandler(this.createRegistration.bind(this))
    );

    // POST /api/registration/verify-email - Verify email with token
    this.router.post(
      '/verify-email',
      [
        body('token')
          .isString()
          .isLength({ min: 64, max: 256 })
          .withMessage('Invalid verification token format'),
      ],
      asyncHandler(this.verifyEmail.bind(this))
    );

    // POST /api/registration/complete-profile - Complete onboarding and provision tenant
    this.router.post(
      '/complete-profile',
      [
        body('registrationId').isUUID().withMessage('Invalid registration ID'),
        body('companyName')
          .trim()
          .isLength({ min: 2, max: 200 })
          .withMessage('Company name is required (2-200 characters)'),
        body('fullName')
          .trim()
          .isLength({ min: 2, max: 100 })
          .withMessage('Full name is required (2-100 characters)'),
        body('role')
          .optional()
          .isIn(Object.values(StakeholderRole))
          .withMessage('Invalid role'),
        body('subscriptionTier')
          .optional()
          .isIn(Object.values(SubscriptionTier))
          .withMessage('Invalid subscription tier'),
      ],
      asyncHandler(this.completeProfile.bind(this))
    );

    // GET /api/registration/status/:email - Check registration status
    this.router.get(
      '/status/:email',
      [
        param('email')
          .isEmail()
          .normalizeEmail()
          .withMessage('Valid email is required'),
      ],
      asyncHandler(this.getRegistrationStatus.bind(this))
    );
  }

  // ===========================================================================
  // Route Handlers
  // ===========================================================================

  /**
   * POST /api/registration/signup
   * Create new registration and send verification email
   */
  private async createRegistration(
    req: Request,
    res: Response,
    _next?: NextFunction
  ): Promise<void> {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        `Validation failed: ${errors
          .array()
          .map((e) => e.msg)
          .join(', ')}`
      );
    }

    const { email, fullName, utmSource, utmMedium, utmCampaign } = req.body;

    logger.info('[RegistrationRoutes] Creating registration', { email });

    try {
      // Create registration
      const registration = await this.registrationService.createRegistration({
        email,
        fullName,
        utmSource,
        utmMedium,
        utmCampaign,
      });

      // Send verification email
      await this.registrationService.sendVerificationEmail(registration.id);

      res.status(201).json(
        createResponse.success(
          {
            registrationId: registration.id,
            email: registration.email,
            lifecycleStage: registration.lifecycleStage,
            emailSent: true,
          },
          'Registration created successfully. Please check your email to verify your account.'
        )
      );
    } catch (error) {
      if (
        error instanceof UserManagementError &&
        error.code === UserManagementErrorCode.EMAIL_ALREADY_REGISTERED
      ) {
        res
          .status(409)
          .json(
            createResponse.error(
              'This email is already registered. Please check your inbox for verification email or contact support.',
              UserManagementErrorCode.EMAIL_ALREADY_REGISTERED
            )
          );
        return;
      }

      throw error;
    }
  }

  /**
   * POST /api/registration/verify-email
   * Verify email address with token and activate trial
   */
  private async verifyEmail(
    req: Request,
    res: Response,
    _next?: NextFunction
  ): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid verification token format');
    }

    const { token } = req.body;

    logger.info('[RegistrationRoutes] Verifying email', {
      tokenPrefix: token.substring(0, 8),
    });

    try {
      // Verify email
      const registration = await this.registrationService.verifyEmail(token);

      // Automatically start trial
      const trialRegistration = await this.registrationService.startTrial({
        registrationId: registration.id,
      });

      res.json(
        createResponse.success(
          {
            registrationId: trialRegistration.id,
            email: trialRegistration.email,
            lifecycleStage: trialRegistration.lifecycleStage,
            trialEndsAt: trialRegistration.trialEndsAt,
            verified: true,
          },
          'Email verified successfully. Your trial has started!'
        )
      );
    } catch (error) {
      if (error instanceof UserManagementError) {
        const statusCode =
          error.code === UserManagementErrorCode.INVALID_VERIFICATION_TOKEN
            ? 400
            : error.code === UserManagementErrorCode.VERIFICATION_TOKEN_EXPIRED
              ? 410
              : 400;

        res
          .status(statusCode)
          .json(
            createResponse.error(error.message, error.code, error.metadata)
          );
        return;
      }

      throw error;
    }
  }

  /**
   * POST /api/registration/complete-profile
   * Complete onboarding by provisioning tenant, user, and default project
   */
  private async completeProfile(
    req: Request,
    res: Response,
    _next?: NextFunction
  ): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError(
        `Validation failed: ${errors
          .array()
          .map((e) => e.msg)
          .join(', ')}`
      );
    }

    const { registrationId, companyName, fullName, role, subscriptionTier } =
      req.body;

    logger.info('[RegistrationRoutes] Completing profile', {
      registrationId,
      companyName,
    });

    try {
      // Provision tenant (creates tenant + user + membership + project)
      const provisioning = await this.provisioningService.provisionTenant({
        registrationId,
        tenantConfig: {
          name: companyName,
          subscriptionTier: subscriptionTier || SubscriptionTier.FREE,
          primaryEmail: '', // Will be filled from registration
        },
        ownerInfo: {
          fullName,
          role: role || StakeholderRole.owner,
        },
      });

      // Update registration to TRIAL status if not already
      const registration = await this.prisma.userRegistration.findUnique({
        where: { id: registrationId },
      });

      if (registration && registration.lifecycle_stage === 'EMAIL_VERIFIED') {
        await this.registrationService.startTrial({
          registrationId,
        });
      }

      logger.info('[RegistrationRoutes] Profile completed successfully', {
        registrationId,
        tenantId: provisioning.tenantId,
        userId: provisioning.userId,
      });

      res.status(201).json(
        createResponse.success(
          {
            tenantId: provisioning.tenantId,
            tenantSlug: provisioning.tenantSlug,
            userId: provisioning.userId,
            projectId: provisioning.projectId,
            subscriptionEndsAt: provisioning.subscriptionEndsAt,
            onboardingComplete: true,
          },
          'Onboarding completed successfully! Welcome to Ectropy.'
        )
      );
    } catch (error) {
      if (
        error instanceof UserManagementError &&
        error.code === UserManagementErrorCode.USER_NOT_FOUND
      ) {
        throw new NotFoundError('Registration not found');
      }

      throw error;
    }
  }

  /**
   * GET /api/registration/status/:email
   * Check registration status by email
   */
  private async getRegistrationStatus(
    req: Request,
    res: Response,
    _next?: NextFunction
  ): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Valid email is required');
    }

    const { email } = req.params;

    logger.debug('[RegistrationRoutes] Checking registration status', {
      email,
    });

    const registration =
      await this.registrationService.getRegistrationByEmail(email);

    if (!registration) {
      res
        .status(404)
        .json(
          createResponse.error(
            'No registration found for this email',
            'NOT_FOUND'
          )
        );
      return;
    }

    res.json(
      createResponse.success({
        registrationId: registration.id,
        email: registration.email,
        lifecycleStage: registration.lifecycleStage,
        emailVerified: !!registration.verifiedAt,
        trialStartedAt: registration.trialStartedAt,
        trialEndsAt: registration.trialEndsAt,
        tenantId: registration.tenantId,
        userId: registration.userId,
        createdAt: registration.createdAt,
      })
    );
  }
}
