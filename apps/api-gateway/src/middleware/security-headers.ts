// Enterprise Security Headers Middleware
// Phase 2 - Comprehensive security header enforcement
// Enhanced with OAuth-compatible CSP and production-ready settings

import { Request, Response, NextFunction } from 'express';

export interface SecurityHeadersConfig {
  contentTypeOptions?: boolean;
  frameOptions?: 'DENY' | 'SAMEORIGIN' | string;
  xssProtection?: boolean;
  hsts?: {
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
  csp?: string;
  referrerPolicy?: string;
  permissionsPolicy?: string;
}

const defaultConfig: SecurityHeadersConfig = {
  contentTypeOptions: true,
  frameOptions: 'DENY',
  xssProtection: true,
  hsts: {
    maxAge: 63072000, // 2 years as per enterprise standards
    includeSubDomains: true,
    preload: true,
  },
  // Enhanced CSP with Google OAuth support
  csp: "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://accounts.google.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' https://accounts.google.com; " +
    "frame-src https://accounts.google.com",
  referrerPolicy: 'strict-origin-when-cross-origin',
  permissionsPolicy: 'geolocation=(), microphone=(), camera=()',
};
export function securityHeaders(
  config: SecurityHeadersConfig = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const finalConfig = { ...defaultConfig, ...config };
  return (req: Request, res: Response, next: NextFunction): void => {
    // X-Content-Type-Options
    if (finalConfig.contentTypeOptions) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    // X-Frame-Options
    if (finalConfig.frameOptions) {
      res.setHeader('X-Frame-Options', finalConfig.frameOptions);
    }

    // X-XSS-Protection
    if (finalConfig.xssProtection) {
      res.setHeader('X-XSS-Protection', '1; mode=block');
    }

    // Strict-Transport-Security
    if (finalConfig.hsts) {
      let hstsValue = `max-age=${finalConfig.hsts.maxAge || 31536000}`;
      if (finalConfig.hsts.includeSubDomains) {
        hstsValue += '; includeSubDomains';
      }
      if (finalConfig.hsts.preload) {
        hstsValue += '; preload';
      }
      res.setHeader('Strict-Transport-Security', hstsValue);
    }

    // Content-Security-Policy
    if (finalConfig.csp) {
      res.setHeader('Content-Security-Policy', finalConfig.csp);
    }

    // Referrer-Policy
    if (finalConfig.referrerPolicy) {
      res.setHeader('Referrer-Policy', finalConfig.referrerPolicy);
    }

    // Permissions-Policy
    if (finalConfig.permissionsPolicy) {
      res.setHeader('Permissions-Policy', finalConfig.permissionsPolicy);
    }
    next();
  };
}

export default securityHeaders;
