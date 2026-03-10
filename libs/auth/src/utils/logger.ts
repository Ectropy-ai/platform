/**
 * Simple logger for auth library
 * Temporary solution to avoid cross-library import issues during build
 */

export const logger = {
  info: (message: string, ...args: any[]) => console.log(message, ...args),
  error: (message: string, ...args: any[]) => console.error(message, ...args),
  warn: (message: string, ...args: any[]) => console.warn(message, ...args),
  debug: (message: string, ...args: any[]) => console.debug(message, ...args)
};

export class Logger {
  constructor(private context: string) {}

  info(message: string, ...args: any[]) {
    logger.info(`[${this.context}] ${message}`, ...args);
  }

  error(message: string, ...args: any[]) {
    logger.error(`[${this.context}] ${message}`, ...args);
  }

  warn(message: string, ...args: any[]) {
    logger.warn(`[${this.context}] ${message}`, ...args);
  }

  debug(message: string, ...args: any[]) {
    logger.debug(`[${this.context}] ${message}`, ...args);
  }
}