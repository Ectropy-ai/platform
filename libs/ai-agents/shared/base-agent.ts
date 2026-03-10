import type {
  AgentError,
  AgentEventPayload,
  AgentConfig,
  BaseAgentResult,
  TemplateService,
  DatabasePool,
} from './types.js';

class SimpleEventEmitter {
  private events: Map<string | symbol, Array<(...args: any[]) => void>> =
    new Map();

  emit(event: string | symbol, ...args: any[]): boolean {
    const listeners = this.events.get(event);
    if (listeners && listeners.length > 0) {
      listeners.forEach((listener) => {
        try {
          listener(...args);
        } catch (_error) {
          // Silently ignore listener errors to prevent cascading failures
        }
      });
      return true;
    }
    return false;
  }

  on(event: string | symbol, listener: (...args: any[]) => void): this {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(listener);
    return this;
  }

  off(event: string | symbol, listener: (...args: any[]) => void): this {
    const listeners = this.events.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
    return this;
  }
}
export abstract class BaseAgent extends SimpleEventEmitter {
  protected readonly config: Required<AgentConfig>;
  protected readonly db: DatabasePool;
  protected readonly templateService: TemplateService;

  constructor(
    db: DatabasePool,
    templateService: TemplateService,
    config: AgentConfig = {}
  ) {
    super();
    this.db = db;
    this.templateService = templateService;
    this.config = {
      pollIntervalMs: 5000,
      maxRetries: 3,
      timeout: 30000,
      enableEventEmission: true,
      ...config,
    };
  }

  protected createError(
    operation: string,
    message: string,
    code = 'AGENT_ERROR',
    details?: Record<string, unknown>
  ): AgentError {
    const error = new Error(message) as AgentError;
    error.code = code;
    error.agentType = this.getAgentType();
    error.operation = operation;
    if (details !== undefined) {
      error.details = details;
    }
    return error;
  }

  protected emitEvent(
    eventName: string,
    payload: Omit<AgentEventPayload, 'agentType'>
  ): void {
    if (!this.config.enableEventEmission) {
      return;
    }
    // Add agentType to payload and emit event
    const fullPayload = { ...payload, agentType: this.getAgentType() };
    this.emit(eventName, fullPayload);
  }

  protected handleError(operation: string, error: unknown): AgentError {
    let agentError: AgentError;
    if (error instanceof Error) {
      if ('code' in error && 'agentType' in error) {
        // Already an AgentError
        agentError = error as AgentError;
      } else {
        // Convert regular Error to AgentError
        agentError = this.createError(
          operation,
          error.message,
          'OPERATION_FAILED',
          { originalError: error.name }
        );
      }
    } else {
      // Handle non-Error types
      agentError = this.createError(
        operation,
        typeof error === 'string' ? error : 'Unknown error occurred',
        'UNKNOWN_ERROR',
        { originalError: typeof error }
      );
    }
    // Emit error event
    this.emitEvent('error', {
      projectId: '', // Will be overridden by specific agents
      operation,
      error: agentError,
    });
    return agentError;
  }
  protected async validateProject(projectId: string): Promise<void> {
    try {
      const hasAccess =
        await this.templateService.validateProjectAccess(projectId);
      if (!hasAccess) {
        throw this.createError(
          'validateProject',
          `No access to project: ${projectId}`,
          'ACCESS_DENIED',
          { projectId }
        );
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error; // Re-throw AgentError
      }
      throw this.createError(
        'validateProject',
        'Failed to validate project access',
        'VALIDATION_FAILED',
        { projectId, originalError: error }
      );
    }
  }

  protected createBaseResult(
    projectId: string,
    success: boolean
  ): BaseAgentResult {
    return {
      success,
      timestamp: new Date(),
      agentType: this.getAgentType(),
      projectId,
    };
  }

  protected async executeWithRetry<T>(
    operation: string,
    fn: () => Promise<T>,
    maxRetries: number = this.config.maxRetries
  ): Promise<T> {
    let lastError: AgentError | undefined;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = this.handleError(operation, error);
        if (attempt === maxRetries) {
          throw lastError;
        }
        // Wait before retry (exponential backoff)
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await this.delay(delayMs);
      }
    }
    // This should never be reached, but TypeScript requires it
    throw (
      lastError ?? this.createError(operation, 'Unknown error in retry loop')
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      if (process.env.NODE_ENV === 'test') {
        resolve();
      } else {
        setTimeout(resolve, ms);
      }
    });
  }

  protected abstract getAgentType(): string;
}
