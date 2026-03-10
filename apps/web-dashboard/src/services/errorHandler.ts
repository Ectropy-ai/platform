/**
 * Enterprise Error Handling Service
 * Centralized error handling with logging, retry logic, and user-friendly messages
 */

import { config } from './config';
export enum ErrorCategory {
  NETWORK = 'NETWORK',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  VALIDATION = 'VALIDATION',
  SERVER_ERROR = 'SERVER_ERROR',
  CLIENT_ERROR = 'CLIENT_ERROR',
  SPECKLE_ERROR = 'SPECKLE_ERROR',
  UNKNOWN = 'UNKNOWN',
}
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface ErrorContext {
  userId?: string;
  sessionId?: string;
  action?: string;
  component?: string;
  additionalData?: Record<string, any>;
}

export interface ProcessedError {
  id: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  userMessage: string;
  timestamp: Date;
  context: ErrorContext;
  originalError: Error;
  shouldRetry: boolean;
  retryCount: number;
  maxRetries: number;
}

class ErrorHandlingService {
  private static instance: ErrorHandlingService;
  private errorLog: ProcessedError[] = [];
  private maxLogSize = 1000;
  private constructor() {}
  public static getInstance(): ErrorHandlingService {
    if (!ErrorHandlingService.instance) {
      ErrorHandlingService.instance = new ErrorHandlingService();
    }
    return ErrorHandlingService.instance;
  }
  /**
   * Process and categorize an error
   */
  public processError(
    error: Error | any,
    context: ErrorContext = {},
    retryCount = 0,
  ): ProcessedError {
    const category = this.categorizeError(error);
    const processedError: ProcessedError = {
      id: this.generateErrorId(),
      category,
      severity: this.determineSeverity(error, context),
      message: error.message || 'Unknown error occurred',
      userMessage: this.generateUserMessage(error, category),
      timestamp: new Date(),
      context,
      originalError: error,
      shouldRetry: this.shouldRetry(error, retryCount),
      retryCount,
      maxRetries: this.getMaxRetries(error),
    };
    this.logError(processedError);
    return processedError;
  }

