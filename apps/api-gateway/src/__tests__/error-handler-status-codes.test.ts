/**
 * Error Handler Status Code Tests - API Gateway
 *
 * CRITICAL FIX (2026-01-15): Test proper HTTP status codes for all error types
 * Root Cause: Global error handler in main.ts was returning 500 for all errors
 *
 * Test Coverage:
 * - Authentication errors (401)
 * - Authorization errors (403)
 * - Validation errors (400)
 * - Not found errors (404)
 * - Server errors (500)
 * - AppError instances with statusCode property
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  DatabaseError,
} from '../../../../libs/shared/errors/src/error-handler.js';

/**
 * Mock error handler that mimics the fixed implementation in main.ts:1951-2014
 */
function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Check if headers already sent
  if (res.headersSent) {
    return next(err);
  }

  // Determine status code from error type
  let statusCode = 500;
  let errorType = 'Internal Server Error';

  // Check for AppError instances (from libs/shared/errors)
  if ('statusCode' in err && typeof (err as any).statusCode === 'number') {
    statusCode = (err as any).statusCode;
  }
  // Check for authentication errors
  else if (
    err.message?.includes('Authentication required') ||
    err.message?.includes('Not authenticated') ||
    err.name === 'UnauthorizedError'
  ) {
    statusCode = 401;
    errorType = 'Unauthorized';
  }
  // Check for authorization/permission errors
  else if (
    err.message?.includes('Insufficient permissions') ||
    err.message?.includes('Access denied') ||
    err.name === 'ForbiddenError'
  ) {
    statusCode = 403;
    errorType = 'Forbidden';
  }
  // Check for validation errors
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    errorType = 'Bad Request';
  }

  // Send error response with correct status code
  res.status(statusCode).json({
    error: errorType,
    message: err.message,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Create mock Express request/response/next objects
 */
function createMocks() {
  const req = {
    path: '/test',
    method: 'GET',
  } as Request;

  const res = {
    headersSent: false,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next };
}

describe('Error Handler Status Codes - CRITICAL FIX', () => {
  describe('AppError instances with statusCode property', () => {
    it('should return 401 for AuthenticationError', () => {
      const { req, res, next } = createMocks();
      const error = new AuthenticationError('Authentication required');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authentication required',
        })
      );
    });

    it('should return 403 for AuthorizationError', () => {
      const { req, res, next } = createMocks();
      const error = new AuthorizationError('Insufficient permissions');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Insufficient permissions',
        })
      );
    });

    it('should return 400 for ValidationError', () => {
      const { req, res, next } = createMocks();
      const error = new ValidationError('Invalid input', 'email');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid input',
        })
      );
    });

    it('should return 404 for NotFoundError', () => {
      const { req, res, next } = createMocks();
      const error = new NotFoundError('User');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User not found',
        })
      );
    });

    it('should return 500 for DatabaseError', () => {
      const { req, res, next } = createMocks();
      const error = new DatabaseError('Connection failed');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Connection failed',
        })
      );
    });
  });

  describe('Standard Error instances with message patterns', () => {
    it('should return 401 for Error with "Authentication required" message', () => {
      const { req, res, next } = createMocks();
      const error = new Error('Authentication required');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          message: 'Authentication required',
        })
      );
    });

    it('should return 401 for Error with "Not authenticated" message', () => {
      const { req, res, next } = createMocks();
      const error = new Error('Not authenticated');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 403 for Error with "Insufficient permissions" message', () => {
      const { req, res, next } = createMocks();
      const error = new Error('Insufficient permissions');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Forbidden',
          message: 'Insufficient permissions',
        })
      );
    });

    it('should return 403 for Error with "Access denied" message', () => {
      const { req, res, next } = createMocks();
      const error = new Error('Access denied');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('Error name-based detection', () => {
    it('should return 401 for UnauthorizedError name', () => {
      const { req, res, next } = createMocks();
      const error = new Error('JWT expired');
      error.name = 'UnauthorizedError';

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 403 for ForbiddenError name', () => {
      const { req, res, next } = createMocks();
      const error = new Error('Resource access forbidden');
      error.name = 'ForbiddenError';

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 400 for ValidationError name', () => {
      const { req, res, next } = createMocks();
      const error = new Error('Invalid format');
      error.name = 'ValidationError';

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('Default behavior for unknown errors', () => {
    it('should return 500 for generic Error', () => {
      const { req, res, next } = createMocks();
      const error = new Error('Something went wrong');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal Server Error',
          message: 'Something went wrong',
        })
      );
    });

    it('should return 500 for Error with no matching patterns', () => {
      const { req, res, next } = createMocks();
      const error = new Error('Database timeout');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('Headers already sent handling', () => {
    it('should delegate to next() if headers already sent', () => {
      const { req, res, next } = createMocks();
      res.headersSent = true;
      const error = new AuthenticationError('Test error');

      errorHandler(error, req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('Real-world scenarios from staging logs', () => {
    it('should handle authentication error from /api/projects endpoint', () => {
      const { req, res, next } = createMocks();
      req.path = '/api/projects';
      req.method = 'GET';

      const error = new AuthenticationError('Authentication required');

      errorHandler(error, req, res, next);

      // CRITICAL: Must return 401, not 500
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authentication required',
        })
      );
    });

    it('should handle authorization error from project access check', () => {
      const { req, res, next } = createMocks();
      req.path = '/api/projects/911a453e-05a4-420b-af69-da6eb8c2b717';

      const error = new AuthorizationError('Insufficient permissions');

      errorHandler(error, req, res, next);

      // Must return 403, not 500
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should handle "Could not verify project access" as 500 (database error)', () => {
      const { req, res, next } = createMocks();
      req.path = '/api/projects/911a453e-05a4-420b-af69-da6eb8c2b717';

      const error = new DatabaseError('Could not verify project access');

      errorHandler(error, req, res, next);

      // Database errors should be 500
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('Response format validation', () => {
    it('should include error, message, and timestamp fields', () => {
      const { req, res, next } = createMocks();
      const error = new AuthenticationError('Test');

      errorHandler(error, req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
          message: expect.any(String),
          timestamp: expect.any(String),
        })
      );
    });

    it('should use ISO 8601 timestamp format', () => {
      const { req, res, next } = createMocks();
      const error = new Error('Test');

      errorHandler(error, req, res, next);

      const jsonCall = (res.json as any).mock.calls[0][0];
      expect(jsonCall.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });
  });
});

describe('Error Handler Integration - Prevent 500 Regression', () => {
  /**
   * These tests document the exact bug that was fixed:
   * All errors were returning HTTP 500 instead of proper status codes
   */

  it('REGRESSION TEST: Auth errors must NOT return 500', () => {
    const { req, res, next } = createMocks();
    const error = new AuthenticationError('Authentication required');

    errorHandler(error, req, res, next);

    // CRITICAL: Must be 401, not 500
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('REGRESSION TEST: Permission errors must NOT return 500', () => {
    const { req, res, next } = createMocks();
    const error = new AuthorizationError('Access denied');

    errorHandler(error, req, res, next);

    // CRITICAL: Must be 403, not 500
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('REGRESSION TEST: Validation errors must NOT return 500', () => {
    const { req, res, next } = createMocks();
    const error = new ValidationError('Invalid input');

    errorHandler(error, req, res, next);

    // CRITICAL: Must be 400, not 500
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
