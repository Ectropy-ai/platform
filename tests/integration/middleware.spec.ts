import express from 'express';
import request from 'supertest';
import { EnhancedAuthMiddleware } from '../../libs/shared/middleware/auth.middleware.ts';
import { CacheService } from '../../libs/database/src/services/cache.service';

describe('Middleware integration', () => {
  it('applies security headers', async () => {
    const app = express();
    const middleware = new EnhancedAuthMiddleware();
    app.use(middleware.securityHeaders());
    app.get('/test', (_req, res) => res.send('ok'));

    const res = await request(app).get('/test');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });
});

describe('Redis cache integration', () => {
  it('sets and retrieves values via CacheService', async () => {
    const cache = new CacheService({ host: 'localhost', port: 6379, db: 0 });
    await cache.set('key', { value: 123 });
    const result = await cache.get<{ value: number }>('key');
    expect(result).toEqual({ value: 123 });
    await new Promise((r) => setTimeout(r, 20));
  });
});
