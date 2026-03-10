/**
 * =============================================================================
 * ENTERPRISE AUDIT MIDDLEWARE (API GATEWAY)
 *
 * PURPOSE: Automatic audit logging for HTTP requests
 * ENTERPRISE PATTERN: Non-intrusive request auditing
 *
 * FEATURES:
 * - Automatic request/response logging
 * - Configurable routes and exclusions
 * - Performance-optimized (async, non-blocking)
 * - Integrates with request context
 * - OAuth-aware event logging
 *
 * COMPLIANCE: SOC2-CC6.1, GDPR-Article30, HIPAA-164.312
 * DEPLOYMENT: Phase 1 Priority 2 - Security Hardening (2025-11-30)
 * =============================================================================
 */

import type { Request, Response, NextFunction } from 'express';
import {
  auditService,
  AuditEventType,
  AuditResourceType,
} from '../services/audit.service.js';

/**
 * Audit middleware configuration
 */
export interface AuditMiddlewareConfig {
  /** Routes to audit (default: all authenticated routes) */
  includePaths?: RegExp[];
  /** Routes to exclude from auditing */
  excludePaths?: RegExp[];
  /** Log request body (default: false for security) */
  logRequestBody?: boolean;
  /** Log response body (default: false) */
  logResponseBody?: boolean;
  /** Maximum body size to log (default: 1KB) */
  maxBodyLogSize?: number;
}

const DEFAULT_CONFIG: AuditMiddlewareConfig = {
  excludePaths: [
    /^\/health$/,
    /^\/metrics$/,
    /^\/api\/csp-report$/,
    /^\/favicon\.ico$/,
    /^\/ready$/,
    /^\/api\/health$/,
  ],
  logRequestBody: false,
  logResponseBody: false,
  maxBodyLogSize: 1024,
};

/**
 * Map HTTP method to audit event type
 */
function getEventType(method: string, statusCode: number): AuditEventType {
  // Security events
  if (statusCode === 401) return AuditEventType.AUTHZ_PERMISSION_DENIED;
  if (statusCode === 403) return AuditEventType.AUTHZ_PERMISSION_DENIED;
  if (statusCode === 429) return AuditEventType.API_RATE_LIMIT_HIT;

  // Resource events by method
  switch (method.toUpperCase()) {
    case 'POST':
      return AuditEventType.RESOURCE_CREATED;
    case 'PUT':
    case 'PATCH':
      return AuditEventType.RESOURCE_UPDATED;
    case 'DELETE':
      return AuditEventType.RESOURCE_DELETED;
    case 'GET':
    default:
      return AuditEventType.RESOURCE_READ;
  }
}

/**
 * Extract resource info from request path
 */
function extractResourceInfo(path: string): {
  resourceId: string;
  resourceType: AuditResourceType;
} {
  // Parse common REST patterns
  const patterns = [
    { regex: /^\/api\/auth\/([^/]+)/, type: AuditResourceType.USER },
    { regex: /^\/api\/users\/([^/]+)/, type: AuditResourceType.USER },
    { regex: /^\/api\/files\/([^/]+)/, type: AuditResourceType.FILE },
    { regex: /^\/api\/upload\/([^/]+)/, type: AuditResourceType.FILE },
    { regex: /^\/api\/ifc\/([^/]+)/, type: AuditResourceType.FILE },
    { regex: /^\/api\/models\/([^/]+)/, type: AuditResourceType.MODEL },
    { regex: /^\/api\/projects\/([^/]+)/, type: AuditResourceType.PROJECT },
    { regex: /^\/api\/v1\/projects\/([^/]+)/, type: AuditResourceType.PROJECT },
    { regex: /^\/api\/sessions\/([^/]+)/, type: AuditResourceType.SESSION },
    { regex: /^\/api\/keys\/([^/]+)/, type: AuditResourceType.API_KEY },
    { regex: /^\/api\/admin\/([^/]+)/, type: AuditResourceType.CONFIG },
  ];

  for (const { regex, type } of patterns) {
    const match = path.match(regex);
    if (match) {
      return { resourceId: match[1], resourceType: type };
    }
  }

  // Default to path as resource
  return { resourceId: path, resourceType: AuditResourceType.SYSTEM };
}

/**
 * Determine severity based on response and path
 */
function determineSeverity(
  statusCode: number,
  path: string
): 'low' | 'medium' | 'high' | 'critical' {
  // Security-sensitive paths
  const sensitivePaths = ['/api/auth', '/api/admin', '/api/keys'];
  const isSensitive = sensitivePaths.some((p) => path.startsWith(p));

  if (statusCode >= 500) return 'high';
  if (statusCode === 401 || statusCode === 403)
    return isSensitive ? 'high' : 'medium';
  if (statusCode === 429) return 'medium';
  if (isSensitive && statusCode >= 200 && statusCode < 300) return 'low';

  return 'low';
}

