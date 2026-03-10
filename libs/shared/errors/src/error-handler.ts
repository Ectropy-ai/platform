/**
 * Error Handling System - Ectropy Platform
 * Standardized error handling with security-aware logging
 */

/// <reference types="node" />

import type { NextFunction, Request, Response } from 'express';
import { logger } from '@ectropy/shared/utils';

/**
 * Custom Error Classes
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errorCode: string;
  public readonly context?: any;
  constructor(
    message: string,
    statusCode: number = 500,
    errorCode: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    context?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errorCode = errorCode;
    this.context = context;
    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }
}
export class ValidationError extends AppError {
  constructor(message: string, field?: string, value?: any) {
    super(message, 400, 'VALIDATION_ERROR', true, { field, value });
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR', true);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR', true);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND_ERROR', true, { resource });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, conflictingField?: string) {
    super(message, 409, 'CONFLICT_ERROR', true, { conflictingField });
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, operation?: string) {
    super(message, 500, 'DATABASE_ERROR', true, { operation });
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super(
      `${service} service error: ${message}`,
      503,
      'EXTERNAL_SERVICE_ERROR',
      true,
      { service }
    );
  }
}

export class SecurityError extends AppError {
  constructor(message: string, threat?: string) {
    super(message, 400, 'SECURITY_ERROR', true, { threat });
  }
}

/**
 * Async Error Handler Wrapper
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Async Function Wrapper with Error Handling
 */
export const handleAsync = async <T>(
  promise: Promise<T>
): Promise<[T | null, Error | null]> => {
  try {
    const result = await promise;
    return [result, null];
  } catch (error) {
    return [null, error instanceof Error ? error : new Error(String(error))];
  }
};

/**
 * Error Response Formatter
 */
interface ErrorResponse {
  error: string;
  message: string;
  errorCode: string;
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  requestId?: string;
  context?: any;
  stack?: string;
}

/**
 * Error Formatter Utility
 */
export class ErrorFormatter {
  static formatError(error: Error, req: Request): ErrorResponse {
    const isAppError = error instanceof AppError;
    const statusCode = isAppError ? error.statusCode : 500;
    const errorCode = isAppError ? error.errorCode : 'INTERNAL_ERROR';
    const response: ErrorResponse = {
      error: this.getErrorTitle(statusCode),
      message: this.sanitizeErrorMessage(error.message, req),
      errorCode,
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      requestId: req.headers['x-request-id'] as string,
    };
    // Add context for operational errors
    if (isAppError && error.context) {
      response.context = this.sanitizeContext(error.context);
    }

    // Add stack trace in development
    if (process.env['NODE_ENV'] === 'development' && error.stack) {
      response.stack = error.stack;
    }

    return response;
  }

  /**
   * Get error title by status code
   */
  private static getErrorTitle(statusCode: number): string {
    const titles: { [key: number]: string } = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout',
    };
    return titles[statusCode] || 'Error';
  }

  /**
   * Sanitize error message for production
   */
  private static sanitizeErrorMessage(message: string, req: Request): string {
    // Don't expose sensitive information in production
    if (process.env['NODE_ENV'] === 'production') {
      // Remove potential sensitive data patterns
      return message
        .replace(/password/gi, '["REDACTED"]')
        .replace(/secret/gi, '["REDACTED"]')
        .replace(/token/gi, '["REDACTED"]')
        .replace(/key/gi, '["REDACTED"]')
        .replace(/\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, '["REDACTED"]') // Credit cards
        .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '["REDACTED"]'); // SSN
    }
    return message;
  }

  /**
   * Sanitize context object for logging
   */
  private static sanitizeContext(context: any): any {
    if (!context) {
      return context;
    }

    const sanitized = { ...context };
    // Remove sensitive fields
    const sensitiveFields = [
      'password',
      'secret',
      'token',
      'key',
      'authorization',
    ];
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '["REDACTED"]';
      }
    }
    return sanitized;
  }
}

