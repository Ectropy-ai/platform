/**
 * =============================================================================
 * ECTROPY STRUCTURED LOGGER SERVICE
 *
 * PURPOSE: Production-ready logging with security awareness and audit trails
 * FEATURES:
 * - Multi-level logging (debug, info, warn, error, security)
 * - PII-safe output with data sanitization
 * - Audit logging for compliance and security monitoring
 * - Performance tracking and metrics collection
 * SECURITY:
 * - Sensitive data filtering to prevent credential leaks
 * - Security event logging for threat detection
 * - Configurable log levels for different environments
 * USAGE:
 * import { Logger } from '@ectropy/shared/utils';
 * const logger = new Logger('ServiceName');
 * logger.info('Operation completed', { userId, projectId });
 */

/// <reference types="node" />
import * as path from 'path';
import * as winston from 'winston';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  DEBUG = 'debug',
}

export interface LogContext {
  [key: string]: any;
}

class DataSanitizer {
  private static readonly SENSITIVE_FIELDS = [
    'password',
    'secret',
    'token',
    'key',
    'authorization',
    'auth',
    'session',
    'cookie',
    'credit',
    'card',
    'ssn',
    'social',
    'security',
    'passport',
    'license',
  ];
  private static readonly SENSITIVE_PATTERNS = [
    /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, // Credit card numbers
    /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
    /Bearer\s+[A-Za-z0-9\-_]+/g, // Bearer tokens
    /[A-Za-z0-9]{32,}/g, // Long random strings (likely secrets)
  ];

  static sanitize(data: any): any {
    if (data === null || data === undefined) return data;
    if (typeof data === 'string') return this.sanitizeString(data);
    if (Array.isArray(data)) return data.map((item) => this.sanitize(item));
    if (typeof data === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        const lowercaseKey = key.toLowerCase();
        const isSensitiveField = this.SENSITIVE_FIELDS.some((field) =>
          lowercaseKey.includes(field)
        );
        sanitized[key] = isSensitiveField
          ? '["REDACTED"]'
          : this.sanitize(value);
      }
      return sanitized;
    }
    return data;
  }

  private static sanitizeString(str: string): string {
    let sanitized = str;
    for (const pattern of this.SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '["REDACTED"]');
    }
    return sanitized;
  }
}

const createLogFormat = (isDevelopment: boolean) => {
  const baseFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  );
  if (isDevelopment) {
    return winston.format.combine(
      baseFormat,
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp, ...meta }: any) => {
        const metaStr =
          Object.keys(meta).length > 0
            ? `\n${JSON.stringify(DataSanitizer.sanitize(meta), null, 2)}`
            : '';
        return `${timestamp} [${level}]: ${message}${metaStr}`;
      })
    );
  }
  return winston.format.combine(
    baseFormat,
    winston.format.printf(({ timestamp, level, message, ...meta }: any) => {
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...DataSanitizer.sanitize(meta),
      });
    })
  );
};

/**
 * Enterprise Logger for AECO Platform
 * Provides structured logging for audit trails required in construction projects
 */
export class Logger {
  private winston: winston.Logger;
  private isDevelopment: boolean;
  private service: string;

  constructor(service: string = 'ectropy-platform') {
    this.service = service;
    this.isDevelopment = process.env['NODE_ENV'] === 'development';
    this.winston = this.createLogger();
  }

