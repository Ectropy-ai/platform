import { Request, Response, NextFunction } from 'express';
import {
  Registry,
  Histogram,
  Counter,
  collectDefaultMetrics,
} from 'prom-client';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

/**
 * Enterprise Performance Monitoring Middleware
 *
 * Features:
 * - HTTP request duration histogram with latency buckets
 * - Request counter by method, route, and status code
 * - Slow request logging (>1s threshold)
 * - Prometheus metrics endpoint for scraping
 * - Default Node.js metrics (memory, CPU, event loop)
 *
 * Usage:
 * ```typescript
 * import { performanceMonitor, metricsEndpoint } from './middleware/performance-monitor';
 *
 * // Apply monitoring to all routes
 * app.use(performanceMonitor);
 *
 * // Expose metrics endpoint (should be protected in production)
 * app.get('/metrics', metricsEndpoint);
 * ```
 */

// Create a new registry for Prometheus metrics
export const register = new Registry();

// Collect default metrics (memory, CPU, event loop lag, etc.)
// Interval: 10 seconds
collectDefaultMetrics({
  register,
  prefix: 'ectropy_api_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // GC duration buckets in seconds
});

/**
 * HTTP Request Duration Histogram
 *
 * Tracks request latency with the following buckets:
 * - 0.005s (5ms)   - Very fast queries
 * - 0.01s (10ms)   - Fast queries
 * - 0.025s (25ms)  - Quick queries
 * - 0.05s (50ms)   - Normal queries
 * - 0.1s (100ms)   - Target max for good UX
 * - 0.25s (250ms)  - Acceptable
 * - 0.5s (500ms)   - Slow
 * - 1s             - Very slow
 * - 2.5s           - Critical
 * - 5s             - Timeout territory
 * - 10s            - Maximum before timeout
 */
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/**
 * HTTP Request Counter
 *
 * Tracks total number of requests by method, route, and status code.
 * Useful for identifying:
 * - Most frequently used endpoints
 * - Error rates by endpoint
 * - Traffic patterns
 */
const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

/**
 * Slow Request Counter
 *
 * Tracks requests that exceed the 1-second threshold.
 * These requests need optimization.
 */
const httpSlowRequestCounter = new Counter({
  name: 'http_slow_requests_total',
  help: 'Total number of slow HTTP requests (>1s)',
  labelNames: ['method', 'route'],
  registers: [register],
});

/**
 * Normalize route path for metrics
 *
 * Converts dynamic route parameters to generic placeholders to prevent
 * cardinality explosion in Prometheus.
 *
 * Examples:
 * - /api/projects/123 → /api/projects/:id
 * - /api/users/abc-def-ghi → /api/users/:id
 * - /api/files/upload/456 → /api/files/upload/:id
 */
function normalizeRoutePath(path: string): string {
  // Remove query string
  const pathWithoutQuery = path.split('?')[0];

  // Common patterns to normalize
  return (
    pathWithoutQuery
      // UUIDs: abc-def-ghi → :id
      .replace(
        /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        '/:id'
      )
      // Numeric IDs: /123 → /:id
      .replace(/\/\d+/g, '/:id') ||
    // File extensions: .pdf, .ifc, .png → preserve
    // Health checks: preserve exact paths
    '/'
  );
}

/**
 * Performance Monitoring Middleware
 *
 * Instruments all HTTP requests with:
 * 1. Request duration tracking
 * 2. Request counting
 * 3. Slow request detection and logging
 *
 * @example
 * app.use(performanceMonitor);
 */
export const performanceMonitor = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = process.hrtime();

  // Capture the original end function
  const originalEnd = res.end;

  // Override res.end to capture metrics when response completes
  res.end = function (this: Response, chunk?: any, encoding?: BufferEncoding | (() => void), cb?: () => void): Response {
    // Calculate duration in seconds
    const hrDuration = process.hrtime(startTime);
    const durationSeconds = hrDuration[0] + hrDuration[1] / 1e9;

    // Normalize the route path to prevent cardinality explosion
    const route = normalizeRoutePath(req.path);
    const method = req.method;
    const statusCode = res.statusCode.toString();

    // Record metrics
    httpRequestDuration
      .labels(method, route, statusCode)
      .observe(durationSeconds);
    httpRequestCounter.labels(method, route, statusCode).inc();

    // Log slow requests (>1 second)
    if (durationSeconds > 1) {
      httpSlowRequestCounter.labels(method, route).inc();

      logger.warn('Slow request detected', {
        method,
        route,
        path: req.path, // Original path with actual IDs for debugging
        statusCode,
        duration: `${(durationSeconds * 1000).toFixed(2)}ms`,
        query: req.query,
        ip: req.ip,
      });
    }

    // Call the original end function
    return originalEnd.call(this, chunk, encoding as BufferEncoding, cb) as any;
  };

  next();
};

/**
 * Metrics Endpoint Handler
 *
 * Exposes Prometheus metrics in text format for scraping.
 *
 * Security Considerations:
 * - In production, this endpoint should be:
 *   1. Protected with authentication/API key
 *   2. Only accessible from Prometheus server IP
 *   3. Not exposed to public internet
 *   4. Rate limited
 *
 * Nginx Configuration Example:
 * ```nginx
 * location /metrics {
 *   allow 10.0.0.0/8;      # Internal network only
 *   deny all;
 *   proxy_pass http://api_backend/metrics;
 * }
 * ```
 *
 * @example
 * app.get('/metrics', metricsEndpoint);
 */
export const metricsEndpoint = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    res.setHeader('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.send(metrics);
  } catch (error) {
    logger.error('Error generating metrics', { error });
    res.status(500).send('Error generating metrics');
  }
};

/**
 * Reset all metrics (useful for testing)
 */
export const resetMetrics = (): void => {
  register.resetMetrics();
};

export default {
  performanceMonitor,
  metricsEndpoint,
  resetMetrics,
  register,
};
