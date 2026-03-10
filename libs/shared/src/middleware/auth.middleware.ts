/**
 * Authentication middleware for Express applications
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { User } from '../../types/src/index.js';

export interface AuthenticatedRequest extends Omit<Request, 'session'> {
  user?: User;
  session?: {
    id: string;
    createdAt: Date;
  };
}

/**
 * Authentication middleware class
 */
export class AuthMiddleware {
  /**
   * JWT Authentication middleware
   */
  static authenticate(options?: {
    required?: boolean;
    roles?: string[];
    permissions?: string[];
  }) {
    const { required = true, roles = [], permissions = [] } = options || {};

    return async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ) => {
      try {
        const token = AuthMiddleware.extractToken(req as unknown as Request);

        if (!token) {
          if (required) {
            return res.status(401).json({
              success: false,
              error: 'Authentication required',
              code: 'AUTH_REQUIRED',
            });
          }
          return next();
        }

        const secret = process.env.JWT_SECRET;
        if (!secret) {
          return res.status(500).json({
            success: false,
            error: 'Authentication service unavailable',
            code: 'AUTH_CONFIG_ERROR',
          });
        }

        // Verify and decode token
        const decoded = jwt.verify(token, secret) as any;

        // Populate user object
        req.user = {
          id: decoded.userId || decoded.id,
          email: decoded.email,
          firstName: decoded.firstName || '',
          lastName: decoded.lastName || '',
          role: decoded.role || (decoded.roles && decoded.roles[0]) || 'user', // Primary role
          roles: decoded.roles || [],
          permissions: decoded.permissions || [],
          isActive: decoded.isActive !== false,
          createdAt: decoded.createdAt
            ? new Date(decoded.createdAt)
            : new Date(),
          updatedAt: decoded.updatedAt
            ? new Date(decoded.updatedAt)
            : new Date(),
        };

        // Check role requirements
        if (roles.length > 0) {
          const hasRequiredRole = roles.some(
            (role) => req.user?.roles?.includes(role) ?? false
          );

          if (!hasRequiredRole) {
            return res.status(403).json({
              success: false,
              error: 'Insufficient role permissions',
              code: 'INSUFFICIENT_ROLE',
              requiredRoles: roles,
            });
          }
        }

        // Check permission requirements
        if (permissions.length > 0) {
          const hasRequiredPermission = permissions.some(
            (permission) => req.user?.permissions?.includes(permission) ?? false
          );

          if (!hasRequiredPermission) {
            return res.status(403).json({
              success: false,
              error: 'Insufficient permissions',
              code: 'INSUFFICIENT_PERMISSIONS',
              requiredPermissions: permissions,
            });
          }
        }

        next();
      } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
          return res.status(401).json({
            success: false,
            error: 'Token expired',
            code: 'TOKEN_EXPIRED',
          });
        }

        if (error instanceof jwt.JsonWebTokenError) {
          return res.status(401).json({
            success: false,
            error: 'Invalid token',
            code: 'INVALID_TOKEN',
          });
        }

        return res.status(500).json({
          success: false,
          error: 'Authentication failed',
          code: 'AUTH_ERROR',
        });
      }
    };
  }

  /**
   * Extract JWT token from request
   */
  private static extractToken(req: Request): string | null {
    // Check Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check cookie (for web applications)
    if ((req as any).cookies?.token) {
      return (req as any).cookies.token;
    }

    // Check query parameter (for development/testing only)
    if (process.env.NODE_ENV === 'development' && req.query.token) {
      return req.query.token as string;
    }

    return null;
  }
}

/**
 * Require authentication with specific roles
 */
export function requireAuth(roles?: string[]) {
  return AuthMiddleware.authenticate({ required: true, roles });
}

/**
 * Optional authentication
 */
export function optionalAuth() {
  return AuthMiddleware.authenticate({ required: false });
}

/**
 * Require specific permissions
 */
export function requirePermissions(...permissions: string[]) {
  return AuthMiddleware.authenticate({ required: true, permissions });
}
