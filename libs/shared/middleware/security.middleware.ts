/**
 * Express middleware helpers for security headers and rate limiting.
 */
import cors from 'cors';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
});
export const corsOptions = cors({
  origin: process.env['FRONTEND_URL'] || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

// Dynamic rate limiter creation for Node v20 ESM compatibility
export const createApiRateLimiter = async () => {
  try {
    const rateLimitModule = await import('express-rate-limit');
    const rateLimit = rateLimitModule.default || rateLimitModule;

    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
    });
  } catch (error) {
    return (req: Request, res: Response, next: NextFunction) => next();
  }
};

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  return res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env['NODE_ENV'] === 'development' && { stack: err.stack }),
  });
};

// Export rate limiter instances for compatibility
export const apiRateLimiter = createApiRateLimiter();
