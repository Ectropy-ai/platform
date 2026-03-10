/**
 * Enterprise Logging Service
 * Provides structured logging with environment-aware output
 * @module logger
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// ENTERPRISE: Export LogContext interface for proper type safety across the application
export interface LogContext {
  [key: string]: any;
}

class Logger {
  private isDevelopment: boolean;
  private logLevel: LogLevel;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.logLevel = (process.env.REACT_APP_LOG_LEVEL as LogLevel) || 'info';
  }

  /**
   * Log debug information (development only)
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment && this.shouldLog('debug')) {
      console.log(`[DEBUG] ${message}`, context || '');
    }
  }

  /**
   * Log informational messages
   */
  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      console.log(`[INFO] ${message}`, context || '');
    }
  }

  /**
   * Log warning messages
   */
  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, context || '');
    }
  }

  /**
   * Log error messages (always logged)
   */
  error(message: string, error?: Error | LogContext): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, error || '');
    }
  }

  /**
   * Determine if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const requestedLevelIndex = levels.indexOf(level);
    return requestedLevelIndex >= currentLevelIndex;
  }
}

// Export singleton instance
export const logger = new Logger();
export default logger;
