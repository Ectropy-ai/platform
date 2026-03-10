/**
 * API Key Authentication Middleware
 *
 * MILESTONE 1 TASK 3: API Key Validation Middleware
 * Strategic Alignment: business-tools PR #101 → Ectropy platform integration
 * Gap #1 (P0 BLOCKING): Enable n8n workflows to authenticate with Ectropy
 *
 * Purpose: Validate API keys for server-to-server authentication
 * Security: bcrypt hashed keys, scoped permissions, audit trail
 * Use Case: business-tools n8n workflows → Ectropy platform
 *
 * Features:
 * - Bearer token extraction from Authorization header
 * - bcrypt key validation against database
 * - Active status and expiration checks
 * - Scope-based authorization
 * - Automatic last_used_at tracking
 * - User context loading for audit trail
 */

import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

// Import centralized User type
import type { User } from '@ectropy/shared/types';

// Extend Express Request to include user and apiKey
declare global {
  namespace Express {
    interface Request {
      user?: User;
      apiKey?: {
        id: string;
        name: string;
        scopes: string[];
      };
    }
  }
}

export class ApiKeyMiddleware {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Extract API key from Authorization header
   * Expected format: "Authorization: Bearer ectropy_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   */
  private extractApiKey(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return null;
    }

    // Support both "Bearer token" and "token" formats
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      return parts[1];
    } else if (parts.length === 1) {
      return parts[0];
    }

    return null;
  }

  /**
   * Validate API key and load associated user
   * Returns user if valid, null otherwise
   */
  private async validateApiKey(key: string): Promise<{
    user: User;
    apiKey: {
      id: string;
      name: string;
      scopes: string[];
    };
  } | null> {
    try {
      // Fetch all active API keys (we'll check expiration separately)
      const apiKeys = await this.prisma.apiKey.findMany({
        where: {
          is_active: true,
        },
        include: {
          user: true,
        },
      });

      // Compare provided key against all active keys using bcrypt
      for (const apiKey of apiKeys) {
        const isMatch = await bcrypt.compare(key, apiKey.key_hash);
        if (isMatch) {
          // Check expiration
          if (apiKey.expires_at && new Date() > apiKey.expires_at) {
            logger.warn('🔑 [API_KEY] Expired API key used', {
              apiKeyId: apiKey.id,
              apiKeyName: apiKey.name,
              expiresAt: apiKey.expires_at,
            });
            return null;
          }

          // Update last_used_at (fire and forget - don't block response)
          this.prisma.apiKey
            .update({
              where: { id: apiKey.id },
              data: { last_used_at: new Date() },
            })
            .catch((error) => {
              logger.error('Failed to update API key last_used_at', {
                apiKeyId: apiKey.id,
                error,
              });
            });

          // Return user and API key metadata
          // Map Prisma User fields to shared User type
          const fullNameParts = apiKey.user.full_name.split(' ');
          const firstName = fullNameParts[0] || '';
          const lastName = fullNameParts.slice(1).join(' ') || '';

          return {
            user: {
              id: apiKey.user.id,
              email: apiKey.user.email,
              firstName,
              lastName,
              name: apiKey.user.full_name,
              isActive: apiKey.user.is_active,
              role: apiKey.user.role,
              roles: apiKey.user.roles,
              organization: apiKey.user.company || undefined,
              provider: apiKey.user.provider || undefined,
              is_platform_admin: apiKey.user.is_platform_admin,
              createdAt: apiKey.user.created_at,
              updatedAt: apiKey.user.updated_at,
            },
            apiKey: {
              id: apiKey.id,
              name: apiKey.name,
              scopes: apiKey.scopes,
            },
          };
        }
      }

      // No matching key found
      return null;
    } catch (error) {
      logger.error('🔑 [API_KEY] Database error during API key validation', {
        error,
      });
      return null;
    }
  }

  /**
   * Check if API key has required scope
   */
  private hasRequiredScope(
    apiKeyScopes: string[],
    requiredScope: string
  ): boolean {
    // Wildcard scope grants all permissions
    if (apiKeyScopes.includes('*')) {
      return true;
    }
    return apiKeyScopes.includes(requiredScope);
  }

  /**
   * API Key Authentication Middleware
   *
   * Usage:
   *   app.use('/api/admin/authorize-user', apiKeyMiddleware.authenticate(['authorize_user']));
   *   app.use('/api/admin/demo-users', apiKeyMiddleware.authenticate(['list_users']));
   *   app.use('/api/admin/health', apiKeyMiddleware.authenticate(['health_check']));
   *
   * Required Scopes:
   *   - authorize_user: POST /api/admin/authorize-user
   *   - list_users: GET /api/admin/demo-users
   *   - revoke_user: POST /api/admin/users/:userId/revoke
   *   - health_check: GET /api/admin/health
   *   - *: Wildcard (all permissions)
   *
   * @param requiredScopes - Array of scopes required for this endpoint
   */
  public authenticate(requiredScopes?: string[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
      // Extract API key from Authorization header
      const apiKey = this.extractApiKey(req);

      if (!apiKey) {
        logger.warn('🔑 [API_KEY] No API key provided', {
          path: req.path,
          method: req.method,
          ip: req.ip,
        });
        return res.status(401).json({
          error: 'API key required',
          message: 'Please provide a valid API key in the Authorization header',
          format: 'Authorization: Bearer <api_key>',
        });
      }

      // Validate API key and load user
      const result = await this.validateApiKey(apiKey);

      if (!result) {
        logger.warn('🔑 [API_KEY] Invalid API key', {
          path: req.path,
          method: req.method,
          ip: req.ip,
        });
        return res.status(401).json({
          error: 'Invalid API key',
          message: 'The provided API key is invalid or has expired',
        });
      }

      const { user, apiKey: apiKeyMetadata } = result;

      // Check required scopes
      if (requiredScopes && requiredScopes.length > 0) {
        const hasAllScopes = requiredScopes.every((scope) =>
          this.hasRequiredScope(apiKeyMetadata.scopes, scope)
        );

        if (!hasAllScopes) {
          logger.warn('🔑 [API_KEY] Insufficient permissions', {
            apiKeyId: apiKeyMetadata.id,
            apiKeyName: apiKeyMetadata.name,
            requiredScopes,
            apiKeyScopes: apiKeyMetadata.scopes,
            userId: user.id,
            path: req.path,
          });
          return res.status(403).json({
            error: 'Insufficient permissions',
            message: `API key does not have required permissions: ${requiredScopes.join(', ')}`,
            required: requiredScopes,
            current: apiKeyMetadata.scopes,
          });
        }
      }

      // Attach user and API key metadata to request for downstream middleware
      req.user = user;
      req.apiKey = apiKeyMetadata;

      logger.info('✅ [API_KEY] API key authenticated successfully', {
        apiKeyId: apiKeyMetadata.id,
        apiKeyName: apiKeyMetadata.name,
        userId: user.id,
        userEmail: user.email,
        path: req.path,
        method: req.method,
      });

      next();
    };
  }

  /**
   * Dual Authentication Middleware
   *
   * Allows EITHER session authentication (OAuth) OR API key authentication.
   * Useful for endpoints that need to support both user sessions and API keys.
   *
   * Usage:
   *   app.use('/api/admin/demo-users', apiKeyMiddleware.dualAuth(['list_users']));
   *
   * @param requiredScopes - Array of scopes required for API key auth
   */
  public dualAuth(requiredScopes?: string[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
      // Check for session authentication first
      if (req.session?.user) {
        // User authenticated via session (OAuth)
        req.user = req.session.user;
        logger.info('✅ [AUTH] Session authentication successful', {
          userId: req.user.id,
          userEmail: req.user.email,
          path: req.path,
        });
        return next();
      }

      // Check for API key authentication
      const apiKey = this.extractApiKey(req);
      if (apiKey) {
        // Delegate to API key authentication
        return this.authenticate(requiredScopes)(req, res, next);
      }

      // No authentication provided
      logger.warn('🔒 [AUTH] No authentication provided', {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please sign in with OAuth or provide a valid API key',
        methods: ['Session (OAuth)', 'API Key (Authorization: Bearer <key>)'],
      });
    };
  }
}

// Export singleton instance
export const apiKeyMiddleware = new ApiKeyMiddleware();
