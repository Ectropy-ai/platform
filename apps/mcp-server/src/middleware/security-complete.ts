import helmet from 'helmet';
import { createRateLimiter } from './rate-limiter-fixed.js';

export const securityMiddleware = [
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  }),
  createRateLimiter(),
];
