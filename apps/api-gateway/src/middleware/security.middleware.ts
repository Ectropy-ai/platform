/**
 * Security headers and CSRF protection
 * Implements enterprise-grade security middleware
 */

import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Extend express-session types for CSRF token support
declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
    userId?: string;
  }
}

// CSRF protection implementation
// Uses cryptographically secure random bytes (OWASP recommendation)
// Replaces Math.random() which is predictable and unsuitable for security tokens
const generateCSRFToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Exemption decision matrix (OWASP A01:2021 compliant)
  // OAuth endpoints: /api/auth/* (Passport.js handles state parameter for CSRF protection)
  // Public endpoints: /api/waitlist (email capture with compensating controls: rate limiting, origin validation)
  // File uploads: /api/upload/* (Multipart form-data from authenticated frontend, protected by CORS + origin validation)
  // Speckle BIM: /api/speckle/* (Enterprise BIM integration - protected by session auth + CORS + project authorization)
  // Admin endpoints: /api/admin/* (Enterprise admin operations - protected by session auth + RBAC + audit logging)
  // Health checks: /health, /api/health, /ready, /metrics
  //
  // SECURITY NOTE: Speckle endpoints are exempt because they have multiple compensating controls:
  // 1. Session-based authentication (OAuth cookies) - verified by requireAuth middleware
  // 2. Project-level authorization - requireProjectAccess middleware validates user owns/has access to project
  // 3. CORS origin validation - only allows requests from authorized frontend origins
  // 4. Same-site cookies - prevents cross-origin session hijacking
  //
  // SECURITY NOTE: Admin endpoints are exempt for the same reasons (apps/api-gateway/src/routes/admin.routes.ts):
  // 1. Session-based authentication (OAuth cookies) - verified by Passport.js deserializeUser
  // 2. RBAC authorization - owner/admin role required (lines 1111-1132)
  // 3. CORS origin validation - only allows requests from authorized frontend origins
  // 4. Same-site cookies - prevents cross-origin session hijacking
  // 5. Enterprise audit logging - all operations logged with tamper-evident chain (lines 1167-1169)
  const isExempt =
    req.method === 'GET' || // Idempotent operations
    req.path.startsWith('/api/auth/') || // OAuth (Passport.js handles state)
    req.path === '/api/waitlist' || // Public email capture
    req.path.startsWith('/api/waitlist/') || // Waitlist sub-routes
    req.path.startsWith('/api/upload/') || // File uploads (CORS + origin validation)
    req.path.startsWith('/api/speckle/') || // Speckle BIM (session auth + CORS + project authz)
    req.path.startsWith('/api/v2/projects/') || // Speckle v2 API proxy (session auth + CORS + service token injection)
    req.path.startsWith('/api/admin/') || // Admin operations (session auth + RBAC + audit logging)
    req.path.startsWith('/api/v1/projects/') || // Voxel/BOX API (session auth + CORS + project authz) DEC-009
    req.path === '/health' || // Health check
    req.path === '/api/health' || // API health check
    req.path === '/ready' || // Ready check
    req.path === '/metrics'; // Prometheus metrics

  if (isExempt) {
    return next();
  }

  // ENTERPRISE FIX: Check for authentication BEFORE CSRF validation
  // Return 401 (Unauthorized) if no session/user exists
  // Return 403 (Forbidden) only if authenticated but CSRF token invalid
  // This follows correct HTTP semantics (RFC 9110)
  const isAuthenticated = req.session && (req.session.userId || req.user);

  if (!isAuthenticated) {
    // No authentication - skip CSRF check, let auth middleware handle 401
    return next();
  }

  // User is authenticated - now enforce CSRF protection
  const token = req.headers['x-csrf-token'] || req.body._csrf;
  const sessionToken = req.session?.csrfToken;

  if (!token || !sessionToken || token !== sessionToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  next();
};

export const securityMiddleware = [
  // Generate CSP nonce for each request (OWASP CSP best practice)
  // Nonce-based CSP eliminates need for 'unsafe-inline' while allowing legitimate inline styles
  (req: Request, res: Response, next: NextFunction) => {
    // Generate cryptographically secure nonce (32 bytes = 256 bits)
    const nonce = crypto.randomBytes(32).toString('base64');
    res.locals.cspNonce = nonce;
    next();
  },

  // Helmet security headers with nonce-based CSP
  (req: Request, res: Response, next: NextFunction) => {
    const nonce = res.locals.cspNonce;

    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Removed 'unsafe-inline' - use nonce for legitimate inline styles
          // Templates should add nonce attribute: <style nonce="${cspNonce}">
          styleSrc: [
            "'self'",
            `'nonce-${nonce}'`, // Nonce for inline styles
            'https://fonts.googleapis.com',
          ],
          scriptSrc: [
            "'self'",
            `'nonce-${nonce}'`, // Nonce for inline scripts
            'https://accounts.google.com',
            'https://www.gstatic.com', // Google OAuth required domain
          ],
          imgSrc: ["'self'", 'data:', 'https:'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'], // Google Fonts
          connectSrc: [
            "'self'",
            'https://accounts.google.com',
            'https://www.googleapis.com',
          ],
          frameSrc: ['https://accounts.google.com'], // Google OAuth iframe
          objectSrc: ["'none'"], // Prevent Flash/plugins (OWASP recommendation)
          baseUri: ["'self'"], // Prevent base tag injection
          formAction: ["'self'"], // Prevent form submission to external domains
        },
      },
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      // Additional security headers
      xssFilter: true, // X-XSS-Protection: 1; mode=block
      noSniff: true, // X-Content-Type-Options: nosniff
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      frameguard: { action: 'deny' }, // X-Frame-Options: DENY (prevent clickjacking)
    })(req, res, next);
  },

  // Add CSRF token to session and expose as cookie for frontend
  (req: Request, res: Response, next: NextFunction) => {
    // Only skip CSRF token generation for OAuth flow endpoints (not /auth/me or /auth/logout)
    // These endpoints use Passport's state parameter for CSRF protection
    const isOAuthFlow =
      req.path === '/auth/google' ||
      req.path === '/auth/google/callback' ||
      req.path.startsWith('/api/auth/google');

    if (isOAuthFlow) {
      return next();
    }

    if (!req.session?.csrfToken) {
      req.session.csrfToken = generateCSRFToken();
    }
    res.locals.csrfToken = req.session.csrfToken;

    // Expose CSRF token as cookie for frontend to read
    // httpOnly: false allows JavaScript to read the cookie (required for CSRF pattern)
    // This follows the "Double Submit Cookie" pattern (OWASP recommended)
    res.cookie('XSRF-TOKEN', req.session.csrfToken, {
      httpOnly: false, // Must be readable by JavaScript
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    next();
  },

  // CSRF protection for state-changing operations
  csrfProtection,
];
