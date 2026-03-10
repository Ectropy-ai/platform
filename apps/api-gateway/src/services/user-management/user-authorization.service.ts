/**
 * ==============================================================================
 * USER AUTHORIZATION SERVICE (M2.5)
 * ==============================================================================
 * Redis-cached database authorization (replaces AUTHORIZED_USERS env var)
 * Milestone: User Management M2.5 (Backend Services Layer)
 * Purpose: High-performance authorization with cache invalidation
 * ==============================================================================
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '@ectropy/shared/utils';
import {
  UserManagementError,
  UserManagementErrorCode,
  AuthorizeUserRequest,
  RevokeAuthorizationRequest,
  AuthorizationStatus,
  DEFAULT_AUTHORIZATION_CACHE_TTL_SECONDS,
} from './types.js';

/**
 * User Authorization Service - Redis-cached database authorization
 *
 * Performance:
 * - Redis cache with 5-minute TTL
 * - Cache invalidation on authorization changes
 * - Fallback to database if Redis unavailable
 * - Metrics: Cache hit rate tracking
 *
 * NOTE: Redis integration to be added in future iteration
 * Current implementation: Direct database queries
 */
export class UserAuthorizationService {
  private cacheEnabled = false; // TODO: Enable when Redis is configured

  constructor(
    private prisma: PrismaClient,
    private config?: {
      cacheTtlSeconds?: number;
    }
  ) {
    logger.info('[UserAuthorizationService] Initialized', {
      cacheEnabled: this.cacheEnabled,
      cacheTtl:
        config?.cacheTtlSeconds || DEFAULT_AUTHORIZATION_CACHE_TTL_SECONDS,
    });
  }

  /**
   * Check if user is authorized (primary method)
   */
  async isAuthorized(email: string): Promise<boolean> {
    // TODO: Check Redis cache first when enabled

    // Fallback to database
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        is_authorized: true,
        is_platform_admin: true,
      },
    });

    const authorized = user?.is_authorized || user?.is_platform_admin || false;

    logger.debug('[UserAuthorizationService] Authorization checked', {
      email,
      authorized,
      source: 'database',
    });

    return authorized;
  }

  /**
   * Get detailed authorization status
   */
  async getAuthorizationStatus(email: string): Promise<AuthorizationStatus> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        is_authorized: true,
        authorized_at: true,
        is_platform_admin: true,
      },
    });

    if (!user) {
      return {
        isAuthorized: false,
        authorizedAt: null,
        authorizedBy: null,
        isPlatformAdmin: false,
      };
    }

    return {
      isAuthorized: user.is_authorized || user.is_platform_admin,
      authorizedAt: user.authorized_at,
      authorizedBy: null, // TODO: Track who authorized
      isPlatformAdmin: user.is_platform_admin,
    };
  }

  /**
   * Authorize user (grant access)
   */
  async authorizeUser(request: AuthorizeUserRequest): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: request.userId },
    });

    if (!user) {
      throw new UserManagementError(
        'User not found',
        UserManagementErrorCode.USER_NOT_FOUND,
        { userId: request.userId }
      );
    }

    await this.prisma.user.update({
      where: { id: request.userId },
      data: {
        is_authorized: true,
        authorized_at: new Date(),
      },
    });

    // TODO: Invalidate cache when Redis is enabled

    logger.info('[UserAuthorizationService] User authorized', {
      userId: request.userId,
      email: user.email,
      authorizedBy: request.authorizedBy,
      reason: request.reason,
    });
  }

  /**
   * Revoke authorization (remove access)
   */
  async revokeAuthorization(
    request: RevokeAuthorizationRequest
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: request.userId },
    });

    if (!user) {
      throw new UserManagementError(
        'User not found',
        UserManagementErrorCode.USER_NOT_FOUND,
        { userId: request.userId }
      );
    }

    await this.prisma.user.update({
      where: { id: request.userId },
      data: {
        is_authorized: false,
        authorized_at: null,
      },
    });

    // TODO: Invalidate cache when Redis is enabled

    logger.warn('[UserAuthorizationService] Authorization revoked', {
      userId: request.userId,
      email: user.email,
      revokedBy: request.revokedBy,
      reason: request.reason,
    });
  }
}
