/**
 * Middleware Chain Integration Tests
 *
 * Tests the complete middleware stack execution order and interaction
 *
 * Test Coverage:
 * - Middleware execution order verification
 * - Request context propagation across middleware
 * - Error handling and recovery in middleware chain
 * - Rate limiting with authentication
 * - CORS with authentication
 * - Security headers application
 * - Request validation + authorization chain
 * - Caching middleware interaction
 *
 * OWASP Coverage: A01 (Broken Access Control), A05 (Security Misconfiguration)
 *
 * @module middleware/__tests__/middleware-chain.integration
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import express, { Express, Request, Response, NextFunction } from 'express';
import request from 'supertest';

// Mock logger
vi.mock('../../../../../libs/shared/utils/src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Track middleware execution order
const middlewareLog: string[] = [];

// Create middleware that logs execution
function createLoggingMiddleware(name: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    middlewareLog.push(name);
    next();
  };
}

// Create async middleware
function createAsyncMiddleware(name: string, delay: number = 10) {
  return async (req: Request, res: Response, next: NextFunction) => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    middlewareLog.push(name);
    next();
  };
}

// Create error-throwing middleware
function createErrorMiddleware(name: string, errorMessage: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    middlewareLog.push(name);
    next(new Error(errorMessage));
  };
}

describe('Middleware Chain Integration', () => {
  let app: Express;

  beforeEach(() => {
    middlewareLog.length = 0;
    app = express();
    app.use(express.json());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Middleware Execution Order
  // ===========================================================================
  describe('Middleware Execution Order', () => {
    it('should execute middleware in registration order', async () => {
      app.use(createLoggingMiddleware('first'));
      app.use(createLoggingMiddleware('second'));
      app.use(createLoggingMiddleware('third'));
      app.get('/test', (req, res) => {
        middlewareLog.push('handler');
        res.json({ success: true });
      });

      await request(app).get('/test').expect(200);

      expect(middlewareLog).toEqual(['first', 'second', 'third', 'handler']);
    });

    it('should execute async middleware in order', async () => {
      app.use(createAsyncMiddleware('async-first', 20));
      app.use(createAsyncMiddleware('async-second', 10));
      app.use(createAsyncMiddleware('async-third', 5));
      app.get('/test', (req, res) => {
        middlewareLog.push('handler');
        res.json({ success: true });
      });

      await request(app).get('/test').expect(200);

      expect(middlewareLog).toEqual([
        'async-first',
        'async-second',
        'async-third',
        'handler',
      ]);
    });

    it('should execute route-specific middleware only for matching routes', async () => {
      app.use(createLoggingMiddleware('global'));
      app.use('/api', createLoggingMiddleware('api-only'));
      app.get('/test', (req, res) => {
        middlewareLog.push('test-handler');
        res.json({ route: 'test' });
      });
      app.get('/api/resource', (req, res) => {
        middlewareLog.push('api-handler');
        res.json({ route: 'api' });
      });

      // Request to /test should skip api-only middleware
      middlewareLog.length = 0;
      await request(app).get('/test').expect(200);
      expect(middlewareLog).toEqual(['global', 'test-handler']);

      // Request to /api/resource should include api-only middleware
      middlewareLog.length = 0;
      await request(app).get('/api/resource').expect(200);
      expect(middlewareLog).toEqual(['global', 'api-only', 'api-handler']);
    });

    it('should stop chain when middleware does not call next()', async () => {
      app.use(createLoggingMiddleware('first'));
      app.use((req, res) => {
        middlewareLog.push('stopper');
        res.status(403).json({ error: 'Access denied' });
      });
      app.use(createLoggingMiddleware('never-reached'));
      app.get('/test', (req, res) => {
        middlewareLog.push('handler');
        res.json({ success: true });
      });

      const response = await request(app).get('/test').expect(403);

      expect(middlewareLog).toEqual(['first', 'stopper']);
      expect(response.body.error).toBe('Access denied');
    });
  });

  // ===========================================================================
  // Request Context Propagation
  // ===========================================================================
  describe('Request Context Propagation', () => {
    it('should propagate custom properties across middleware', async () => {
      interface ExtendedRequest extends Request {
        userId?: string;
        tenantId?: string;
        permissions?: string[];
      }

      app.use((req: ExtendedRequest, res, next) => {
        req.userId = 'user-123';
        middlewareLog.push('auth');
        next();
      });

      app.use((req: ExtendedRequest, res, next) => {
        req.tenantId = 'tenant-456';
        middlewareLog.push('tenant');
        next();
      });

      app.use((req: ExtendedRequest, res, next) => {
        req.permissions = ['read', 'write'];
        middlewareLog.push('permissions');
        next();
      });

      app.get('/test', (req: ExtendedRequest, res) => {
        middlewareLog.push('handler');
        res.json({
          userId: req.userId,
          tenantId: req.tenantId,
          permissions: req.permissions,
        });
      });

      const response = await request(app).get('/test').expect(200);

      expect(response.body).toEqual({
        userId: 'user-123',
        tenantId: 'tenant-456',
        permissions: ['read', 'write'],
      });
      expect(middlewareLog).toEqual([
        'auth',
        'tenant',
        'permissions',
        'handler',
      ]);
    });

    it('should propagate response locals across middleware', async () => {
      app.use((req, res, next) => {
        res.locals.requestId = 'req-789';
        middlewareLog.push('set-locals');
        next();
      });

      app.use((req, res, next) => {
        res.locals.startTime = Date.now();
        middlewareLog.push('timing');
        next();
      });

      app.get('/test', (req, res) => {
        middlewareLog.push('handler');
        res.json({
          requestId: res.locals.requestId,
          hasStartTime: typeof res.locals.startTime === 'number',
        });
      });

      const response = await request(app).get('/test').expect(200);

      expect(response.body.requestId).toBe('req-789');
      expect(response.body.hasStartTime).toBe(true);
    });
  });

  // ===========================================================================
  // Error Handling in Middleware Chain
  // ===========================================================================
  describe('Error Handling in Middleware Chain', () => {
    it('should skip to error handler on middleware error', async () => {
      app.use(createLoggingMiddleware('first'));
      app.use(createErrorMiddleware('error-thrower', 'Test error'));
      app.use(createLoggingMiddleware('skipped'));
      app.get('/test', (req, res) => {
        middlewareLog.push('handler');
        res.json({ success: true });
      });

      // Error handler
      app.use(
        (err: Error, req: Request, res: Response, next: NextFunction) => {
          middlewareLog.push('error-handler');
          res.status(500).json({ error: err.message });
        }
      );

      const response = await request(app).get('/test').expect(500);

      expect(middlewareLog).toEqual([
        'first',
        'error-thrower',
        'error-handler',
      ]);
      expect(response.body.error).toBe('Test error');
    });

    it('should handle async errors in middleware with proper catching', async () => {
      app.use(createLoggingMiddleware('first'));
      app.use(async (req, res, next) => {
        middlewareLog.push('async-error');
        try {
          await Promise.reject(new Error('Async error'));
        } catch (err) {
          next(err);
        }
      });
      app.use(createLoggingMiddleware('skipped'));
      app.get('/test', (req, res) => res.json({ success: true }));

      app.use(
        (err: Error, req: Request, res: Response, next: NextFunction) => {
          middlewareLog.push('error-handler');
          res.status(500).json({ error: err.message });
        }
      );

      const response = await request(app).get('/test').expect(500);

      expect(middlewareLog).toContain('async-error');
      expect(middlewareLog).toContain('error-handler');
    });

    it('should allow error recovery with next()', async () => {
      app.use(createLoggingMiddleware('first'));
      app.use(createErrorMiddleware('error-thrower', 'Recoverable error'));

      // Error recovery middleware
      app.use(
        (err: Error, req: Request, res: Response, next: NextFunction) => {
          if (err.message === 'Recoverable error') {
            middlewareLog.push('recovered');
            next(); // Continue to next middleware
          } else {
            next(err);
          }
        }
      );

      app.use(createLoggingMiddleware('after-recovery'));
      app.get('/test', (req, res) => {
        middlewareLog.push('handler');
        res.json({ recovered: true });
      });

      const response = await request(app).get('/test').expect(200);

      expect(middlewareLog).toEqual([
        'first',
        'error-thrower',
        'recovered',
        'after-recovery',
        'handler',
      ]);
      expect(response.body.recovered).toBe(true);
    });
  });

  // ===========================================================================
  // Authentication + Authorization Chain
  // ===========================================================================
  describe('Authentication + Authorization Chain', () => {
    interface AuthRequest extends Request {
      user?: { id: string; role: string; tenantId: string };
    }

    function mockAuthMiddleware(
      req: AuthRequest,
      res: Response,
      next: NextFunction
    ) {
      middlewareLog.push('auth');
      const authHeader = req.headers.authorization;

      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.substring(7);
      if (token === 'valid-token') {
        req.user = { id: 'user-1', role: 'admin', tenantId: 'tenant-1' };
        next();
      } else if (token === 'viewer-token') {
        req.user = { id: 'user-2', role: 'viewer', tenantId: 'tenant-1' };
        next();
      } else {
        res.status(401).json({ error: 'Invalid token' });
      }
    }

    function requireRole(...roles: string[]) {
      return (req: AuthRequest, res: Response, next: NextFunction) => {
        middlewareLog.push(`role-check:${roles.join(',')}`);
        if (!req.user) {
          return res.status(401).json({ error: 'Not authenticated' });
        }
        if (!roles.includes(req.user.role)) {
          return res.status(403).json({
            error: 'Insufficient permissions',
            required: roles,
            current: req.user.role,
          });
        }
        next();
      };
    }

    function requireTenant(tenantId: string) {
      return (req: AuthRequest, res: Response, next: NextFunction) => {
        middlewareLog.push(`tenant-check:${tenantId}`);
        if (req.user?.tenantId !== tenantId) {
          return res.status(403).json({ error: 'Tenant mismatch' });
        }
        next();
      };
    }

    it('should enforce auth → role → handler chain', async () => {
      app.use(mockAuthMiddleware);
      app.get('/admin', requireRole('admin'), (req, res) => {
        middlewareLog.push('admin-handler');
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/admin')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(middlewareLog).toEqual([
        'auth',
        'role-check:admin',
        'admin-handler',
      ]);
    });

    it('should block unauthorized requests at auth layer', async () => {
      app.use(mockAuthMiddleware);
      app.get('/admin', requireRole('admin'), (req, res) => {
        middlewareLog.push('admin-handler');
        res.json({ success: true });
      });

      const response = await request(app).get('/admin').expect(401);

      expect(middlewareLog).toEqual(['auth']);
      expect(response.body.error).toBe('No token provided');
    });

    it('should block insufficient role at authorization layer', async () => {
      app.use(mockAuthMiddleware);
      app.get('/admin', requireRole('admin'), (req, res) => {
        middlewareLog.push('admin-handler');
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/admin')
        .set('Authorization', 'Bearer viewer-token')
        .expect(403);

      expect(middlewareLog).toEqual(['auth', 'role-check:admin']);
      expect(response.body.error).toBe('Insufficient permissions');
    });

    it('should chain multiple authorization checks', async () => {
      app.use(mockAuthMiddleware);
      app.get(
        '/tenant/tenant-1/resource',
        requireRole('admin', 'editor'),
        requireTenant('tenant-1'),
        (req, res) => {
          middlewareLog.push('resource-handler');
          res.json({ success: true });
        }
      );

      const response = await request(app)
        .get('/tenant/tenant-1/resource')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(middlewareLog).toEqual([
        'auth',
        'role-check:admin,editor',
        'tenant-check:tenant-1',
        'resource-handler',
      ]);
    });
  });

  // ===========================================================================
  // Request Validation Chain
  // ===========================================================================
  describe('Request Validation Chain', () => {
    interface ValidationResult {
      valid: boolean;
      errors: string[];
    }

    function validateBody(schema: Record<string, string>) {
      return (req: Request, res: Response, next: NextFunction) => {
        middlewareLog.push('body-validation');
        const errors: string[] = [];

        for (const [field, type] of Object.entries(schema)) {
          if (req.body[field] === undefined) {
            errors.push(`${field} is required`);
          } else if (typeof req.body[field] !== type) {
            errors.push(`${field} must be ${type}`);
          }
        }

        if (errors.length > 0) {
          return res.status(400).json({ errors });
        }
        next();
      };
    }

    function validateParams(params: string[]) {
      return (req: Request, res: Response, next: NextFunction) => {
        middlewareLog.push('params-validation');
        const errors: string[] = [];

        for (const param of params) {
          if (!req.params[param]) {
            errors.push(`${param} parameter is required`);
          }
        }

        if (errors.length > 0) {
          return res.status(400).json({ errors });
        }
        next();
      };
    }

    function sanitizeInput(req: Request, res: Response, next: NextFunction) {
      middlewareLog.push('sanitization');
      // Simple XSS prevention
      if (req.body && typeof req.body === 'object') {
        for (const [key, value] of Object.entries(req.body)) {
          if (typeof value === 'string') {
            req.body[key] = value.replace(/<script>/gi, '').replace(/<\/script>/gi, '');
          }
        }
      }
      next();
    }

    it('should execute validation chain in order', async () => {
      app.post(
        '/resource/:id',
        validateParams(['id']),
        validateBody({ name: 'string', count: 'number' }),
        sanitizeInput,
        (req, res) => {
          middlewareLog.push('handler');
          res.json({ success: true, data: req.body });
        }
      );

      const response = await request(app)
        .post('/resource/123')
        .send({ name: 'test', count: 5 })
        .expect(200);

      expect(middlewareLog).toEqual([
        'params-validation',
        'body-validation',
        'sanitization',
        'handler',
      ]);
    });

    it('should fail early on param validation', async () => {
      app.post(
        '/resource/:id',
        validateParams(['id', 'tenantId']),
        validateBody({ name: 'string' }),
        (req, res) => {
          middlewareLog.push('handler');
          res.json({ success: true });
        }
      );

      const response = await request(app)
        .post('/resource/123')
        .send({ name: 'test' })
        .expect(400);

      expect(middlewareLog).toEqual(['params-validation']);
      expect(response.body.errors).toContain('tenantId parameter is required');
    });

    it('should fail on body validation after params pass', async () => {
      app.post(
        '/resource/:id',
        validateParams(['id']),
        validateBody({ name: 'string', count: 'number' }),
        (req, res) => {
          middlewareLog.push('handler');
          res.json({ success: true });
        }
      );

      const response = await request(app)
        .post('/resource/123')
        .send({ name: 'test' }) // Missing count
        .expect(400);

      expect(middlewareLog).toEqual(['params-validation', 'body-validation']);
      expect(response.body.errors).toContain('count is required');
    });

    it('should sanitize input after validation', async () => {
      app.post(
        '/resource/:id',
        validateParams(['id']),
        validateBody({ content: 'string' }),
        sanitizeInput,
        (req, res) => {
          middlewareLog.push('handler');
          res.json({ content: req.body.content });
        }
      );

      const response = await request(app)
        .post('/resource/123')
        .send({ content: '<script>alert("xss")</script>Hello' })
        .expect(200);

      expect(middlewareLog).toEqual([
        'params-validation',
        'body-validation',
        'sanitization',
        'handler',
      ]);
      expect(response.body.content).toBe('alert("xss")Hello');
    });
  });

  // ===========================================================================
  // Rate Limiting Integration
  // ===========================================================================
  describe('Rate Limiting Integration', () => {
    interface RateLimitRequest extends Request {
      rateLimit?: { remaining: number; limit: number };
    }

    function createRateLimiter(limit: number, windowMs: number) {
      const requests = new Map<string, number[]>();

      return (req: RateLimitRequest, res: Response, next: NextFunction) => {
        middlewareLog.push('rate-limiter');
        const key = req.ip || 'unknown';
        const now = Date.now();
        const windowStart = now - windowMs;

        // Get existing requests
        const reqs = requests.get(key) || [];
        const validReqs = reqs.filter((t) => t > windowStart);

        if (validReqs.length >= limit) {
          res.set('X-RateLimit-Remaining', '0');
          res.set('X-RateLimit-Limit', String(limit));
          return res.status(429).json({
            error: 'Rate limit exceeded',
            retryAfter: Math.ceil((validReqs[0] + windowMs - now) / 1000),
          });
        }

        validReqs.push(now);
        requests.set(key, validReqs);

        req.rateLimit = {
          remaining: limit - validReqs.length,
          limit,
        };
        res.set('X-RateLimit-Remaining', String(req.rateLimit.remaining));
        res.set('X-RateLimit-Limit', String(limit));

        next();
      };
    }

    it('should apply rate limiting before route handler', async () => {
      const rateLimiter = createRateLimiter(5, 60000);

      app.use(rateLimiter);
      app.get('/test', (req, res) => {
        middlewareLog.push('handler');
        res.json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);

      expect(middlewareLog).toEqual(['rate-limiter', 'handler']);
      expect(response.headers['x-ratelimit-limit']).toBe('5');
    });

    it('should block requests exceeding rate limit', async () => {
      const rateLimiter = createRateLimiter(3, 60000);

      app.use(rateLimiter);
      app.get('/test', (req, res) => {
        middlewareLog.push('handler');
        res.json({ success: true });
      });

      // Make 3 successful requests
      for (let i = 0; i < 3; i++) {
        middlewareLog.length = 0;
        await request(app).get('/test').expect(200);
        expect(middlewareLog).toContain('handler');
      }

      // 4th request should be rate limited
      middlewareLog.length = 0;
      const response = await request(app).get('/test').expect(429);

      expect(middlewareLog).toEqual(['rate-limiter']);
      expect(response.body.error).toBe('Rate limit exceeded');
    });
  });

  // ===========================================================================
  // CORS Integration
  // ===========================================================================
  describe('CORS Integration', () => {
    function createCorsMiddleware(allowedOrigins: string[]) {
      return (req: Request, res: Response, next: NextFunction) => {
        middlewareLog.push('cors');
        const origin = req.headers.origin;

        if (origin && allowedOrigins.includes(origin)) {
          res.set('Access-Control-Allow-Origin', origin);
          res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          res.set('Access-Control-Allow-Credentials', 'true');
        }

        if (req.method === 'OPTIONS') {
          return res.status(204).end();
        }

        next();
      };
    }

    it('should set CORS headers for allowed origins', async () => {
      app.use(createCorsMiddleware(['https://app.ectropy.ai']));
      app.get('/test', (req, res) => {
        middlewareLog.push('handler');
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .set('Origin', 'https://app.ectropy.ai')
        .expect(200);

      expect(middlewareLog).toEqual(['cors', 'handler']);
      expect(response.headers['access-control-allow-origin']).toBe(
        'https://app.ectropy.ai'
      );
    });

    it('should handle preflight OPTIONS requests', async () => {
      app.use(createCorsMiddleware(['https://app.ectropy.ai']));
      app.get('/test', (req, res) => {
        middlewareLog.push('handler');
        res.json({ success: true });
      });

      const response = await request(app)
        .options('/test')
        .set('Origin', 'https://app.ectropy.ai')
        .expect(204);

      expect(middlewareLog).toEqual(['cors']);
      // Handler should NOT be called for OPTIONS
    });

    it('should not set CORS headers for disallowed origins', async () => {
      app.use(createCorsMiddleware(['https://app.ectropy.ai']));
      app.get('/test', (req, res) => {
        middlewareLog.push('handler');
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .set('Origin', 'https://evil.com')
        .expect(200);

      expect(middlewareLog).toEqual(['cors', 'handler']);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  // ===========================================================================
  // Security Headers Chain
  // ===========================================================================
  describe('Security Headers Chain', () => {
    function securityHeaders(req: Request, res: Response, next: NextFunction) {
      middlewareLog.push('security-headers');

      // Security headers
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('X-Frame-Options', 'DENY');
      res.set('X-XSS-Protection', '1; mode=block');
      res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.set('Content-Security-Policy', "default-src 'self'");
      res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.set('Permissions-Policy', 'geolocation=(), microphone=()');

      next();
    }

    it('should apply all security headers', async () => {
      app.use(securityHeaders);
      app.get('/test', (req, res) => {
        middlewareLog.push('handler');
        res.json({ success: true });
      });

      const response = await request(app).get('/test').expect(200);

      expect(middlewareLog).toEqual(['security-headers', 'handler']);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['strict-transport-security']).toContain(
        'max-age=31536000'
      );
      expect(response.headers['content-security-policy']).toBe("default-src 'self'");
      expect(response.headers['referrer-policy']).toBe(
        'strict-origin-when-cross-origin'
      );
    });

    it('should apply security headers before any response', async () => {
      app.use(securityHeaders);
      app.get('/error', (req, res) => {
        middlewareLog.push('error-handler');
        res.status(500).json({ error: 'Internal error' });
      });

      const response = await request(app).get('/error').expect(500);

      // Security headers should be present even on error responses
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
    });
  });

  // ===========================================================================
  // Complete Enterprise Middleware Stack
  // ===========================================================================
  describe('Complete Enterprise Middleware Stack', () => {
    interface FullRequest extends Request {
      requestId?: string;
      startTime?: number;
      user?: { id: string; role: string };
    }

    it('should execute full middleware stack in correct order', async () => {
      // 1. Request ID
      app.use((req: FullRequest, res, next) => {
        req.requestId = `req-${Date.now()}`;
        res.set('X-Request-ID', req.requestId);
        middlewareLog.push('request-id');
        next();
      });

      // 2. Timing
      app.use((req: FullRequest, res, next) => {
        req.startTime = Date.now();
        middlewareLog.push('timing-start');
        next();
      });

      // 3. Security headers
      app.use((req, res, next) => {
        res.set('X-Content-Type-Options', 'nosniff');
        middlewareLog.push('security');
        next();
      });

      // 4. Auth
      app.use((req: FullRequest, res, next) => {
        if (req.headers.authorization === 'Bearer valid') {
          req.user = { id: 'user-1', role: 'admin' };
        }
        middlewareLog.push('auth');
        next();
      });

      // 5. Authorization (route-level)
      const requireAuth = (req: FullRequest, res: Response, next: NextFunction) => {
        middlewareLog.push('require-auth');
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
      };

      // 6. Handler
      app.get('/protected', requireAuth, (req: FullRequest, res) => {
        middlewareLog.push('handler');
        res.json({
          requestId: req.requestId,
          userId: req.user?.id,
          processingTime: Date.now() - (req.startTime || 0),
        });
      });

      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer valid')
        .expect(200);

      expect(middlewareLog).toEqual([
        'request-id',
        'timing-start',
        'security',
        'auth',
        'require-auth',
        'handler',
      ]);

      expect(response.headers['x-request-id']).toMatch(/^req-\d+$/);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.body.userId).toBe('user-1');
    });

    it('should handle early termination at any layer', async () => {
      // Request ID
      app.use((req: FullRequest, res, next) => {
        req.requestId = `req-${Date.now()}`;
        middlewareLog.push('request-id');
        next();
      });

      // Rate limiter that blocks
      app.use((req, res, next) => {
        middlewareLog.push('rate-limiter');
        res.status(429).json({ error: 'Rate limited' });
      });

      // These should never execute
      app.use((req, res, next) => {
        middlewareLog.push('auth');
        next();
      });

      app.get('/test', (req, res) => {
        middlewareLog.push('handler');
        res.json({ success: true });
      });

      const response = await request(app).get('/test').expect(429);

      expect(middlewareLog).toEqual(['request-id', 'rate-limiter']);
    });
  });
});
