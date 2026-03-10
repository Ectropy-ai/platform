import type { Request, Response, NextFunction } from 'express';
import { logger } from '@ectropy/shared/utils';

// Import Express type augmentation
import '@ectropy/shared/types/express';

/**
 * Role-based access control middleware
 * Ensures the authenticated user has at least one of the required roles
 */
export class RBACMiddleware {
  /**
   * Create middleware that requires one of the specified roles
   * @param roles - Roles required to access the route
   */
  public static requireRoles(...roles: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
      // Request already has user property via Express augmentation
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'NO_AUTH',
        });
        return;
      }
      const userRoles = req.user.roles || [];
      const hasRole = roles.some((role) => userRoles.includes(role));
      if (!hasRole) {
        res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS',
          required: roles,
          current: userRoles,
        });
        logger.debug('RBAC check failed', {
          userId: req.user.id,
          required: roles,
          current: userRoles,
        });
        return;
      }
      logger.debug('RBAC authorization successful', {
        userId: req.user.id,
        required: roles,
      });
      next();
    };
  }
}
