/**
 * =============================================================================
 * MCP SERVER LOGGER
 *
 * PURPOSE: Enterprise logging for MCP Server with automatic context propagation
 * PATTERN: Wraps shared logger with MCP-specific context and formatting
 *
 * USAGE:
 * import { mcpLogger } from './utils/mcp-logger.js';
 *
 * // Standard logging
 * mcpLogger.info('Agent initialized', { agentType: 'compliance' });
 * mcpLogger.error('Tool execution failed', error);
 *
 * // With context (automatic in request handlers)
 * mcpLogger.withContext().info('Processing request');
 *
 * ENTERPRISE FEATURES:
 * - Automatic correlation ID propagation
 * - PII sanitization
 * - Structured JSON in production
 * - Agent-specific logging methods
 */

import { Logger, requestContext } from '@ectropy/shared/utils';

/**
 * MCP Server specific log context
 */
interface MCPLogContext {
  agentType?: string;
  toolName?: string;
  modelId?: string;
  operationDuration?: number;
  [key: string]: unknown;
}

/**
 * Enterprise MCP Logger
 * Provides structured logging with automatic context propagation
 */
class MCPLogger {
  private logger: Logger;
  private serviceName: string = 'mcp-server';

  constructor() {
    this.logger = new Logger(this.serviceName);
  }

  /**
   * Get a logger with automatic request context attached
   * Use this within request handlers
   */
  withContext(): Logger {
    return requestContext.getLogger();
  }

  /**
   * Get the current request ID if available
   */
  getRequestId(): string | undefined {
    return requestContext.getContext()?.requestId;
  }

  /**
   * Standard info logging
   */
  info(message: string, context?: MCPLogContext): void {
    const ctx = this.buildContext(context);
    this.logger.info(message, ctx);
  }

  /**
   * Warning logging
   */
  warn(message: string, context?: MCPLogContext): void {
    const ctx = this.buildContext(context);
    this.logger.warn(message, ctx);
  }

  /**
   * Error logging with proper error serialization
   */
  error(message: string, error?: Error | unknown, context?: MCPLogContext): void {
    const ctx = this.buildContext(context);

    if (error instanceof Error) {
      this.logger.error(message, {
        ...ctx,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      });
    } else if (error) {
      this.logger.error(message, { ...ctx, error });
    } else {
      this.logger.error(message, ctx);
    }
  }

  /**
   * Debug logging (only in development or when LOG_LEVEL=debug)
   */
  debug(message: string, context?: MCPLogContext): void {
    const ctx = this.buildContext(context);
    this.logger.debug(message, ctx);
  }

  /**
   * Agent-specific logging
   */
  agent(
    action: 'initialize' | 'execute' | 'complete' | 'error',
    agentType: string,
    context?: MCPLogContext
  ): void {
    const ctx = this.buildContext({ ...context, agentType });

    switch (action) {
      case 'initialize':
        this.logger.info(`Agent ${agentType} initializing`, ctx);
        break;
      case 'execute':
        this.logger.info(`Agent ${agentType} executing`, ctx);
        break;
      case 'complete':
        this.logger.info(`Agent ${agentType} completed`, ctx);
        break;
      case 'error':
        this.logger.error(`Agent ${agentType} failed`, ctx);
        break;
    }
  }

  /**
   * Tool execution logging
   */
  tool(
    action: 'invoke' | 'success' | 'error',
    toolName: string,
    context?: MCPLogContext
  ): void {
    const ctx = this.buildContext({ ...context, toolName });

    switch (action) {
      case 'invoke':
        this.logger.info(`Tool ${toolName} invoked`, ctx);
        break;
      case 'success':
        this.logger.info(`Tool ${toolName} succeeded`, ctx);
        break;
      case 'error':
        this.logger.error(`Tool ${toolName} failed`, ctx);
        break;
    }
  }

  /**
   * Performance logging for operations
   */
  performance(operation: string, duration: number, context?: MCPLogContext): void {
    const ctx = this.buildContext({ ...context, operationDuration: duration });
    this.logger.performance(`MCP operation completed: ${operation}`, operation, duration);
  }

  /**
   * Database operation logging
   */
  database(operation: string, query?: string, rows?: number): void {
    this.logger.database(`MCP database: ${operation}`, query || '', rows);
  }

  /**
   * Security event logging
   */
  security(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    context?: MCPLogContext
  ): void {
    const ctx = this.buildContext(context);
    this.logger.security(`MCP security event: ${event}`, event, severity, ctx);
  }

  /**
   * Startup logging with banner
   */
  startup(config: {
    port: number;
    environment: string;
    version?: string;
    features?: string[];
  }): void {
    const banner = `
================================================================================
  MCP SERVER STARTUP
  Port: ${config.port}
  Environment: ${config.environment}
  Version: ${config.version || 'unknown'}
  Features: ${config.features?.join(', ') || 'standard'}
================================================================================`;

    this.logger.info('MCP Server starting', {
      port: config.port,
      environment: config.environment,
      version: config.version,
      features: config.features,
    });

    // Console banner for development visibility
    if (config.environment === 'development') {
      console.log(banner);
    }
  }

  /**
   * Shutdown logging
   */
  shutdown(reason: string, context?: MCPLogContext): void {
    const ctx = this.buildContext(context);
    this.logger.info('MCP Server shutting down', { ...ctx, reason });
  }

  /**
   * Build context with request correlation if available
   */
  private buildContext(context?: MCPLogContext): MCPLogContext {
    const reqContext = requestContext.getContext();

    return {
      ...context,
      requestId: reqContext?.requestId,
      correlationId: reqContext?.correlationId,
      userId: reqContext?.userId,
    };
  }
}

// Export singleton instance
export const mcpLogger = new MCPLogger();

// Export class for testing or custom instances
export { MCPLogger };

/**
 * Migration helper: Drop-in replacement for console.log
 * Use this during migration, then refactor to proper mcpLogger calls
 *
 * @deprecated Use mcpLogger.info/warn/error/debug instead
 */
export const log = {
  info: (message: string, ...args: unknown[]) => {
    mcpLogger.info(message, args.length > 0 ? { args } : undefined);
  },
  warn: (message: string, ...args: unknown[]) => {
    mcpLogger.warn(message, args.length > 0 ? { args } : undefined);
  },
  error: (message: string, ...args: unknown[]) => {
    const error = args.find((a) => a instanceof Error);
    mcpLogger.error(message, error, args.length > 0 ? { args } : undefined);
  },
  debug: (message: string, ...args: unknown[]) => {
    mcpLogger.debug(message, args.length > 0 ? { args } : undefined);
  },
};
