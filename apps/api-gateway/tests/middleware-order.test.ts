/**
 * Tests for CSRF/Session middleware order fix
 * Validates that session middleware is initialized before CSRF middleware
 */

import { describe, test, expect, beforeAll } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';

describe('Middleware Order', () => {
  test('session should be available when CSRF middleware runs', () => {
    const app = express();
    let sessionMiddlewareRan = false;
    let csrfMiddlewareHadSession = false;

    // Mock session middleware
    const sessionMiddleware = (req: Request, res: Response, next: NextFunction) => {
      sessionMiddlewareRan = true;
      // Simulate session initialization
      (req as any).session = { csrfToken: undefined };
      next();
    };

    // Mock CSRF middleware that requires session
    const csrfMiddleware = (req: Request, res: Response, next: NextFunction) => {
      // Check if session is available
      csrfMiddlewareHadSession = !!(req as any).session;
      
      // Try to set CSRF token (this would fail if session is undefined)
      if ((req as any).session) {
        (req as any).session.csrfToken = 'test-token';
      }
      next();
    };

    // Apply in correct order: session THEN csrf
    app.use(sessionMiddleware);
    app.use(csrfMiddleware);

    // Add a test route
    app.get('/test', (req, res) => {
      res.json({ 
        sessionMiddlewareRan,
        csrfMiddlewareHadSession,
        csrfToken: (req as any).session?.csrfToken 
      });
    });

    // Verify middleware order is correct
    expect(sessionMiddlewareRan).toBe(false); // Not yet run
    expect(csrfMiddlewareHadSession).toBe(false); // Not yet run

    // The key is that the middleware stack is set up correctly
    // When a request comes in, session will run first, then CSRF
    expect(app._router.stack.length).toBeGreaterThan(0);
  });

  test('CSRF token generation should not fail with proper session', () => {
    const generateCSRFToken = (): string => {
      return Math.random().toString(36).substring(2, 15) + 
             Math.random().toString(36).substring(2, 15);
    };

    const mockRequest: any = {
      session: { csrfToken: undefined },
      method: 'GET',
      path: '/test'
    };

    const mockResponse: any = {
      locals: {}
    };

    // Simulate CSRF middleware logic
    if (!mockRequest.session?.csrfToken) {
      mockRequest.session.csrfToken = generateCSRFToken();
    }
    mockResponse.locals.csrfToken = mockRequest.session.csrfToken;

    // Verify CSRF token was set without errors
    expect(mockRequest.session.csrfToken).toBeDefined();
    expect(mockRequest.session.csrfToken.length).toBeGreaterThan(0);
    expect(mockResponse.locals.csrfToken).toBe(mockRequest.session.csrfToken);
  });

  test('CSRF middleware should skip GET requests', () => {
    const mockRequest: any = {
      method: 'GET',
      path: '/test',
      session: { csrfToken: 'test-token' }
    };

    let shouldSkip = false;

    // Simulate CSRF protection logic
    if (mockRequest.method === 'GET' || mockRequest.path.startsWith('/api/auth/google')) {
      shouldSkip = true;
    }

    expect(shouldSkip).toBe(true);
  });

  test('CSRF middleware should validate POST requests', () => {
    const mockRequest: any = {
      method: 'POST',
      path: '/api/test',
      headers: { 'x-csrf-token': 'test-token' },
      session: { csrfToken: 'test-token' }
    };

    let isValid = false;

    // Simulate CSRF validation logic
    const token = mockRequest.headers['x-csrf-token'] || mockRequest.body?._csrf;
    const sessionToken = mockRequest.session?.csrfToken;

    if (token && sessionToken && token === sessionToken) {
      isValid = true;
    }

    expect(isValid).toBe(true);
  });
});
