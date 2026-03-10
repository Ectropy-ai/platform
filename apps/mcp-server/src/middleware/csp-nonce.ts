/**
 * =============================================================================
 * ENTERPRISE NONCE-BASED CONTENT SECURITY POLICY
 *
 * PURPOSE: Eliminate 'unsafe-inline' and 'unsafe-eval' from CSP
 * ENTERPRISE PATTERN: Per-request nonce generation for inline content
 *
 * SECURITY FEATURES:
 * - Cryptographically secure nonce per request (128-bit)
 * - Strict CSP directives without unsafe-* fallbacks
 * - Environment-aware policies (dev vs production)
 * - Integration with request context for tracing
 * - Report-only mode for gradual rollout
 *
 * OWASP COMPLIANCE: A7:2017 - Cross-Site Scripting (XSS)
 * =============================================================================
 */

import type { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { mcpLogger } from '../utils/mcp-logger.js';

// Extend Express Request to include nonce
declare global {
  namespace Express {
    interface Request {
      cspNonce?: string;
    }
    interface Response {
      locals: {
        cspNonce?: string;
        [key: string]: any;
      };
    }
  }
}

/**
 * CSP Configuration Interface
 */
export interface CSPConfig {
  enabled: boolean;
  reportOnly: boolean;
  reportUri?: string;
  directives: CSPDirectives;
}

export interface CSPDirectives {
  defaultSrc: string[];
  scriptSrc: string[];
  styleSrc: string[];
  imgSrc: string[];
  connectSrc: string[];
  fontSrc: string[];
  objectSrc: string[];
  mediaSrc: string[];
  frameSrc: string[];
  frameAncestors: string[];
  baseUri: string[];
  formAction: string[];
  upgradeInsecureRequests?: boolean;
  blockAllMixedContent?: boolean;
}

/**
 * Default CSP directives with nonce placeholders
 * NONCE_PLACEHOLDER will be replaced with actual nonce at runtime
 */
const NONCE_PLACEHOLDER = '{{NONCE}}';

/**
 * Production CSP Configuration
 * Strict mode - no unsafe-* directives
 */
export const productionCSPConfig: CSPConfig = {
  enabled: true,
  reportOnly: false,
  reportUri: '/api/csp-report',
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      `'nonce-${NONCE_PLACEHOLDER}'`,
      "'strict-dynamic'", // Allow scripts loaded by trusted scripts
      'https://accounts.google.com',
      'https://apis.google.com',
    ],
    styleSrc: [
      "'self'",
      `'nonce-${NONCE_PLACEHOLDER}'`,
      'https://fonts.googleapis.com',
    ],
    imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
    connectSrc: [
      "'self'",
      'https://accounts.google.com',
      'https://oauth2.googleapis.com',
      'wss:', // WebSocket connections
    ],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'self'", 'https://accounts.google.com'],
    frameAncestors: ["'self'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    upgradeInsecureRequests: true,
    blockAllMixedContent: true,
  },
};

/**
 * Development CSP Configuration
 * Slightly relaxed for developer tools, but still no unsafe-eval
 */
export const developmentCSPConfig: CSPConfig = {
  enabled: true,
  reportOnly: true, // Report-only in dev for easier debugging
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      `'nonce-${NONCE_PLACEHOLDER}'`,
      "'strict-dynamic'",
      'https://accounts.google.com',
      'https://apis.google.com',
    ],
    styleSrc: [
      "'self'",
      `'nonce-${NONCE_PLACEHOLDER}'`,
      'https://fonts.googleapis.com',
    ],
    imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
    connectSrc: [
      "'self'",
      'http://localhost:*',
      'https://localhost:*',
      'ws://localhost:*',
      'wss://localhost:*',
      'https://accounts.google.com',
      'https://oauth2.googleapis.com',
    ],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'self'", 'https://accounts.google.com'],
    frameAncestors: ["'self'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    upgradeInsecureRequests: false, // Don't upgrade in dev
    blockAllMixedContent: false,
  },
};

/**
 * Generate cryptographically secure nonce
 * 128-bit (16 bytes) encoded as base64 for compactness
 */
export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

/**
 * Build CSP header string from directives
 */
