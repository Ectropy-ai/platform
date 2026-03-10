/**
 * Simple Error Handler for API Routes
 * Provides basic error handling utilities with proper TypeScript support
 */

/// <reference types="node" />
import type { NextFunction, Request, Response } from 'express';
export class ValidationError extends Error {
  public statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error {
  public statusCode = 401;
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  public statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error {
  public statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class SimpleError extends Error {
  public statusCode = 500;
  constructor(message: string) {
    super(message);
    this.name = 'SimpleError';
  }
}

export class DatabaseConnectionError extends Error {
  public statusCode = 503;
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConnectionError';
  }
}

export class UnauthorizedError extends Error {
  public statusCode = 401;
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Async handler wrapper for Express route handlers
 * Automatically catches and forwards errors to error handling middleware
 * ENTERPRISE FIX: Handles both synchronous throws and async rejections
 * Returns Promise for testability while maintaining Express middleware compatibility
 */
export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next?: NextFunction) => Promise<any> | void
): (req: T, res: Response, next: NextFunction) => Promise<void> {
  return (req: T, res: Response, next: NextFunction) => {
    // Core solution: Execute fn inside Promise context to catch sync throws
    // Promise.resolve().then(() => fn(...)) ensures synchronous errors are caught
    // Return Promise for testability (tests can await completion)
    return Promise.resolve()
      .then(() => fn(req, res, next))
      .then(() => undefined) // Ensure return type is Promise<void>
      .catch(next);
  };
}

/**
 * Create standardized API response
 */
export const createResponse = {
  success: <T>(data: T, message?: string) => ({
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
  }),
  error: (message: string, code?: string, details?: any) => ({
    success: false,
    error: message,
    code,
    details,
    timestamp: new Date().toISOString(),
  }),
};

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const isDevelopment = process.env['NODE_ENV'] === 'development';
  if (error instanceof ValidationError) {
    res
      .status(400)
      .json(createResponse.error(error.message, 'VALIDATION_ERROR'));
    return;
  }
  if (error instanceof AuthenticationError) {
    res
      .status(401)
      .json(createResponse.error(error.message, 'AUTHENTICATION_ERROR'));
    return;
  }
  if (error instanceof AuthorizationError) {
    res
      .status(403)
      .json(createResponse.error(error.message, 'AUTHORIZATION_ERROR'));
    return;
  }
  if (error instanceof NotFoundError) {
    res.status(404).json(createResponse.error(error.message, 'NOT_FOUND'));
    return;
  }
  // Default server error
  res
    .status(500)
    .json(
      createResponse.error(
        'Internal server error',
        'INTERNAL_ERROR',
        isDevelopment
          ? { message: error.message, stack: error.stack }
          : undefined
      )
    );
};