  private createLogger(): winston.Logger {
    const logLevel =
      process.env['LOG_LEVEL'] || (this.isDevelopment ? 'debug' : 'info');
    const logDir = process.env['LOG_DIR'] || 'logs';
    const transports: any[] = [
      new winston.transports.Console({
        level: logLevel,
        format: createLogFormat(this.isDevelopment),
      }),
    ];
    if (!this.isDevelopment) {
      transports.push(
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error',
          maxsize: 50 * 1024 * 1024, // 50MB
          maxFiles: 5,
          format: winston.format.json(),
        }),
        new winston.transports.File({
          filename: path.join(logDir, 'combined.log'),
          maxsize: 100 * 1024 * 1024, // 100MB
          maxFiles: 10,
          format: winston.format.json(),
        }),
        new winston.transports.File({
          filename: path.join(logDir, 'security.log'),
          level: 'warn',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
            winston.format.printf(
              ({ timestamp, level, message, security, ...meta }: any) => {
                if (security) {
                  return JSON.stringify({
                    timestamp,
                    level,
                    message,
                    security: DataSanitizer.sanitize(security),
                    ...DataSanitizer.sanitize(meta),
                  });
                }
                return JSON.stringify({
                  timestamp,
                  level,
                  message,
                  ...DataSanitizer.sanitize(meta),
                });
              }
            )
          ),
        })
      );
    }
    return winston.createLogger({
      level: logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        createLogFormat(this.isDevelopment)
      ),
      defaultMeta: {
        service: this.service,
        version: process.env['npm_package_version'] || '1.0.0',
        environment: process.env['NODE_ENV'] || 'development',
      },
      transports,
      exitOnError: false,
    }) as unknown as winston.Logger;
  }

  private format(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metadata = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${this.service}] ${level}: ${message}${metadata}`;
  }

  info(message: string, meta?: any) {
    this.winston.info(message, meta);
  }

  error(message: string, error?: any) {
    // Properly serialize Error objects with all their properties
    if (error?.error instanceof Error) {
      this.winston.error(message, {
        ...error,
        error: {
          message: error.error.message,
          stack: error.error.stack,
          name: error.error.name,
          ...(error.error as any),
        },
      });
    } else if (error instanceof Error) {
      this.winston.error(message, {
        message: error.message,
        stack: error.stack,
        name: error.name,
        ...(error as any),
      });
    } else {
      this.winston.error(message, error);
    }
    // In production, this would send to centralized logging (DataDog, CloudWatch)
  }

  warn(message: string, meta?: any) {
    this.winston.warn(message, meta);
  }

  debug(message: string, meta?: any) {
    if (process.env.NODE_ENV === 'development' || process.env.LOG_LEVEL === 'debug') {
    }
    this.winston.debug(message, meta);
  }

  audit(action: string, user: string, details: any) {
    // Critical for construction compliance and accountability
    const auditMessage = `User ${user} performed ${action}`;
    this.winston.warn(auditMessage, { 
      audit: true, 
      action, 
      user, 
      details: DataSanitizer.sanitize(details) 
    });
  }

  http(message: string, context?: LogContext): void {
    this.winston.info(message, { ...context, level: 'http' });
  }

  security(
    message: string,
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    context?: LogContext
  ): void {
    this.winston.warn(message, {
      ...context,
      security: {
        event,
        severity,
        threat: context?.['security']?.threat,
      },
    });
  }

  performance(message: string, operation: string, duration: number): void {
    this.winston.info(message, {
      performance: {
        operation,
        duration,
        memory: (process as NodeJS.Process).memoryUsage().heapUsed,
      },
    });
  }

  database(message: string, query: string, rows?: number): void {
    this.winston.debug(message, {
      database: {
        query: this.isDevelopment ? query : '[QUERY]',
        rows,
      },
    });
  }

  requestMiddleware() {
    return (req: any, res: any, next: any) => {
      const startTime = Date.now();
      const requestId = req.headers['x-request-id'] || this.generateRequestId();
      req.requestId = requestId;
      this.http('Request received', {
        requestId,
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id,
      });
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.http('Request completed', {
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          responseTime: duration,
          ip: req.ip,
          userId: req.user?.id,
        });
      });
      next();
    };
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getInstance(): winston.Logger {
    return this.winston;
  }

  child(context: LogContext): Logger {
    const childLogger = new Logger(this.service);
    const sanitizedContext = DataSanitizer.sanitize(context);
    (childLogger as any).winston = winston.createLogger({
      level: this.winston.level,
      format: this.winston.format,
      transports: this.winston.transports,
      defaultMeta: {
        ...sanitizedContext,
      },
    }) as unknown as winston.Logger;
    return childLogger;
  }
}

export const logger = new Logger();
export { DataSanitizer };
