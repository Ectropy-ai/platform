import { describe, it, expect, vi, type Mock } from 'vitest';
import { RBACMiddleware } from '../rbac.middleware';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '@ectropy/shared/types';

describe('RBACMiddleware', () => {
  const handler = RBACMiddleware.requireRoles('admin');

  const createMockRes = () => {
    const res: Partial<Response> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response & { status: Mock; json: Mock };
  };

  it('allows request when user has required role', () => {
    const req = { user: { id: '1', roles: ['admin'] } } as unknown as Request;
    const res = createMockRes();
    const next = vi.fn();

    handler(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when user is missing', () => {
    const req = {} as AuthenticatedRequest as Request;
    const res = createMockRes();
    const next = vi.fn();

    handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NO_AUTH' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user lacks role', () => {
    const req = { user: { id: '1', roles: ['user'] } } as unknown as Request;
    const res = createMockRes();
    const next = vi.fn();

    handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
