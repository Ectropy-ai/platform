import type { Request, Response, NextFunction } from 'express';

interface MetricsData {
  requestCount: number;
  errorCount: number;
  responseTime: number[];
}

const metrics: MetricsData = {
  requestCount: 0,
  errorCount: 0,
  responseTime: [],
};

export const metricsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = Date.now();
  metrics.requestCount++;

  res.on('finish', () => {
    const duration = Date.now() - start;
    metrics.responseTime.push(duration);

    if (res.statusCode >= 400) {
      metrics.errorCount++;
    }
  });

  next();
};

export const getMetrics = () => metrics;
