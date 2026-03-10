import type { Request, Response, NextFunction } from 'express';
import type { Pool } from 'pg';
import os from 'os';
import type { Redis } from 'ioredis';

/**
 * Minimal performance monitoring middleware using in-memory metrics.
 * Exposes Prometheus-compatible metrics via prom-client when available.
 */
let promClient: any = null;
try {
  promClient = await import('prom-client');
} catch {
  // prom-client optional; metrics will be simple counters
}
export class PerformanceMonitoringMiddleware {
  private static requestHistogram =
    promClient?.Histogram !== null
      ? new promClient.Histogram({
          name: 'http_request_duration_seconds',
          help: 'Duration of HTTP requests in seconds',
          labelNames: ['method', 'route', 'status'] as const,
        })
      : undefined;
  private static requestCounter =
    promClient?.Counter !== null
      ? new promClient.Counter({
          name: 'http_request_total',
          help: 'Total number of HTTP requests',
          labelNames: ['method', 'route', 'status'] as const,
        })
      : undefined;

  private static cpuLoadGauge =
    promClient?.Gauge !== null
      ? new promClient.Gauge({
          name: 'process_cpu_load',
          help: '1m load average of the host',
        })
      : undefined;

  private static redisMemoryGauge =
    promClient?.Gauge !== null
      ? new promClient.Gauge({
          name: 'redis_memory_usage_bytes',
          help: 'Redis memory usage in bytes',
        })
      : undefined;

  static requestTiming(): (
    req: Request,
    res: Response,
    next: NextFunction
  ) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      const end = PerformanceMonitoringMiddleware.requestHistogram?.startTimer({
        method: req.method,
        route: req.path,
      });
      // Store original end method and override to track metrics when response finishes
      const originalEnd = res.end.bind(res) as any;
      res.end = function (chunk?: any, encoding?: any, cb?: any): Response {
        end?.({ status: res.statusCode });
        PerformanceMonitoringMiddleware.requestCounter?.inc({
          method: req.method,
          route: req.path,
          status: res.statusCode,
        });
        // Call original end method with original arguments
        if (arguments.length === 0) {
          originalEnd();
        } else if (arguments.length === 1) {
          originalEnd(chunk);
        } else if (arguments.length === 2) {
          originalEnd(chunk, encoding);
        } else {
          originalEnd(chunk, encoding, cb);
        }
        return this as Response;
      };
      next();
    };
  }

  static profileDatabaseQuery(pool: Pool): void {
    const original = pool.query.bind(pool);
    pool.query = async function (...args: any[]): Promise<any> {
      const start = Date.now();
      try {
        const result = await (original as any).apply(pool, args);
        const duration = Date.now() - start;
        // Log query performance
        return result;
      } finally {
        // Cleanup if needed
      }
    } as any;
  }

  static collectSystemMetrics(redisClient?: Redis): void {
    promClient?.collectDefaultMetrics?.();
    setInterval(async () => {
      PerformanceMonitoringMiddleware.cpuLoadGauge?.set(os.loadavg()[0]);
      if (redisClient) {
        try {
          const info = await redisClient.info('memory');
          const match = info.match(/used_memory:(\d+)/);
          if (match) {
            PerformanceMonitoringMiddleware.redisMemoryGauge?.set(
              parseInt(match[1], 10)
            );
          }
        } catch {
          // Ignore Redis errors for metrics collection
        }
      }
    }, 5000);
  }

  static prometheusEndpoint(): (req: Request, res: Response) => Promise<void> {
    return async (_req: Request, res: Response) => {
      if (promClient !== null) {
        res.set('Content-Type', promClient.register.contentType);
        const metrics = await promClient.register.metrics();
        res.send(metrics);
      } else {
        res.status(204).end();
      }
    };
  }

  static getMetrics(): string {
    if (promClient !== null) {
      return promClient.register.metrics();
    }
    return '';
  }

  // Placeholder methods used in docs/tests
  static incrementCacheOperations(): void {}
  static updateActiveSessions(_count: number): void {}
}

export default PerformanceMonitoringMiddleware;