/**
 * Sanitize body for logging (remove sensitive fields)
 */
function sanitizeBody(
  body: any,
  maxSize: number
): Record<string, unknown> | null {
  if (!body) return null;

  const sensitiveFields = [
    'password',
    'token',
    'secret',
    'apiKey',
    'api_key',
    'authorization',
    'credit_card',
    'creditCard',
    'ssn',
    'private_key',
    'privateKey',
    'accessToken',
    'refreshToken',
  ];

  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }

  const stringified = JSON.stringify(sanitized);
  if (stringified.length > maxSize) {
    return { _truncated: true, _size: stringified.length };
  }

  return sanitized;
}

/**
 * Create audit middleware with configuration
 */
export function createAuditMiddleware(config: AuditMiddlewareConfig = {}) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // Check if path should be excluded
    if (mergedConfig.excludePaths) {
      const shouldExclude = mergedConfig.excludePaths.some((pattern) =>
        pattern.test(req.path)
      );
      if (shouldExclude) {
        next();
        return;
      }
    }

    // Check if path should be included (if includePaths is specified)
    if (mergedConfig.includePaths && mergedConfig.includePaths.length > 0) {
      const shouldInclude = mergedConfig.includePaths.some((pattern) =>
        pattern.test(req.path)
      );
      if (!shouldInclude) {
        next();
        return;
      }
    }

    // Capture start time for response time tracking
    const startTime = Date.now();

    // Capture original end function
    const originalEnd = res.end;
    let responseBody: any;

    // Override end to capture response (bind to preserve context)
    const boundOriginalEnd = originalEnd.bind(res);
    res.end = ((
      chunk?: any,
      encoding?: BufferEncoding | (() => void),
      cb?: () => void
    ) => {
      if (mergedConfig.logResponseBody && chunk) {
        try {
          responseBody = typeof chunk === 'string' ? JSON.parse(chunk) : chunk;
        } catch {
          // Not JSON, ignore
        }
      }
      return boundOriginalEnd(chunk, encoding as any, cb);
    }) as typeof res.end;

    // Continue with request processing
    res.on('finish', async () => {
      try {
        const duration = Date.now() - startTime;
        const { resourceId, resourceType } = extractResourceInfo(req.path);
        const eventType = getEventType(req.method, res.statusCode);
        const severity = determineSeverity(res.statusCode, req.path);

        // Build event data
        const eventData: Record<string, unknown> = {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          query: Object.keys(req.query).length > 0 ? req.query : undefined,
        };

        // Optionally log request body
        if (mergedConfig.logRequestBody && req.body) {
          eventData.requestBody = sanitizeBody(
            req.body,
            mergedConfig.maxBodyLogSize || 1024
          );
        }

        // Optionally log response body
        if (mergedConfig.logResponseBody && responseBody) {
          eventData.responseBody = sanitizeBody(
            responseBody,
            mergedConfig.maxBodyLogSize || 1024
          );
        }

        // Get actor from authenticated user
        const user = (req as any).user;
        const actorId = user?.id || user?.userId || 'anonymous';

        // Log the audit event (fire-and-forget for performance)
        auditService
          .log({
            eventType,
            resourceId,
            resourceType,
            actorId,
            eventData,
            severity,
          })
          .catch(() => {
            // Ignore audit failures to not affect request handling
          });
      } catch {
        // Ignore errors in audit middleware
      }
    });

    next();
  };
}

/**
 * Pre-configured audit middleware for authentication routes
 * OAuth-aware: logs login, logout, token refresh, failures
 */
export const authAuditMiddleware = createAuditMiddleware({
  includePaths: [/^\/api\/auth\//],
  logRequestBody: false, // Never log auth request bodies (passwords, etc.)
  logResponseBody: false,
});

/**
 * Pre-configured audit middleware for admin routes
 * Enhanced logging for administrative actions
 */
export const adminAuditMiddleware = createAuditMiddleware({
  includePaths: [/^\/api\/admin\//],
  logRequestBody: true,
  logResponseBody: true,
  maxBodyLogSize: 2048,
});

/**
 * Pre-configured audit middleware for file operations
 * Tracks uploads, downloads, deletes
 */
export const fileAuditMiddleware = createAuditMiddleware({
  includePaths: [/^\/api\/upload\//, /^\/api\/ifc\//, /^\/api\/files\//],
  logRequestBody: false, // File uploads are too large
  logResponseBody: false,
});

/**
 * Default export - general audit middleware
 */
export default createAuditMiddleware;
