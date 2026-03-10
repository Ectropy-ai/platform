/**
 * Security Utilities
 * Enterprise-grade security functions for MCP Server
 */

import { timingSafeEqual } from 'crypto';

/**
 * Constant-time string comparison
 * Prevents timing attacks by ensuring comparison always takes the same time
 *
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns true if strings are equal, false otherwise
 *
 * @example
 * const isValid = constantTimeCompare(userApiKey, expectedApiKey);
 */
export function constantTimeCompare(
  a: string | undefined,
  b: string | undefined
): boolean {
  // Handle undefined/null cases
  if (!a || !b) {
    return false;
  }

  // Ensure both strings are the same length for timing safety
  // If lengths differ, use dummy comparison to maintain constant time
  if (a.length !== b.length) {
    // Still perform a comparison to prevent timing analysis
    const dummy = Buffer.from('a'.repeat(Math.max(a.length, b.length)));
    timingSafeEqual(dummy, dummy);
    return false;
  }

  try {
    const bufferA = Buffer.from(a, 'utf8');
    const bufferB = Buffer.from(b, 'utf8');

    // Use crypto.timingSafeEqual for constant-time comparison
    return timingSafeEqual(bufferA, bufferB);
  } catch (error) {
    // If buffer creation fails, return false
    return false;
  }
}

/**
 * Validate API key format
 * Ensures API key meets minimum security requirements
 *
 * @param apiKey - API key to validate
 * @returns true if valid format, false otherwise
 */
export function isValidApiKeyFormat(apiKey: string | undefined): boolean {
  if (!apiKey) {
    return false;
  }

  // Minimum length for security
  if (apiKey.length < 32) {
    return false;
  }

  // Must contain only safe characters (alphanumeric + common symbols)
  const safeCharPattern = /^[a-zA-Z0-9_\-:.=+/]+$/;
  if (!safeCharPattern.test(apiKey)) {
    return false;
  }

  return true;
}

/**
 * Sanitize input string to prevent injection attacks
 * Removes or escapes potentially dangerous characters
 *
 * @param input - Input string to sanitize
 * @param maxLength - Maximum allowed length (default: 1000)
 * @returns Sanitized string
 */
export function sanitizeInput(input: string, maxLength: number = 1000): string {
  if (!input) {
    return '';
  }

  // Trim to max length
  let sanitized = input.slice(0, maxLength);

  // Remove control characters except newline and tab
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Validate file path to prevent directory traversal attacks
 *
 * @param filePath - File path to validate
 * @returns true if safe, false if potentially malicious
 */
export function isSecureFilePath(filePath: string): boolean {
  if (!filePath) {
    return false;
  }

  // Reject paths with directory traversal attempts
  if (filePath.includes('..')) {
    return false;
  }
  if (filePath.includes('~')) {
    return false;
  }

  // Reject absolute paths starting with / or drive letters
  if (filePath.startsWith('/')) {
    return false;
  }
  if (/^[a-zA-Z]:/.test(filePath)) {
    return false;
  }

  // Reject null bytes
  if (filePath.includes('\0')) {
    return false;
  }

  return true;
}

/**
 * Generate secure random token
 * Uses crypto module for cryptographically secure random generation
 *
 * @param length - Length of token in bytes (default: 32)
 * @returns Hex-encoded random token
 */
export function generateSecureToken(length: number = 32): string {
  const { randomBytes } = require('crypto');
  return randomBytes(length).toString('hex');
}

/**
 * Rate limiting key generator
 * Creates consistent keys for rate limiting based on request properties
 *
 * @param identifier - Unique identifier (IP, user ID, API key)
 * @param endpoint - Endpoint being accessed
 * @returns Rate limiting key
 */
export function generateRateLimitKey(
  identifier: string,
  endpoint: string
): string {
  const sanitizedIdentifier = sanitizeInput(identifier, 100);
  const sanitizedEndpoint = sanitizeInput(endpoint, 100);
  return `ratelimit:${sanitizedIdentifier}:${sanitizedEndpoint}`;
}

/**
 * Hash sensitive data for logging
 * Allows logging of data while maintaining privacy
 *
 * @param data - Data to hash
 * @returns SHA-256 hash of data (first 8 characters)
 */
export function hashForLogging(data: string): string {
  const { createHash } = require('crypto');
  const hash = createHash('sha256').update(data).digest('hex');
  return hash.substring(0, 8);
}

/**
 * Validate URL to prevent SSRF attacks
 *
 * @param url - URL to validate
 * @returns true if safe, false if potentially malicious
 */
export function isSecureUrl(url: string): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    // Reject localhost and private IP ranges in production
    const hostname = parsed.hostname.toLowerCase();
    const privateHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];

    // In production, reject private IPs
    if (process.env.NODE_ENV === 'production') {
      if (privateHosts.includes(hostname)) {
        return false;
      }
      if (hostname.startsWith('192.168.')) {
        return false;
      }
      if (hostname.startsWith('10.')) {
        return false;
      }
      if (hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) {
        return false;
      }
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Security headers configuration for helmet.js
 *
 * ENTERPRISE NOTE: CSP is now handled by dedicated csp-nonce middleware
 * to support per-request nonces. This helmet config excludes CSP.
 *
 * CSP header is set by: src/middleware/csp-nonce.ts
 */
export const securityHeadersConfig = {
  // Disable helmet's CSP - we use custom nonce-based CSP middleware
  contentSecurityPolicy: false,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: {
    action: 'deny',
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin' as const,
  },
  // Additional enterprise security headers
  crossOriginEmbedderPolicy: false, // Disabled to allow third-party resources
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' as const }, // Allow OAuth popups
  crossOriginResourcePolicy: { policy: 'cross-origin' as const }, // Allow cross-origin API calls
  dnsPrefetchControl: { allow: false }, // Prevent DNS prefetch leaks
  originAgentCluster: true, // Isolate origins for security
};

/**
 * CORS configuration with security best practices
 */
export function getCorsOptions(allowedOrigins: (string | RegExp)[]) {
  return {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin is in allowed list
      const isAllowed = allowedOrigins.some((allowed: string | RegExp) => {
        if (allowed === '*') {
          return true;
        }
        if (typeof allowed === 'string') {
          return allowed === origin;
        }
        // Handle regex patterns
        if (allowed instanceof RegExp) {
          return allowed.test(origin);
        }
        return false;
      });

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    maxAge: 86400, // 24 hours
  };
}
