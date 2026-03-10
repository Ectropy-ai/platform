declare module 'express-rate-limit' {
  import type { Request, Response, NextFunction } from 'express';
  type RequestHandler = (...args: any[]) => any;
  interface Options {
    windowMs?: number;
    max?: number | ((req: Request, res: Response) => number | Promise<number>);
    message?: string;
    keyPrefix?: string;
    keyGenerator?: (req: Request, res: Response) => string;
    handler?: (req: Request, res: Response, next: NextFunction) => any;
    standardHeaders?: boolean | 'draft-6' | 'draft-7' | 'draft-8';
    legacyHeaders?: boolean;
  }
  export function ipKeyGenerator(req: Request | string, prefix?: any): string;
  const rateLimit: (options?: Options) => RequestHandler;
  export default rateLimit;
}
