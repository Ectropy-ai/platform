/**
 * Enterprise Security Middleware Suite
 * Provides authentication, authorization, and validation middleware
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import type { User } from '../../types/src/index.js';

const logger = {
  info: (message: string, ...args: any[]) => console.log(message, ...args),
  error: (message: string, ...args: any[]) => console.error(message, ...args),
  warn: (message: string, ...args: any[]) => console.warn(message, ...args),
  debug: (message: string, ...args: any[]) => console.debug(message, ...args),
};

/**
 * Authenticated request extending Express Request
 * Uses canonical User type from user.types.ts
 */
export interface AuthenticatedRequest extends Omit<Request, 'session'> {
  user?: User;
  session?: {
    id: string;
    createdAt: Date;
  };
}

/**
 * Enterprise Security Middleware
 * Handles authentication, authorization, and request validation
 */
export class SecurityMiddleware {
  /**
   * JWT Authentication Middleware
   */
  static authenticate(options?: { required?: boolean; roles?: string[] }) {
    const required = options?.required ?? true;
    const requiredRoles = options?.roles ?? [];

    return async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ) => {
      try {
        const token = SecurityMiddleware.extractToken(req);

        if (!token) {
          if (required) {
            return res.status(401).json({
              error: 'Authentication required',
              code: 'AUTH_REQUIRED',
            });
          }
          return next();
        }

        const secret = process.env.JWT_SECRET;
        if (!secret) {
          logger.error('JWT_SECRET not configured');
          return res.status(500).json({
            error: 'Authentication service unavailable',
            code: 'AUTH_CONFIG_ERROR',
          });
        }

        const decoded = jwt.verify(token, secret) as any;
        req.user = {
          id: decoded.id,
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
        if (requiredRoles.length > 0) {
          const hasRequiredRole = requiredRoles.some(
            (role) => req.user?.roles?.includes(role) || req.user?.role === role
          );

          if (!hasRequiredRole) {
            return res.status(403).json({
              error: 'Insufficient permissions',
              code: 'FORBIDDEN',
              requiredRoles,
            });
          }
        }

        next();
      } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
          return res.status(401).json({
            error: 'Token expired',
            code: 'TOKEN_EXPIRED',
          });
        }

        if (error instanceof jwt.JsonWebTokenError) {
          return res.status(401).json({
            error: 'Invalid token',
            code: 'INVALID_TOKEN',
          });
        }

        logger.error('Authentication error', error);
        return res.status(500).json({
          error: 'Authentication failed',
          code: 'AUTH_ERROR',
        });
      }
    };
  }

  /**
   * Request Validation Middleware
   */
  static validate() {
    return (req: Request, res: Response, next: NextFunction) => {
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      next();
    };
  }

  /**
   * CORS Configuration Middleware
   */
  static cors(options?: { origins?: string[]; credentials?: boolean }) {
    const allowedOrigins =
      options?.origins ||
      [
        'http://localhost:3000',
        'http://localhost:3002',
        process.env.FRONTEND_URL,
      ].filter(Boolean);

    return (req: Request, res: Response, next: NextFunction) => {
      const origin = req.headers.origin;

      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }

      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, PATCH, OPTIONS'
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Request-ID'
      );
      res.setHeader(
        'Access-Control-Allow-Credentials',
        String(options?.credentials ?? true)
      );
      res.setHeader('Access-Control-Max-Age', '86400');

      if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
      }

      next();
    };
  }

  /**
   * Request ID Middleware
   */
  static requestId() {
    return (req: Request, res: Response, next: NextFunction) => {
      const requestId =
        (req.headers['x-request-id'] as string) ||
        `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      req.headers['x-request-id'] = requestId;
      res.setHeader('X-Request-ID', requestId);

      next();
    };
  }

  /**
   * Extract JWT token from request
   */
  private static extractToken(req: AuthenticatedRequest): string | null {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check cookie
    if ((req as any).cookies?.token) {
      return (req as any).cookies.token;
    }

    // Check query parameter (not recommended for production)
    if (process.env.NODE_ENV === 'development' && req.query.token) {
      return req.query.token as string;
    }

    return null;
  }
}

/**
 * Role-based authorization middleware
 */
export function authorize(...roles: string[]) {
  return SecurityMiddleware.authenticate({ required: true, roles });
}

/**
 * Optional authentication middleware
 */
export function optionalAuth() {
  return SecurityMiddleware.authenticate({ required: false });
}
