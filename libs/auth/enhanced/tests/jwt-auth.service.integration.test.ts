import { describe, it, expect, beforeEach } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { EnhancedJWTAuthService } from '../services/jwt-auth.service';

describe('EnhancedJWTAuthService Integration', () => {
  let service: any;
  beforeEach(() => {
    service = new EnhancedJWTAuthService();
  });

  it('generates signed token pair', () => {
    const tokens = (service as any).generateTokenPair('user1', 'admin', 'session1');
    const decoded = jwt.verify(tokens.accessToken, (service as any).JWT_SECRET) as any;
    expect(decoded.sub).toBe('user1');
    const decodedRefresh = jwt.verify(
      tokens.refreshToken,
      (service as any).JWT_REFRESH_SECRET
    ) as any;
    expect(decodedRefresh.sessionId).toBe('session1');
  });

  it('validates access token and retrieves session', async () => {
    const sessionId = await (service as any).createUserSession('user1', {});
    const tokens = (service as any).generateTokenPair('user1', 'admin', sessionId);
    await (service as any).redis.set(`access:${tokens.accessToken}`, sessionId);
    await (service as any).redis.set(`refresh:${tokens.refreshToken}`, sessionId);
    await (service as any).redis.set(`session_access:${sessionId}`, tokens.accessToken);
    const result = await service.validateAccessToken(tokens.accessToken);
    expect(result?.user.id).toBe('user1');
    expect(result?.session?.userId).toBe('user1');
  });

  it('refreshes token and revokes old session', async () => {
    const sessionId = await (service as any).createUserSession('user1', {
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
    });
    const tokens = (service as any).generateTokenPair('user1', 'admin', sessionId);
    await (service as any).redis.set(`access:${tokens.accessToken}`, sessionId);
    await (service as any).redis.set(`refresh:${tokens.refreshToken}`, sessionId);
    await (service as any).redis.set(`session_access:${sessionId}`, tokens.accessToken);
    const res = await service.refreshToken(tokens.refreshToken);
    expect(res.success).toBe(true);
    expect(res.tokens?.accessToken).not.toBe(tokens.accessToken);
    const oldAccess = await (service as any).redis.get(`access:${tokens.accessToken}`);
    expect(oldAccess).toBeNull();
    const newSessionId = await (service as any).redis.get(`access:${res.tokens!.accessToken}`);
    expect(newSessionId).toBeTruthy();
  });
});
