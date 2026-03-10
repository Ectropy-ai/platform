import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Request ID for tracing
export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const id = crypto.randomUUID();
  (req as any).id = id;
  res.setHeader('X-Request-Id', id);
  next();
};

// Security headers
export const securityHeaders = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  );
  next();
};

// Input sanitization
export const sanitizeInput = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Recursively clean input
  const clean = (obj: any): any => {
    if (typeof obj === 'string') {
      return obj
        .trim()
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }
    if (Array.isArray(obj)) {
      return obj.map(clean);
    }
    if (obj && typeof obj === 'object') {
      const cleaned: any = {};
      for (const key in obj) {
        cleaned[key] = clean(obj[key]);
      }
      return cleaned;
    }
    return obj;
  };

  req.body = clean(req.body);
  req.query = clean(req.query);
  req.params = clean(req.params);
  next();
};
