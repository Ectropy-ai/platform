import type { Application, Request, Response, NextFunction } from 'express';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
  Gauge,
} from 'prom-client';
import os from 'os';
import { redisClient } from './cache/redis.js';

const register = new Registry();
collectDefaultMetrics({ register });

const requestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'] as const,
});
register.registerMetric(requestDuration);

const requestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
});
register.registerMetric(requestTotal);

const featureDuration = new Histogram({
  name: 'mcp_feature_duration_seconds',
  help: 'Duration of MCP feature calls in seconds',
  labelNames: ['feature'] as const,
});
register.registerMetric(featureDuration);

const featureUsage = new Counter({
  name: 'mcp_feature_usage_total',
  help: 'Total number of MCP feature calls',
  labelNames: ['feature'] as const,
});
register.registerMetric(featureUsage);

const cpuLoad = new Gauge({
  name: 'process_cpu_load',
  help: '1m load average of the host',
});
register.registerMetric(cpuLoad);

const redisMemoryUsage = new Gauge({
  name: 'redis_memory_usage_bytes',
  help: 'Redis memory usage in bytes',
});
register.registerMetric(redisMemoryUsage);

setInterval(async () => {
  cpuLoad.set(os.loadavg()[0]);
  try {
    if (redisClient) {
      const info = await redisClient.info('memory');
      const match = info.match(/used_memory:(\d+)/);
      if (match) {
        redisMemoryUsage.set(parseInt(match[1], 10));
      }
    }
  } catch {
    // ignore redis errors
  }
}, 5000);

function requestMetrics(req: Request, res: Response, next: NextFunction): void {
  const end = requestDuration.startTimer({
    method: req.method,
    route: req.path,
  });
  res.on('finish', () => {
    end({ status: res.statusCode });
    requestTotal.inc({
      method: req.method,
      route: req.path,
      status: res.statusCode,
    });
  });
  next();
}

export function setupMonitoring(app: Application): void {
  app.use(requestMetrics);

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  });
}

export function startFeatureMetric(feature: string): () => void {
  featureUsage.inc({ feature });
  return featureDuration.startTimer({ feature });
}
