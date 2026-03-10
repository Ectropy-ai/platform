/**
 * Authentication Middleware for Express.js
 */

import type { Request, Response, NextFunction } from 'express';
import { JWTService } from '../services/jwt.service.js';
import { AuthConfig, JWTPayload } from '../types/auth.types.js';
import { User } from '@ectropy/shared/types';
import { logger } from '@ectropy/shared/utils';

// Import Express type augmentation
import '@ectropy/shared/types/express';
export class AuthMiddleware {
  private jwtService: JWTService;
  constructor(config: AuthConfig) {
    this.jwtService = new JWTService(config);
  }
  public requireAuth() {
    return async (
      req: Request,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const token = this.extractToken(req);
        if (!token) {
          res.status(401).json({
            success: false,
            error: 'Authentication required',
            code: 'NO_TOKEN',
          });
          return;
        }
        const payload = this.jwtService.verifyAccessToken(token);
        // Attach user info to request
        // Request already has user property via Express augmentation
        req.user = {
          id: payload.userId,
          email: payload.email,
          role: payload.roles?.[0] ?? 'USER', // Primary role (first role or default)
          roles: payload.roles,
          firstName: '',
          lastName: '',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        req.sessionId = payload.sessionId;
        logger.debug('User authenticated', {
          userId: payload.userId,
          sessionId: payload.sessionId,
        });
        next();
      } catch (error) {
        const errorMessage = (error as Error).message;
        if (errorMessage === 'TOKEN_EXPIRED') {
          res.status(401).json({
            success: false,
            error: 'Token expired',
            code: 'TOKEN_EXPIRED',
          });
        } else if (errorMessage === 'INVALID_TOKEN') {
          res.status(401).json({
            success: false,
            error: 'Invalid token',
            code: 'INVALID_TOKEN',
          });
        } else {
          logger.error('Authentication error', { error: error as Error });
          res.status(500).json({
            success: false,
            error: 'Authentication failed',
            code: 'AUTH_ERROR',
          });
        }
      }
    };
  }
  public optionalAuth() {
    return async (
      req: Request,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const token = this.extractToken(req);
        if (token) {
          const payload = this.jwtService.verifyAccessToken(token);
          // Request already has user property via Express augmentation
          req.user = {
            id: payload.userId,
            email: payload.email,
            role: payload.roles?.[0] ?? 'USER', // Primary role (first role or default)
            roles: payload.roles,
            firstName: '',
            lastName: '',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          req.sessionId = payload.sessionId;
        }
        next();
      } catch (error) {
        // For optional auth, we don't fail on invalid tokens
        const errorObj: {
          name: string;
          message: string;
          stack?: string;
          code?: string;
        } = {
          name: (error as Error).name || 'Error',
          message: (error as Error).message,
        };
        const errorStack = (error as Error).stack;
        if (errorStack) {
          errorObj.stack = errorStack;
        }
        logger.debug('Optional auth failed, continuing without user', {
          error: errorObj,
        });
        next();
      }
    };
  }
  public requireRoles(...roles: string[]) {
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
      const hasRequiredRole = roles.some((role) => userRoles.includes(role));
      if (!hasRequiredRole) {
        res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS',
          required: roles,
          current: userRoles,
        });
        return;
      }
      logger.debug('Role authorization successful', {
        userId: req.user.id,
        requiredRoles: roles,
        userRoles,
      });
      next();
    };
  }
  private extractToken(req: Request): string | null {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader) {
      // Handle case where authHeader might be an array
      const headerValue = Array.isArray(authHeader)
        ? authHeader[0]
        : authHeader;
      if (headerValue && headerValue.startsWith('Bearer ')) {
        return headerValue.substring(7);
      }
    }
    // Check cookie
    const cookieToken = req.cookies?.accessToken;
    if (cookieToken) {
      return cookieToken;
    }
    return null;
  }
  public static create(config: AuthConfig): AuthMiddleware {
    return new AuthMiddleware(config);
  }
}
