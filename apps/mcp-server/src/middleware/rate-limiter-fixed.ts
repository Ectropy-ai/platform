// Simple in-memory rate limiter without external dependencies
import type { Request, Response, NextFunction } from 'express';

export const createRateLimiter = () => {
  const requests = new Map<string, { count: number; timestamp: number }>();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxRequests = 100;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const entry = requests.get(key) || { count: 0, timestamp: now };

    if (now - entry.timestamp > windowMs) {
      entry.count = 0;
      entry.timestamp = now;
    }

    entry.count++;
    requests.set(key, entry);

    if (entry.count > maxRequests) {
      res.status(429).send('Too many requests from this IP');
      return;
    }

    next();
  };
};

export default createRateLimiter;
