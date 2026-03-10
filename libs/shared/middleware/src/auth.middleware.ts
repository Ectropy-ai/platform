/**
 * Comprehensive JWT authentication middleware used by API services.
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { GraphQLContext } from '@ectropy/shared/types';

// Import Express type augmentation
import '@ectropy/shared/types/express';

// Generic auth service interface to avoid circular dependencies
export interface IAuthService {
  validateToken(token: string): Promise<any>;
}

export class AuthMiddleware {
  constructor(private authService: IAuthService) {}
  /**
   * JWT Authentication middleware
   */
  authenticate = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.headers['authorization'];
      if (
        !authHeader ||
        typeof authHeader !== 'string' ||
        !authHeader.startsWith('Bearer ')
      ) {
        res.status(401).json({ error: 'No token provided' });
        return;
      }
      const token = 'REDACTED';
      // Validate token and get user context
      const userContext = await this.authService.validateToken(token);
      if (!userContext || !userContext.valid) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }
      // Attach user context to request
      req.user = userContext.payload;
      req.sessionId = userContext.session?.sessionId;
      req.permissions = userContext.session?.permissions;
      next();
    } catch (_error) {
      const error = _error as Error;
      res.status(401).json({ error: 'Authentication failed' });
    }
  };

  /**
   * Optional authentication - doesn't fail if no token
   */
  optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers['authorization'];
      if (
        authHeader &&
        typeof authHeader === 'string' &&
        authHeader.startsWith('Bearer ')
      ) {
        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        const userContext = await this.authService.validateToken(token);
        if (userContext) {
          req.user = userContext;
          req.sessionId = userContext.sessionId;
          (req as any).permissions = userContext.permissions;
        }
      }
      next();
    } catch (_error) {
      // Log error but don't fail the request
      const error = _error as Error;
      next(); // Continue without authentication
    }
  };

  /**
   * Check if user has required permission
   */
  requirePermission = (permission: string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      if (!req.permissions || !req.permissions.includes(permission)) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      next();
    };
  };
  /**
   * Check if user has any of the required roles
   */
  requireRole = (roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      const hasRole = req.user.role && roles.includes(req.user.role);
      if (!hasRole) {
        res.status(403).json({ error: 'Insufficient role privileges' });
        return;
      }
      next();
    };
  };
  /**
   * GraphQL Context factory
   */
  createGraphQLContext = async (req: Request): Promise<GraphQLContext> => {
    const context: GraphQLContext = {
      isAuthenticated: false,
    };
    if (req.user) {
      (context as any).user = req.user;
      context.roles = req.user.role ? [{
        userId: req.user!.id,
        projectId: 'default', // In a real app, this would come from the request context
        role: req.user.role as string,
        permissions: req.permissions || [],
      }] : [];
      if (req.sessionId !== undefined) {
        (context as any).sessionId = req.sessionId;
      }
      if (req.permissions !== undefined) {
        context.permissions = req.permissions;
      }
      context.isAuthenticated = true;
    }
    return context;
  };
}
export default AuthMiddleware;