/**
 * Global Error Handler Middleware
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const isAppError = error instanceof AppError;
  const statusCode = isAppError ? error.statusCode : 500;
  // Log error with appropriate level
  const logLevel = statusCode >= 500 ? 'error' : 'warn';
  const logContext = {
    error: {
      name: error.name,
      message: error.message,
      errorCode: isAppError ? error.errorCode : 'INTERNAL_ERROR',
      isOperational: isAppError ? error.isOperational : false,
    } as any,
    request: {
      ip: req.ip,
      userId: (req as any).user?.id,
      requestId: req.headers['x-request-id'],
    },
    timestamp: new Date().toISOString(),
  };

  // Only add optional properties if they exist
  if (error.stack) {
    logContext.error.stack = error.stack;
  }

  const userAgent = req.get('User-Agent');
  if (userAgent) {
    (logContext.request as any).userAgent = userAgent;
  }

  logger[logLevel]('Error occurred', logContext);

  // Format and send error response
  const errorResponse = ErrorFormatter.formatError(error, req);
  res.status(statusCode).json(errorResponse);
};

/**
 * 404 Handler
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const error = new NotFoundError(`Route ${req.method} ${req.path}`);
  next(error);
};

/**
 * Process Error Handlers
 */
export const setupProcessErrorHandlers = (): void => {
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Promise Rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: promise.toString(),
    });
    // In production, exit gracefully
    if (process.env['NODE_ENV'] === 'production') {
      process.exit(1);
    }
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    const errorInfo: any = {
      name: error.name,
      message: error.message,
    };

    if (error.stack) {
      errorInfo.stack = error.stack;
    }

    logger.error('Uncaught Exception', {
      error: errorInfo,
    });
    // Exit immediately - uncaught exceptions are not recoverable
    process.exit(1);
  });

  // Handle graceful shutdown
  const gracefulShutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`, {
      signal,
    });
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};

/**
 * Database Error Handler
 */
export const handleDatabaseError = (error: any): AppError => {
  // PostgreSQL error codes
  if (error.code) {
    switch (error.code) {
      case '23505': // Unique violation
        return new ConflictError('Resource already exists', error.constraint);
      case '23503': // Foreign key violation
        return new ValidationError('Referenced resource does not exist');
      case '23502': // Not null violation
        return new ValidationError('Required field is missing', error.column);
      case '23514': // Check violation
        return new ValidationError(
          'Data violates constraints',
          error.constraint
        );
      case '42P01': // Undefined table
        return new DatabaseError('Database schema error');
      case '42703': // Undefined column
      case '08003': // Connection does not exist
      case '08006': // Connection failure
        return new DatabaseError('Database connection error');
      case '57014': // Query canceled
        return new DatabaseError('Query timeout');
      default:
        return new DatabaseError(`Database error: ${error.message}`);
    }
  }

  // Handle other database errors
  if (error.message.includes('timeout')) {
    return new DatabaseError('Database operation timeout');
  }

  if (error.message.includes('connection')) {
    return new DatabaseError('Database connection error');
  }

  return new DatabaseError(error.message);
};

/**
 * Validation Error Handler
 */
export const handleValidationError = (errors: any[]): ValidationError => {
  const messages = errors.map((error) => {
    if (error.msg) {
      return error.msg;
    }
    if (error.message) {
      return error.message;
    }
    return 'Validation failed';
  });

  return new ValidationError(messages.join(', '));
};

/**
 * JWT Error Handler
 */
export const handleJWTError = (error: any): AppError => {
  if (error.name === 'JsonWebTokenError') {
    return new AuthenticationError('Invalid token');
  }

  if (error.name === 'TokenExpiredError') {
    return new AuthenticationError('Token expired');
  }

  if (error.name === 'NotBeforeError') {
    return new AuthenticationError('Token not active');
  }

  return new AuthenticationError('Token validation failed');
};
