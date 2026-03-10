/**
 * =============================================================================
 * ECTROPY REQUEST CONTEXT SERVICE
 *
 * PURPOSE: AsyncLocalStorage-based request context for automatic correlation
 * ENTERPRISE PATTERN: Distributed tracing without manual context passing
 *
 * FEATURES:
 * - Automatic request ID propagation across async boundaries
 * - Correlation ID for cross-service tracing
 * - User context preservation
 * - Service-to-service context forwarding
 *
 * USAGE:
 * // In middleware (runs once per request)
 * app.use(requestContext.middleware());
 *
 * // Anywhere in the request lifecycle (automatically has context)
 * const ctx = requestContext.getContext();
 * logger.info('Operation', { requestId: ctx.requestId });
 *
 * // Or use contextual logger (automatically includes all context)
 * const log = requestContext.getLogger();
 * log.info('Operation completed'); // Automatically includes requestId, userId, etc.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { Logger } from './logger.js';

/**
 * Request context interface - all fields available throughout request lifecycle
 */
export interface RequestContext {
  /** Unique identifier for this request (X-Request-ID header or generated) */
  requestId: string;
  /** Correlation ID for tracing across services (X-Correlation-ID header or generated) */
  correlationId: string;
  /** User ID if authenticated */
  userId?: string;
  /** Session ID if available */
  sessionId?: string;
  /** Service name originating the request */
  sourceService?: string;
  /** Target service handling the request */
  targetService: string;
  /** Request start timestamp for duration tracking */
  startTime: number;
  /** HTTP method (GET, POST, etc.) */
  method?: string;
  /** Request path */
  path?: string;
  /** Client IP address */
  clientIp?: string;
  /** User agent string */
  userAgent?: string;
  /** Additional custom metadata */
  metadata: Record<string, unknown>;
}

/**
 * Headers for cross-service context propagation
 */
export const CONTEXT_HEADERS = {
  REQUEST_ID: 'x-request-id',
  CORRELATION_ID: 'x-correlation-id',
  USER_ID: 'x-user-id',
  SESSION_ID: 'x-session-id',
  SOURCE_SERVICE: 'x-source-service',
} as const;

/**
 * Enterprise Request Context Manager
 * Uses AsyncLocalStorage to maintain context across async operations
 */
class RequestContextManager {
  private storage: AsyncLocalStorage<RequestContext>;
  private serviceName: string;

  constructor(serviceName: string = 'ectropy-platform') {
    this.storage = new AsyncLocalStorage<RequestContext>();
    this.serviceName = serviceName;
  }

  /**
   * Generate a unique request ID
   * Format: req_{timestamp}_{uuid-short} for readability and uniqueness
   */
  generateRequestId(): string {
    const timestamp = Date.now().toString(36);
    const unique = randomUUID().split('-')[0];
    return `req_${timestamp}_${unique}`;
  }

  /**
   * Generate a correlation ID
   * Format: corr_{timestamp}_{uuid-short}
   */
  generateCorrelationId(): string {
    const timestamp = Date.now().toString(36);
    const unique = randomUUID().split('-')[0];
    return `corr_${timestamp}_${unique}`;
  }

  /**
   * Get the current request context
   * Returns undefined if called outside of a request context
   */
  getContext(): RequestContext | undefined {
    return this.storage.getStore();
  }

  /**
   * Get context or throw if not available
   * Use this when context is required
   */
  requireContext(): RequestContext {
    const ctx = this.getContext();
    if (!ctx) {
      throw new Error(
        'Request context not available. Ensure requestContext.middleware() is applied.'
      );
    }
    return ctx;
  }

  /**
   * Get a logger that automatically includes request context
   * This is the recommended way to log within a request
   */
  getLogger(): Logger {
    const ctx = this.getContext();
    const baseLogger = new Logger(this.serviceName);

    if (!ctx) {
      return baseLogger;
    }

    // Return a child logger with context automatically attached
    return baseLogger.child({
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      service: ctx.targetService,
    });
  }

  /**
   * Run a function within a specific context
   * Useful for background jobs or service-to-service calls
   */
  runWithContext<T>(context: Partial<RequestContext>, fn: () => T): T {
    const fullContext: RequestContext = {
      requestId: context.requestId || this.generateRequestId(),
      correlationId: context.correlationId || this.generateCorrelationId(),
      targetService: context.targetService || this.serviceName,
      startTime: context.startTime || Date.now(),
      metadata: context.metadata || {},
      ...context,
    };

    return this.storage.run(fullContext, fn);
  }

