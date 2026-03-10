/**
 * Input Validation Middleware
 * Comprehensive request validation with XSS protection and sanitization
 */

import {
  body,
  param,
  query,
  validationResult,
  ValidationChain,
} from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import DOMPurify from 'isomorphic-dompurify';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

/**
 * Custom sanitizer for HTML content
 */
const sanitizeHtml = (value: string): string => {
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [], // Strip all HTML tags
    ALLOWED_ATTR: [], // Strip all attributes
  });
};

/**
 * Common validation rules
 */
export const validationRules = {
  // Project validation
  projectId: param('projectId')
    .isUUID()
    .withMessage('Invalid project ID format'),

  // User authentication
  email: body('email')
    .isEmail()
    .normalizeEmail()
    .isLength({ max: 254 })
    .withMessage('Valid email is required'),

  password: body('password')
    .isLength({ min: 12, max: 128 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]/)
    .withMessage(
      'Password must be 12+ chars with uppercase, lowercase, number, and special character'
    ),

  // Proposal validation
  proposalTitle: body('title')
    .trim()
    .isLength({ min: 3, max: 200 })
    .customSanitizer(sanitizeHtml)
    .withMessage('Title must be 3-200 characters'),

  proposalDescription: body('description')
    .trim()
    .isLength({ min: 10, max: 5000 })
    .customSanitizer(sanitizeHtml)
    .withMessage('Description must be 10-5000 characters'),

  proposalType: body('type')
    .isIn([
      'budget_allocation',
      'material_access',
      'governance',
      'technical',
      'schedule',
    ])
    .withMessage('Invalid proposal type'),

  // Element validation
  elementType: body('element_type')
    .matches(/^IFC[A-Z]+$/)
    .withMessage(
      'Element type must be valid IFC type (e.g., IFCWALL, IFCBEAM)'
    ),

  elementName: body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .customSanitizer(sanitizeHtml)
    .withMessage('Element name must be 2-100 characters'),

  elementStatus: body('status')
    .isIn(['draft', 'in-review', 'approved', 'rejected'])
    .withMessage('Invalid element status'),

  // Vote validation
  voteType: body('vote_type')
    .isIn(['for', 'against', 'abstain'])
    .withMessage('Vote type must be for, against, or abstain'),

  // Geometry validation
  geometry: body('geometry').custom((value) => {
    if (typeof value !== 'object') {
      throw new Error('Geometry must be an object');
    }

    const requiredFields = ['position', 'rotation', 'scale'];
    const requiredCoords = ['x', 'y', 'z'];

    for (const field of requiredFields) {
      if (!value[field] || typeof value[field] !== 'object') {
        throw new Error(`Geometry.${field} is required and must be an object`);
      }

      for (const coord of requiredCoords) {
        if (typeof value[field][coord] !== 'number') {
          throw new Error(`Geometry.${field}.${coord} must be a number`);
        }
      }
    }

    return true;
  }),

  // Properties validation (JSONB)
  properties: body('properties').custom((value) => {
    if (typeof value !== 'object') {
      throw new Error('Properties must be an object');
    }

    // Sanitize string values in properties
    const sanitized = sanitizeObjectStrings(value);
    return sanitized;
  }),

  // Pagination
  page: query('page')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .toInt()
    .withMessage('Page must be an integer between 1 and 1000'),

  limit: query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .toInt()
    .withMessage('Limit must be an integer between 1 and 100'),

  // Search filters
  searchQuery: query('q')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .customSanitizer(sanitizeHtml)
    .withMessage('Search query must be 1-100 characters'),
};

/**
 * Sanitize string values in nested objects
 */
function sanitizeObjectStrings(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeHtml(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObjectStrings);
  }

  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[sanitizeHtml(key)] = sanitizeObjectStrings(value);
    }
    return sanitized;
  }

  return obj;
}

/**
 * Validation middleware factory
 */
