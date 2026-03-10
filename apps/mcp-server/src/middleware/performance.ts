import compression from 'compression';
import type { Request, Response, NextFunction } from 'express';

type Handler = (_req: Request, _res: Response, _next: NextFunction) => void;

export const compressionMiddleware: Handler = compression({
  filter: (req: Request, res: Response) => {
    return compression.filter(req, res);
  },
  threshold: 1024,
}) as Handler;

export const cacheHeaders = (duration: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    res.set('Cache-Control', `public, max-age=${duration}`);
    next();
  };
};