  /**
   * Handle API errors with retry logic
   */
  public async handleApiError<T>(
    apiCall: () => Promise<T>,
    maxRetries = 3,
    context: ErrorContext = {},
  ): Promise<T> {
    let lastError: Error;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeWithTimeout(apiCall, 30000); // 30 second timeout
      } catch (_error) {
        lastError = _error as Error;
        const processedError = this.processError(lastError, context, attempt);
        if (!processedError.shouldRetry || attempt === maxRetries) {
          throw processedError;
        }
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await this.delay(delay);
      }
    }
    throw this.processError(lastError!, context, maxRetries);
  }

  /**
   * Handle Speckle-specific errors
   */
  public handleSpeckleError(error: any, context: ErrorContext = {}): ProcessedError {
    const speckleContext = {
      ...context,
      component: 'speckle-viewer',
      action: context.action || 'speckle-operation',
    };
    return this.processError(error, speckleContext);
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeoutMs),
      ),
    ]);
  }

  /**
   * Categorize error type
   */
  private categorizeError(error: any): ErrorCategory {
    if (!error) {
      return ErrorCategory.UNKNOWN;
    }
    const message = error.message?.toLowerCase() || '';
    const status = error.status || error.response?.status;

    // Network errors
    if (
      message.includes('fetch') ||
      message.includes('network') ||
      message.includes('connection refused') ||
      message.includes('timeout')
    ) {
      return ErrorCategory.NETWORK;
    }

    // HTTP status codes
    if (status === 401) {
      return ErrorCategory.AUTHENTICATION;
    }
    if (status === 403) {
      return ErrorCategory.AUTHORIZATION;
    }
    if (status >= 400 && status < 500) {
      return ErrorCategory.CLIENT_ERROR;
    }
    if (status >= 500) {
      return ErrorCategory.SERVER_ERROR;
    }

    // Speckle-specific errors
    if (message.includes('speckle') || error.component === 'speckle') {
      return ErrorCategory.SPECKLE_ERROR;
    }

    // Validation errors
    if (message.includes('validation') || message.includes('invalid')) {
      return ErrorCategory.VALIDATION;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Determine error severity
   */
  private determineSeverity(error: any, context: ErrorContext): ErrorSeverity {
    const category = this.categorizeError(error);
    // Critical errors that break core functionality
    if (category === ErrorCategory.AUTHENTICATION || category === ErrorCategory.SERVER_ERROR) {
      return ErrorSeverity.CRITICAL;
    }

    // High severity for data operations
    if (
      context.action?.includes('save') ||
      context.action?.includes('delete') ||
      context.action?.includes('upload')
    ) {
      return ErrorSeverity.HIGH;
    }

    // Medium severity for user-facing features
    if (category === ErrorCategory.SPECKLE_ERROR || category === ErrorCategory.NETWORK) {
      return ErrorSeverity.MEDIUM;
    }

    return ErrorSeverity.LOW;
  }

  /**
   * Generate user-friendly error messages
   */
  private generateUserMessage(error: any, category: ErrorCategory): string {
    switch (category) {
      case ErrorCategory.NETWORK:
        return 'Connection failed. Please check your internet connection and try again.';
      case ErrorCategory.AUTHENTICATION:
        return 'Please log in again to continue.';
      case ErrorCategory.AUTHORIZATION:
        return "You don't have permission to perform this action.";
      case ErrorCategory.SPECKLE_ERROR:
        return 'BIM viewer is temporarily unavailable. Using fallback mode.';
      case ErrorCategory.VALIDATION:
        return 'Please check your input and try again.';
      case ErrorCategory.SERVER_ERROR:
        return 'Server error occurred. Our team has been notified.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }

  /**
   * Determine if error should be retried
   */
  private shouldRetry(error: any, retryCount: number): boolean {
    const maxRetries = this.getMaxRetries(error);
    if (retryCount >= maxRetries) {
      return false;
    }

    const category = this.categorizeError(error);
    // Retry network and server errors
    return (
      category === ErrorCategory.NETWORK ||
      category === ErrorCategory.SERVER_ERROR ||
      category === ErrorCategory.SPECKLE_ERROR
    );
  }

  /**
   * Get max retries for error type
   */
  private getMaxRetries(error: any): number {
    const category = this.categorizeError(error);
    switch (category) {
      case ErrorCategory.NETWORK:
        return 3;
      case ErrorCategory.SERVER_ERROR:
        return 2;
      default:
        return 1;
    }
  }

  /**
   * Log error for monitoring
   */
  private logError(error: ProcessedError): void {
    // Add to in-memory log
    this.errorLog.unshift(error);
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(0, this.maxLogSize);
    }

    // Console logging based on severity
    const logData = {
      id: error.id,
      category: error.category,
      severity: error.severity,
      message: error.message,
      context: error.context,
      timestamp: error.timestamp,
    };

    if (error.severity === ErrorSeverity.CRITICAL) {
    } else if (error.severity === ErrorSeverity.HIGH) {
    } else if (error.severity === ErrorSeverity.MEDIUM) {
    } else if (config.logLevel === 'debug') {
      // Debug logging would go here in development
    }

    // In production, send to monitoring service
    if (process.env.NODE_ENV === 'production') {
      this.sendToMonitoring(error);
    }
  }

  /**
   * Send error to monitoring service
   */
  private async sendToMonitoring(error: ProcessedError): Promise<void> {
    try {
      // In real implementation, send to Sentry, LogRocket, etc.
    } catch (monitoringError) {
    }
  }

  /**
   * Utility methods
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get error statistics
   */
  public getErrorStats(): {
    total: number;
    byCategory: Record<ErrorCategory, number>;
    bySeverity: Record<ErrorSeverity, number>;
    recent: ProcessedError[];
  } {
    const stats = {
      total: this.errorLog.length,
      byCategory: {} as Record<ErrorCategory, number>,
      bySeverity: {} as Record<ErrorSeverity, number>,
      recent: this.errorLog.slice(0, 10),
    };

    // Initialize counters
    Object.values(ErrorCategory).forEach(category => {
      stats.byCategory[category] = 0;
    });
    Object.values(ErrorSeverity).forEach(severity => {
      stats.bySeverity[severity] = 0;
    });

    // Count errors
    this.errorLog.forEach(error => {
      stats.byCategory[error.category]++;
      stats.bySeverity[error.severity]++;
    });

    return stats;
  }

  /**
   * Clear error log
   */
  public clearErrors(): void {
    this.errorLog = [];
  }
}

// Export singleton instance
export const errorHandler = ErrorHandlingService.getInstance();
export default ErrorHandlingService;