export function validate(validations: ValidationChain[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Run all validations
    await Promise.all(validations.map((validation) => validation.run(req)));

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation failed', {
        path: req.path,
        method: req.method,
        errors: errors.array(),
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array().map((err) => ({
          field: err.type === 'field' ? err.path : err.type,
          message: err.msg,
          value: err.type === 'field' ? err.value : undefined,
        })),
      });
    }

    next();
  };
}

/**
 * Rate limiting based validation for sensitive operations
 */
export const sensitiveOperationLimit = (
  windowMs: number = 15 * 60 * 1000, // 15 minutes
  maxAttempts: number = 5
) => {
  const attempts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}-${req.path}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    for (const [k, v] of attempts.entries()) {
      if (v.resetTime < windowStart) {
        attempts.delete(k);
      }
    }

    const current = attempts.get(key) || {
      count: 0,
      resetTime: now + windowMs,
    };

    if (current.count >= maxAttempts && current.resetTime > now) {
      logger.warn('Rate limit exceeded for sensitive operation', {
        ip: req.ip,
        path: req.path,
        attempts: current.count,
      });

      return res.status(429).json({
        error: 'Too many attempts',
        message: 'Please wait before trying again',
        retryAfter: Math.ceil((current.resetTime - now) / 1000),
      });
    }

    current.count += 1;
    attempts.set(key, current);
    next();
  };
};

/**
 * SQL Injection prevention middleware
 */
export const sqlInjectionProtection = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const suspiciousPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
    /(--|\/\*|\*\/|;|\||&)/,
    /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i,
    /(\b(OR|AND)\s+['"]\w+['"]?\s*=\s*['"]\w+['"]?)/i,
  ];

  const checkValue = (value: any, path: string): boolean => {
    if (typeof value === 'string') {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(value)) {
          logger.warn('Potential SQL injection detected', {
            path: req.path,
            field: path,
            value: value.substring(0, 100), // Log first 100 chars only
            ip: req.ip,
            userAgent: req.get('User-Agent'),
          });
          return false;
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, val] of Object.entries(value)) {
        if (!checkValue(val, `${path}.${key}`)) {
          return false;
        }
      }
    }
    return true;
  };

  // Check query parameters
  for (const [key, value] of Object.entries(req.query)) {
    if (!checkValue(value, `query.${key}`)) {
      return res.status(400).json({
        error: 'Invalid input detected',
        message: 'Request contains potentially harmful content',
      });
    }
  }

  // Check request body
  if (req.body && typeof req.body === 'object') {
    for (const [key, value] of Object.entries(req.body)) {
      if (!checkValue(value, `body.${key}`)) {
        return res.status(400).json({
          error: 'Invalid input detected',
          message: 'Request contains potentially harmful content',
        });
      }
    }
  }

  next();
};

/**
 * File upload validation
 */
export const validateFileUpload = (
  allowedMimeTypes: string[] = ['application/ifc', 'model/ifc'],
  maxSizeBytes: number = 50 * 1024 * 1024 // 50MB
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'A file is required for this endpoint',
      });
    }

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      logger.warn('Invalid file type uploaded', {
        mimetype: req.file.mimetype,
        originalName: req.file.originalname,
        ip: req.ip,
      });

      return res.status(400).json({
        error: 'Invalid file type',
        message: `Only ${allowedMimeTypes.join(', ')} files are allowed`,
      });
    }

    if (req.file.size > maxSizeBytes) {
      logger.warn('File too large uploaded', {
        size: req.file.size,
        maxSize: maxSizeBytes,
        originalName: req.file.originalname,
        ip: req.ip,
      });

      return res.status(400).json({
        error: 'File too large',
        message: `File must be smaller than ${Math.round(maxSizeBytes / 1024 / 1024)}MB`,
      });
    }

    next();
  };
};

/**
 * Validation error handler middleware
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.info('Request validation failed', {
      path: req.path,
      method: req.method,
      errors: errors.array(),
      ip: req.ip,
    });

    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array(),
    });
  }
  next();
};