function buildCSPHeader(directives: CSPDirectives, nonce: string): string {
  const parts: string[] = [];

  // Helper to process directive value
  const processValue = (value: string): string => {
    return value.replace(NONCE_PLACEHOLDER, nonce);
  };

  // Build each directive
  if (directives.defaultSrc.length) {
    parts.push(`default-src ${directives.defaultSrc.map(processValue).join(' ')}`);
  }
  if (directives.scriptSrc.length) {
    parts.push(`script-src ${directives.scriptSrc.map(processValue).join(' ')}`);
  }
  if (directives.styleSrc.length) {
    parts.push(`style-src ${directives.styleSrc.map(processValue).join(' ')}`);
  }
  if (directives.imgSrc.length) {
    parts.push(`img-src ${directives.imgSrc.join(' ')}`);
  }
  if (directives.connectSrc.length) {
    parts.push(`connect-src ${directives.connectSrc.join(' ')}`);
  }
  if (directives.fontSrc.length) {
    parts.push(`font-src ${directives.fontSrc.join(' ')}`);
  }
  if (directives.objectSrc.length) {
    parts.push(`object-src ${directives.objectSrc.join(' ')}`);
  }
  if (directives.mediaSrc.length) {
    parts.push(`media-src ${directives.mediaSrc.join(' ')}`);
  }
  if (directives.frameSrc.length) {
    parts.push(`frame-src ${directives.frameSrc.join(' ')}`);
  }
  if (directives.frameAncestors.length) {
    parts.push(`frame-ancestors ${directives.frameAncestors.join(' ')}`);
  }
  if (directives.baseUri.length) {
    parts.push(`base-uri ${directives.baseUri.join(' ')}`);
  }
  if (directives.formAction.length) {
    parts.push(`form-action ${directives.formAction.join(' ')}`);
  }
  if (directives.upgradeInsecureRequests) {
    parts.push('upgrade-insecure-requests');
  }
  if (directives.blockAllMixedContent) {
    parts.push('block-all-mixed-content');
  }

  return parts.join('; ');
}

/**
 * Get CSP configuration based on environment
 */
export function getCSPConfig(): CSPConfig {
  const isProduction = process.env['NODE_ENV'] === 'production';
  const baseConfig = isProduction ? productionCSPConfig : developmentCSPConfig;

  // Allow override via environment
  if (process.env['CSP_REPORT_ONLY'] === 'true') {
    return { ...baseConfig, reportOnly: true };
  }
  if (process.env['CSP_DISABLED'] === 'true') {
    return { ...baseConfig, enabled: false };
  }

  return baseConfig;
}

/**
 * CSP Nonce Middleware
 * Generates per-request nonce and sets CSP headers
 */
export function cspNonceMiddleware() {
  const config = getCSPConfig();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!config.enabled) {
      next();
      return;
    }

    // Generate unique nonce for this request
    const nonce = generateNonce();

    // Store nonce in request and response for downstream use
    req.cspNonce = nonce;
    res.locals.cspNonce = nonce;

    // Build CSP header
    const cspHeader = buildCSPHeader(config.directives, nonce);

    // Set appropriate header based on mode
    const headerName = config.reportOnly
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';

    res.setHeader(headerName, cspHeader);

    // Add report-uri if configured
    if (config.reportUri) {
      const currentHeader = res.getHeader(headerName) as string;
      res.setHeader(headerName, `${currentHeader}; report-uri ${config.reportUri}`);
    }

    next();
  };
}

/**
 * CSP Violation Report Handler
 * Endpoint to receive and log CSP violation reports
 */
export function cspReportHandler(
  req: Request,
  res: Response
): void {
  try {
    const report = req.body;

    // Log violation for analysis
    mcpLogger.security('CSP violation detected', 'low', {
      documentUri: report['csp-report']?.['document-uri'],
      violatedDirective: report['csp-report']?.['violated-directive'],
      blockedUri: report['csp-report']?.['blocked-uri'],
      originalPolicy: report['csp-report']?.['original-policy'],
      sourceFile: report['csp-report']?.['source-file'],
      lineNumber: report['csp-report']?.['line-number'],
      columnNumber: report['csp-report']?.['column-number'],
    });

    // Always respond with 204 to not slow down the browser
    res.status(204).end();
  } catch (error) {
    // Don't fail on report parsing errors
    mcpLogger.warn('Failed to parse CSP report', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(204).end();
  }
}

/**
 * Helper to get nonce for use in templates/responses
 * Returns empty string if nonce not available
 */
export function getNonce(req: Request): string {
  return req.cspNonce || '';
}

/**
 * Create HTML script tag with nonce
 */
export function createScriptTag(req: Request, content: string): string {
  const nonce = getNonce(req);
  return `<script nonce="${nonce}">${content}</script>`;
}

/**
 * Create HTML style tag with nonce
 */
export function createStyleTag(req: Request, content: string): string {
  const nonce = getNonce(req);
  return `<style nonce="${nonce}">${content}</style>`;
}

// Export default middleware
export default cspNonceMiddleware;
