/**
 * Client-side Logger Utility
 *
 * Enterprise-grade browser logging with environment awareness
 * Production-safe with appropriate log levels
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDevelopment = process.env.NODE_ENV === 'development';

class ClientLogger {
  private prefix = '[Ectropy]';

  debug(...args: unknown[]): void {
    if (isDevelopment) {
      console.debug(this.prefix, ...args);
    }
  }

  info(...args: unknown[]): void {
    console.info(this.prefix, ...args);
  }

  warn(...args: unknown[]): void {
    console.warn(this.prefix, ...args);
  }

  error(...args: unknown[]): void {
    console.error(this.prefix, ...args);
  }

  log(level: LogLevel, ...args: unknown[]): void {
    this[level](...args);
  }
}

export const clientLogger = new ClientLogger();
