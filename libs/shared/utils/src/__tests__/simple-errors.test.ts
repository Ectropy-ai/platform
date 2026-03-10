/**
 * ENTERPRISE UNIT TESTS - Error Handling Utilities
 *
 * Purpose: Comprehensive testing of custom error classes and error handlers
 * Scope: Error creation, status codes, error middleware, response formatting
 * Framework: Vitest
 *
 * ENTERPRISE FOCUS:
 * - AAA pattern (Arrange, Act, Assert)
 * - Error type validation (instanceof checks)
 * - HTTP status code accuracy
 * - Error message propagation
 * - Async error handling
 * - Response standardization
 *
 * SECURITY CRITICAL:
 * Proper error handling prevents information leakage in production
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  SimpleError,
  DatabaseConnectionError,
  UnauthorizedError,
  asyncHandler,
  createResponse,
  errorHandler,
} from '../simple-errors';

describe('Simple Errors - Enterprise Unit Tests', () => {
  describe('1. Custom Error Classes', () => {
    describe('ValidationError', () => {
      it('should create error with correct message', () => {
        // Arrange
        const message = 'Invalid email format';

        // Act
        const error = new ValidationError(message);

        // Assert
        expect(error.message).toBe(message);
      });

      it('should have status code 400', () => {
        const error = new ValidationError('Validation failed');

        expect(error.statusCode).toBe(400);
      });

      it('should have correct error name', () => {
        const error = new ValidationError('Validation failed');

        expect(error.name).toBe('ValidationError');
      });

      it('should be instance of Error', () => {
        const error = new ValidationError('Validation failed');

        expect(error).toBeInstanceOf(Error);
      });

      it('should be instance of ValidationError', () => {
        const error = new ValidationError('Validation failed');

        expect(error).toBeInstanceOf(ValidationError);
      });

      it('should have stack trace', () => {
        const error = new ValidationError('Validation failed');

        expect(error.stack).toBeDefined();
      });
    });

    describe('AuthenticationError', () => {
      it('should create error with correct message', () => {
        const message = 'Invalid credentials';
        const error = new AuthenticationError(message);

        expect(error.message).toBe(message);
      });

      it('should have status code 401', () => {
        const error = new AuthenticationError('Authentication required');

        expect(error.statusCode).toBe(401);
      });

      it('should have correct error name', () => {
        const error = new AuthenticationError('Authentication required');

        expect(error.name).toBe('AuthenticationError');
      });
    });

    describe('AuthorizationError', () => {
      it('should create error with correct message', () => {
        const message = 'Insufficient permissions';
        const error = new AuthorizationError(message);

        expect(error.message).toBe(message);
      });

      it('should have status code 403', () => {
        const error = new AuthorizationError('Access denied');

        expect(error.statusCode).toBe(403);
      });

      it('should have correct error name', () => {
        const error = new AuthorizationError('Access denied');

        expect(error.name).toBe('AuthorizationError');
      });
    });

    describe('NotFoundError', () => {
      it('should create error with correct message', () => {
        const message = 'Resource not found';
        const error = new NotFoundError(message);

        expect(error.message).toBe(message);
      });

      it('should have status code 404', () => {
        const error = new NotFoundError('Project not found');

        expect(error.statusCode).toBe(404);
      });

      it('should have correct error name', () => {
        const error = new NotFoundError('Project not found');

        expect(error.name).toBe('NotFoundError');
      });
    });

    describe('SimpleError', () => {
      it('should create error with correct message', () => {
        const message = 'Something went wrong';
        const error = new SimpleError(message);

        expect(error.message).toBe(message);
      });

      it('should have status code 500', () => {
        const error = new SimpleError('Internal error');

        expect(error.statusCode).toBe(500);
      });

      it('should have correct error name', () => {
        const error = new SimpleError('Internal error');

        expect(error.name).toBe('SimpleError');
      });
    });

    describe('DatabaseConnectionError', () => {
      it('should create error with correct message', () => {
        const message = 'Database connection failed';
        const error = new DatabaseConnectionError(message);

        expect(error.message).toBe(message);
      });

      it('should have status code 503', () => {
        const error = new DatabaseConnectionError('DB unavailable');

        expect(error.statusCode).toBe(503);
      });

      it('should have correct error name', () => {
        const error = new DatabaseConnectionError('DB unavailable');

        expect(error.name).toBe('DatabaseConnectionError');
      });
    });

    describe('UnauthorizedError', () => {
      it('should create error with correct message', () => {
        const message = 'Token expired';
        const error = new UnauthorizedError(message);

        expect(error.message).toBe(message);
      });

      it('should have status code 401', () => {
        const error = new UnauthorizedError('Unauthorized');

        expect(error.statusCode).toBe(401);
      });

      it('should have correct error name', () => {
        const error = new UnauthorizedError('Unauthorized');

        expect(error.name).toBe('UnauthorizedError');
      });
    });
  });

  describe('2. asyncHandler - Async Route Wrapper', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockReq = {};
      mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };
      mockNext = vi.fn();
    });

    it('should execute async handler successfully', async () => {
      // Arrange
      const handler = asyncHandler(async (req, res) => {
        res.json({ success: true });
      });

      // Act
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should catch and forward errors to next()', async () => {
      // Arrange
      const testError = new Error('Test error');
      const handler = asyncHandler(async () => {
        throw testError;
      });

      // Act
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(testError);
    });

    it('should handle synchronous errors', async () => {
      // Arrange
      const testError = new Error('Sync error');
      const handler = asyncHandler(() => {
        throw testError;
      });

      // Act
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(testError);
    });

    it('should work with Promise-based handlers', async () => {
      // Arrange
      const handler = asyncHandler((req, res) => {
        return Promise.resolve().then(() => {
          res.json({ data: 'test' });
        });
      });

      // Act
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should catch rejected promises', async () => {
      // Arrange
      const testError = new Error('Promise rejected');
      const handler = asyncHandler(() => {
        return Promise.reject(testError);
      });

      // Act
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(testError);
    });

    it('should handle validation errors correctly', async () => {
      // Arrange
      const validationError = new ValidationError('Invalid input');
      const handler = asyncHandler(() => {
        throw validationError;
      });

      // Act
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(validationError);
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ValidationError',
          statusCode: 400,
        })
      );
    });

    it('should pass request and response to handler', async () => {
      // Arrange
      const handler = asyncHandler((req, res) => {
        expect(req).toBe(mockReq);
        expect(res).toBe(mockRes);
        res.json({ received: true });
      });

      // Act
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith({ received: true });
    });

    it('should handle handlers that return void', async () => {
      // Arrange
      const handler = asyncHandler((req, res) => {
        res.json({ void: true });
        // Return void (no return statement)
      });

      // Act
      await handler(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith({ void: true });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('3. createResponse - Response Standardization', () => {
    describe('success()', () => {
      it('should create success response with data', () => {
        // Arrange
        const data = { id: '123', name: 'Test Project' };

        // Act
        const response = createResponse.success(data);

        // Assert
        expect(response.success).toBe(true);
        expect(response.data).toEqual(data);
        expect(response.timestamp).toBeDefined();
      });

      it('should include optional message', () => {
        const data = { id: '123' };
        const message = 'Operation successful';

        const response = createResponse.success(data, message);

        expect(response.message).toBe(message);
      });

      it('should have ISO timestamp', () => {
        const data = { test: true };

        const response = createResponse.success(data);

        expect(response.timestamp).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
        );
      });

      it('should handle null data', () => {
        const response = createResponse.success(null);

        expect(response.success).toBe(true);
        expect(response.data).toBeNull();
      });

      it('should handle array data', () => {
        const data = [{ id: '1' }, { id: '2' }];

        const response = createResponse.success(data);

        expect(response.data).toEqual(data);
      });

      it('should handle primitive data', () => {
        const response1 = createResponse.success(42);
        const response2 = createResponse.success('test');
        const response3 = createResponse.success(true);

        expect(response1.data).toBe(42);
        expect(response2.data).toBe('test');
        expect(response3.data).toBe(true);
      });
    });

    describe('error()', () => {
      it('should create error response with message', () => {
        // Arrange
        const message = 'An error occurred';

        // Act
        const response = createResponse.error(message);

        // Assert
        expect(response.success).toBe(false);
        expect(response.error).toBe(message);
        expect(response.timestamp).toBeDefined();
      });

      it('should include optional error code', () => {
        const message = 'Validation failed';
        const code = 'VALIDATION_ERROR';

        const response = createResponse.error(message, code);

        expect(response.code).toBe(code);
      });

      it('should include optional details', () => {
        const message = 'Validation failed';
        const code = 'VALIDATION_ERROR';
        const details = { field: 'email', reason: 'Invalid format' };

        const response = createResponse.error(message, code, details);

        expect(response.details).toEqual(details);
      });

      it('should have ISO timestamp', () => {
        const response = createResponse.error('Error');

        expect(response.timestamp).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
        );
      });

      it('should handle empty message', () => {
        const response = createResponse.error('');

        expect(response.error).toBe('');
      });

      it('should handle complex details object', () => {
        const details = {
          errors: [
            { field: 'name', message: 'Required' },
            { field: 'email', message: 'Invalid' },
          ],
          count: 2,
        };

        const response = createResponse.error('Multiple errors', 'VALIDATION', details);

        expect(response.details).toEqual(details);
      });
    });
  });

  describe('4. errorHandler - Express Error Middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let originalEnv: string | undefined;

    beforeEach(() => {
      mockReq = {};
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };
      mockNext = vi.fn();
      originalEnv = process.env.NODE_ENV;
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle ValidationError with 400 status', () => {
      // Arrange
      const error = new ValidationError('Invalid email');

      // Act
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid email',
          code: 'VALIDATION_ERROR',
        })
      );
    });

    it('should handle AuthenticationError with 401 status', () => {
      const error = new AuthenticationError('Invalid token');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'AUTHENTICATION_ERROR',
        })
      );
    });

    it('should handle AuthorizationError with 403 status', () => {
      const error = new AuthorizationError('Access denied');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'AUTHORIZATION_ERROR',
        })
      );
    });

    it('should handle NotFoundError with 404 status', () => {
      const error = new NotFoundError('Project not found');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('should handle generic errors with 500 status', () => {
      const error = new Error('Something went wrong');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
        })
      );
    });

    it('should include stack trace in development mode', () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      const error = new Error('Test error');

      // Act
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            message: 'Test error',
            stack: expect.any(String),
          }),
        })
      );
    });

    it('should not include stack trace in production mode', () => {
      // Arrange
      process.env.NODE_ENV = 'production';
      const error = new Error('Test error');

      // Act
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal server error',
          details: undefined,
        })
      );
    });

    it('should include timestamp in all error responses', () => {
      const error = new ValidationError('Test');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
          ),
        })
      );
    });

    it('should preserve custom error messages', () => {
      const customMessage = 'Email must be in valid format';
      const error = new ValidationError(customMessage);

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: customMessage,
        })
      );
    });
  });

  describe('5. Error Type Validation', () => {
    it('should correctly identify ValidationError', () => {
      const error = new ValidationError('Test');

      expect(error instanceof ValidationError).toBe(true);
      expect(error instanceof Error).toBe(true);
      expect(error instanceof AuthenticationError).toBe(false);
    });

    it('should correctly identify AuthenticationError', () => {
      const error = new AuthenticationError('Test');

      expect(error instanceof AuthenticationError).toBe(true);
      expect(error instanceof Error).toBe(true);
      expect(error instanceof ValidationError).toBe(false);
    });

    it('should correctly identify NotFoundError', () => {
      const error = new NotFoundError('Test');

      expect(error instanceof NotFoundError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should allow type guards based on name property', () => {
      const errors = [
        new ValidationError('Validation'),
        new AuthenticationError('Auth'),
        new NotFoundError('Not found'),
      ];

      const validationErrors = errors.filter((e) => e.name === 'ValidationError');
      const authErrors = errors.filter((e) => e.name === 'AuthenticationError');

      expect(validationErrors).toHaveLength(1);
      expect(authErrors).toHaveLength(1);
    });

    it('should allow type guards based on statusCode', () => {
      const errors = [
        new ValidationError('Test'), // 400
        new AuthenticationError('Test'), // 401
        new NotFoundError('Test'), // 404
      ];

      const clientErrors = errors.filter((e) => e.statusCode >= 400 && e.statusCode < 500);
      const serverErrors = errors.filter((e) => e.statusCode >= 500);

      expect(clientErrors).toHaveLength(3);
      expect(serverErrors).toHaveLength(0);
    });
  });

  describe('6. Edge Cases and Security', () => {
    it('should handle very long error messages', () => {
      const longMessage = 'A'.repeat(10000);
      const error = new ValidationError(longMessage);

      expect(error.message).toBe(longMessage);
      expect(error.message.length).toBe(10000);
    });

    it('should handle special characters in error messages', () => {
      const specialMessage = '<script>alert("xss")</script>';
      const error = new ValidationError(specialMessage);

      expect(error.message).toBe(specialMessage);
      // Note: XSS prevention should be handled at response serialization level
    });

    it('should handle unicode characters in error messages', () => {
      const unicodeMessage = '错误消息 🚫 Error';
      const error = new ValidationError(unicodeMessage);

      expect(error.message).toBe(unicodeMessage);
    });

    it('should handle null/undefined in createResponse details', () => {
      const response1 = createResponse.error('Test', 'CODE', null as any);
      const response2 = createResponse.error('Test', 'CODE', undefined);

      expect(response1.details).toBeNull();
      expect(response2.details).toBeUndefined();
    });

    it('should handle circular reference in error details (gracefully fail)', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;

      // This would normally cause JSON.stringify to fail
      // The response should handle this gracefully in actual implementation
      const response = createResponse.error('Test', 'CODE', circular);

      expect(response.details).toBe(circular);
    });

    it('should maintain error stack trace through asyncHandler', async () => {
      const mockReq = {} as Request;
      const mockRes = {} as Response;
      const mockNext = vi.fn();

      const originalError = new Error('Original error');
      const handler = asyncHandler(() => {
        throw originalError;
      });

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(originalError);
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          stack: expect.stringContaining('Original error'),
        })
      );
    });
  });
});
