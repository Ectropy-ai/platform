// Performance Metrics Collection Middleware
// Enterprise-grade performance monitoring with Prometheus integration
// Phase 2: Performance Monitoring & SLOs

import { Request, Response, NextFunction } from 'express';
import { Histogram, Counter } from 'prom-client';

// HTTP request duration histogram
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [10, 50, 100, 200, 300, 500, 1000, 2000, 5000],
});

// HTTP request counter
const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

// Error counter
const httpErrorsTotal = new Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors',
  labelNames: ['method', 'route', 'status_code', 'error_type'],
});

export const metricsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const start = Date.now();

  // Track when response finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route?.path || req.path;
    const statusCode = res.statusCode.toString();
    
    // Record request duration
    httpRequestDuration
      .labels(req.method, route, statusCode)
      .observe(duration);
    
    // Increment request counter
    httpRequestTotal
      .labels(req.method, route, statusCode)
      .inc();
    
    // Track errors (4xx and 5xx responses)
    if (res.statusCode >= 400) {
      const errorType = res.statusCode >= 500 ? 'server_error' : 'client_error';
      httpErrorsTotal
        .labels(req.method, route, statusCode, errorType)
        .inc();
    }
  });

  next();
};

export default metricsMiddleware;
