/**
 * Speckle Auth Contract Tests — SEC-001 / DEC-028
 *
 * Validates auth middleware on /objects/ routes:
 *   - /objects/:streamId/:objectId/single → requireAuth + requireStreamAccess
 *   - /objects/:streamId/:objectId → requireViewerToken
 *
 * These tests use a minimal Express app with the actual middleware
 * wired in, mocking only the DB pool and Passport session.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
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

// Mock DB pool used by requireStreamAccess
const mockQuery = vi.fn();
vi.mock('../database/connection.js', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));

// Import after mocks
import { requireAuth, requireStreamAccess } from '../middleware/authorization.middleware';
import { requireViewerToken } from '../middleware/requireViewerToken';

// ---------------------------------------------------------------------------
// Test app — mirrors the real middleware chains from speckle.routes.enterprise.ts
// ---------------------------------------------------------------------------
function createTestApp() {
  const app = express();

  // /objects/:streamId/:objectId/single — requireAuth + requireStreamAccess (SEC-001 fix)
  app.get(
    '/objects/:streamId/:objectId/single',
    requireAuth,
    requireStreamAccess(),
    (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    },
  );

  // /objects/:streamId/:objectId — requireViewerToken (unchanged, regression guard)
  app.get(
    '/objects/:streamId/:objectId',
    requireViewerToken,
    (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    },
  );

  return app;
}

// Helper: inject a fake Passport user onto the request
function injectUser(userId: string, email = 'test@ectropy.ai') {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: userId, email } as any;
    next();
  };
}

function createAppWithUser(userId: string) {
  const app = express();

  app.use(injectUser(userId));

  app.get(
    '/objects/:streamId/:objectId/single',
    requireAuth,
    requireStreamAccess(),
    (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    },
  );

  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Speckle Auth Contracts (SEC-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- CONTRACT 1: No session → 401 ----
  it('GET /objects/:streamId/:objectId/single → 401 with no session', async () => {
    const app = createTestApp();
    const res = await request(app).get('/objects/stream123/obj456/single');
    expect(res.status).toBe(401);
  });

  // ---- CONTRACT 2: Valid session, no stream ACL → 403 ----
  it('GET /objects/:streamId/:objectId/single → 403 with session but no stream access', async () => {
    const userId = 'user-no-access';
    const app = createAppWithUser(userId);

    // Stream exists, linked to a project, user is NOT the owner
    mockQuery.mockImplementation((sql: string, params: unknown[]) => {
      if (sql.includes('speckle_streams')) {
        return Promise.resolve({
          rows: [{
            id: 'stream123',
            name: 'Test Stream',
            description: '',
            isPublic: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            construction_project_id: 'proj-001',
            owner_id: 'someone-else',
            project_name: 'Test Project',
          }],
        });
      }
      // project_roles check — user NOT in project
      if (sql.includes('project_roles')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app).get('/objects/stream123/obj456/single');
    expect(res.status).toBe(403);
  });

  // ---- CONTRACT 3: Valid session + stream ACL → 200 ----
  it('GET /objects/:streamId/:objectId/single → 200 with session and stream access', async () => {
    const userId = 'user-with-access';
    const app = createAppWithUser(userId);

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('speckle_streams')) {
        return Promise.resolve({
          rows: [{
            id: 'stream123',
            name: 'Test Stream',
            description: '',
            isPublic: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            construction_project_id: 'proj-001',
            owner_id: 'someone-else',
            project_name: 'Test Project',
          }],
        });
      }
      // project_roles check — user IS in project
      if (sql.includes('project_roles')) {
        return Promise.resolve({ rows: [{ id: 1 }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app).get('/objects/stream123/obj456/single');
    // 200 from our stub handler (upstream Speckle not called in test)
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  // ---- CONTRACT 4: No VST on /objects/:streamId/:objectId → 401 ----
  it('GET /objects/:streamId/:objectId → 401 with no VST (requireViewerToken regression guard)', async () => {
    const app = createTestApp();
    const res = await request(app).get('/objects/stream123/obj456');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/viewer/i);
  });
});