  /**
   * Update the current context with additional data
   * Useful for adding user info after authentication
   */
  updateContext(updates: Partial<RequestContext>): void {
    const ctx = this.getContext();
    if (ctx) {
      Object.assign(ctx, updates);
    }
  }

  /**
   * Add metadata to the current context
   */
  addMetadata(key: string, value: unknown): void {
    const ctx = this.getContext();
    if (ctx) {
      ctx.metadata[key] = value;
    }
  }

  /**
   * Express middleware for automatic context setup
   * Apply this early in your middleware chain
   */
  middleware() {
    return (req: any, res: any, next: any) => {
      // Extract or generate IDs
      const requestId =
        (req.headers[CONTEXT_HEADERS.REQUEST_ID] as string) ||
        this.generateRequestId();
      const correlationId =
        (req.headers[CONTEXT_HEADERS.CORRELATION_ID] as string) ||
        requestId; // Use requestId as correlationId if not provided

      // Build context from headers and request
      const context: RequestContext = {
        requestId,
        correlationId,
        userId: req.headers[CONTEXT_HEADERS.USER_ID] as string | undefined,
        sessionId:
          (req.headers[CONTEXT_HEADERS.SESSION_ID] as string) ||
          req.sessionID,
        sourceService: req.headers[CONTEXT_HEADERS.SOURCE_SERVICE] as
          | string
          | undefined,
        targetService: this.serviceName,
        startTime: Date.now(),
        method: req.method,
        path: req.path || req.url,
        clientIp: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
        metadata: {},
      };

      // Attach to request object for compatibility
      req.requestId = requestId;
      req.correlationId = correlationId;
      req.context = context;

      // Set response headers for tracing
      res.setHeader(CONTEXT_HEADERS.REQUEST_ID, requestId);
      res.setHeader(CONTEXT_HEADERS.CORRELATION_ID, correlationId);

      // Log request start
      const logger = new Logger(this.serviceName);
      logger.http('Request received', {
        requestId,
        correlationId,
        method: context.method,
        path: context.path,
        clientIp: context.clientIp,
        userAgent: context.userAgent,
      });

      // Track response for completion logging
      const startTime = context.startTime;
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.http('Request completed', {
          requestId,
          correlationId,
          method: context.method,
          path: context.path,
          statusCode: res.statusCode,
          duration,
          userId: context.userId,
        });
      });

      // Run the rest of the request in this context
      this.storage.run(context, () => {
        next();
      });
    };
  }

  /**
   * Get headers for propagating context to downstream services
   * Use this when making HTTP calls to other services
   */
  getOutboundHeaders(): Record<string, string> {
    const ctx = this.getContext();
    if (!ctx) {
      return {};
    }

    const headers: Record<string, string> = {
      [CONTEXT_HEADERS.REQUEST_ID]: ctx.requestId,
      [CONTEXT_HEADERS.CORRELATION_ID]: ctx.correlationId,
      [CONTEXT_HEADERS.SOURCE_SERVICE]: ctx.targetService,
    };

    if (ctx.userId) {
      headers[CONTEXT_HEADERS.USER_ID] = ctx.userId;
    }
    if (ctx.sessionId) {
      headers[CONTEXT_HEADERS.SESSION_ID] = ctx.sessionId;
    }

    return headers;
  }

  /**
   * Create a child context for background jobs or parallel operations
   * Maintains correlation but generates new request ID
   */
  createChildContext(operation: string): RequestContext {
    const parent = this.getContext();
    return {
      requestId: this.generateRequestId(),
      correlationId: parent?.correlationId || this.generateCorrelationId(),
      userId: parent?.userId,
      sessionId: parent?.sessionId,
      sourceService: parent?.targetService,
      targetService: this.serviceName,
      startTime: Date.now(),
      metadata: {
        parentRequestId: parent?.requestId,
        operation,
      },
    };
  }
}

// Export singleton instance
export const requestContext = new RequestContextManager(
  process.env['SERVICE_NAME'] || 'ectropy-platform'
);

// Export class for custom instances
export { RequestContextManager };
