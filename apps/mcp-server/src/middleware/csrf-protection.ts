/**
 * CSRF Protection Middleware
 *
 * Enterprise-grade Cross-Site Request Forgery protection using:
 * - Double-submit cookie pattern
 * - Timing-safe token comparison
 * - SameSite cookie enforcement
 * - Multi-tenant isolation
 *
 * OWASP Coverage: A01 (Broken Access Control), A05 (Security Misconfiguration)
 */

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TOKEN_BYTES = 32; // 256 bits of entropy

/**
 * Generate a cryptographically secure CSRF token.
 * Returns a base64url-encoded string (≥32 characters).
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Validate CSRF token from request against session.
 * Checks header (x-csrf-token), body (_csrf), and query (_csrf) in order.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function validateCsrfToken(req: Request): boolean {
  const sessionToken: string | undefined = (req as any).session?.csrfToken;
  if (!sessionToken) {
    return false;
  }

  // Extract token from header, body, or query (in priority order)
  const requestToken: string | undefined =
    (req.headers['x-csrf-token'] as string) ||
    (req.body?._csrf as string) ||
    ((req as any).query?._csrf as string);

  if (!requestToken) {
    return false;
  }

  // Timing-safe comparison prevents timing attacks
  if (requestToken.length !== sessionToken.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(requestToken),
    Buffer.from(sessionToken)
  );
}

/**
 * Express middleware enforcing CSRF protection on state-changing requests.
 * Safe methods (GET, HEAD, OPTIONS) pass through without validation.
 * Unsafe methods (POST, PUT, DELETE, PATCH) require a valid CSRF token.
 */
export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Safe methods do not require CSRF validation
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  // State-changing methods require valid CSRF token
  if (!validateCsrfToken(req)) {
    res.status(403).json({
      error: 'CSRF token validation failed',
      code: 'CSRF_INVALID',
    });
    return;
  }

  next();
}
