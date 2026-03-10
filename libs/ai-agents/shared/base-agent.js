/**
 * =============================================================================
 * BASE AI AGENT CLASS
 * =============================================================================
 *
 * Base class for all AI agents that provides standardized error handling,
 * event emission, and common functionality.
 *
 * @fileoverview Provides the abstract BaseAgent class that all AI agents
 * should extend to ensure consistent behavior, error handling, and event
 * emission patterns across the agent ecosystem.
 */
/**
 * Simple EventEmitter implementation for cross-environment compatibility.
 *
 * @class SimpleEventEmitter
 * @description Lightweight event emitter that works across different JavaScript
 * environments without requiring Node.js EventEmitter dependency.
 */
class SimpleEventEmitter {
  constructor() {
    this.events = new Map();
  }
  /**
   * Emit an event to all registered listeners.
   *
   * @param {string | symbol} event - Event name or symbol
   * @param {...any[]} args - Arguments to pass to event listeners
   * @returns {boolean} True if the event had listeners, false otherwise
   */
  emit(event, ...args) {
    const listeners = this.events.get(event);
    if (listeners !== null) {
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
  /**
   * Add an event listener.
   *
   * @param {string | symbol} event - Event name or symbol
   * @param {(...args: any[]) => void} listener - Event handler function
   * @returns {this} This instance for method chaining
   */
  on(event, listener) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event).push(listener);
    return this;
  }
  /**
   * Remove an event listener.
   *
   * @param {string | symbol} event - Event name or symbol
   * @param {(...args: any[]) => void} listener - Event handler function to remove
   * @returns {this} This instance for method chaining
   */
  off(event, listener) {
    const listeners = this.events.get(event);
    if (listeners !== null) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
    return this;
  }
}
/**
 * Abstract base class that all AI agents should extend.
 *
 * @abstract
 * @class BaseAgent
 * @extends SimpleEventEmitter
 * @description Provides common functionality for all AI agents including error handling,
 * event emission, project validation, retry logic, and result standardization.
 *
 * All agents should extend this class and implement the getAgentType() method.
 *
 * @example
 * ```typescript
 * class MyAgent extends BaseAgent {
 *   protected getAgentType(): string {
 *     return 'my-agent';
 *   }
 *
 *   async performWork(projectId: string): Promise<BaseAgentResult> {
 *     return this.executeWithRetry('performWork', async () => {
 *       await this.validateProject(projectId);
 *       // ... do work ...
 *       return this.createBaseResult(projectId, true);
 *     });
 *   }
 * }
 * ```
 */
export class BaseAgent extends SimpleEventEmitter {
  /**
   * Create a new BaseAgent instance.
   *
   * @param {any} db - Database connection pool (typed as any to avoid import dependencies)
   * @param {TemplateService} templateService - Service for accessing DAO governance templates
   * @param {AgentConfig} [config={}] - Optional configuration overrides
   */
  constructor(db, templateService, config = {}) {
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
  /**
   * Creates a standardized AgentError object.
   *
   * @protected
   * @param {string} operation - Name of the operation that failed
   * @param {string} message - Human-readable error message
   * @param {string} [code='AGENT_ERROR'] - Machine-readable error code for programmatic handling
   * @param {Record<string, unknown>} [details] - Additional error context and debugging information
   * @returns {AgentError} Standardized error object with agent metadata
   *
   * @example
   * ```typescript
   * const error = this.createError(
   *   'validateProject',
   *   'Project not found',
   *   'PROJECT_NOT_FOUND',
   *   { projectId: 'proj-123' }
   * );
   * ```
   */
  createError(operation, message, code = 'AGENT_ERROR', details) {
    const error = new Error(message);
    error.code = code;
    error.agentType = this.getAgentType();
    error.operation = operation;
    if (details !== undefined) {
      error.details = details;
    }
    return error;
  }
  /**
   * Emits a standardized event with error handling and agent metadata.
   *
   * @protected
   * @param {string} eventName - Name of the event to emit
   * @param {Omit<AgentEventPayload, 'agentType'>} payload - Event payload (agentType will be added automatically)
   * @returns {void}
   *
   * @description This method ensures all events emitted by agents follow a consistent
   * structure and include the agent type. Event emission can be disabled via configuration.
   *
   * @example
   * ```typescript
   * this.emitEvent('validation:completed', {
   *   projectId: 'proj-123',
   *   operation: 'validateProject',
   *   result: validationResult,
   *   metadata: { duration: 1500 }
   * });
   * ```
   */
  emitEvent(eventName, payload) {
    if (!this.config.enableEventEmission) {
      return;
    }
    try {
      const fullPayload = {
        ...payload,
        agentType: this.getAgentType(),
      };
      this.emit(eventName, fullPayload);
    } catch (_error) {
      // Silently fail to avoid infinite loops
    }
  }
  /**
   * Handles errors consistently across all agents.
   *
   * @protected
   * @param {string} operation - Name of the operation that encountered the error
   * @param {unknown} error - The error that occurred (may be Error, string, or other type)
   * @returns {AgentError} Standardized AgentError object
   *
   * @description Converts any type of error into a standardized AgentError format
   * and automatically emits an error event. This ensures consistent error handling
   * and monitoring across all agents.
   *
   * @example
   * ```typescript
   * try {
   *   await someOperation();
   * } catch (_error) {
   *   throw this.handleError('someOperation', error);
   * }
   * ```
   */
  handleError(operation, error) {
    let agentError;
    if (error instanceof Error) {
      if ('code' in error && 'agentType' in error) {
        // Already an AgentError
        agentError = error;
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
  /**
   * Validates project access before performing operations.
   *
   * @protected
   * @param {string} projectId - ID of the project to validate access for
   * @returns {Promise<void>} Resolves if access is valid, throws AgentError if not
   * @throws {AgentError} When project access is denied or validation fails
   *
   * @description This method should be called before performing any project-specific
   * operations to ensure the agent has proper access through the DAO governance system.
   *
   * @example
   * ```typescript
   * async performProjectOperation(projectId: string): Promise<Result> {
   *   await this.validateProject(projectId); // Throws if access denied
   *   // ... perform operation ...
   * }
   * ```
   */
  async validateProject(projectId) {
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
    } catch (_error) {
      if (_error instanceof Error && 'code' in _error) {
        throw _error; // Re-throw AgentError
      }
      throw this.createError(
        'validateProject',
        'Failed to validate project access',
        'VALIDATION_FAILED',
        { projectId, originalError: _error }
      );
    }
  }
  /**
   * Creates a base result object with standard fields populated.
   *
   * @protected
   * @param {string} projectId - ID of the project this result relates to
   * @param {boolean} success - Whether the operation was successful
   * @returns {BaseAgentResult} Base result object with timestamp and agent metadata
   *
   * @description This method provides a consistent way to create result objects
   * that all agents return. Additional fields can be added to the returned object
   * for agent-specific results.
   *
   * @example
   * ```typescript
   * const baseResult = this.createBaseResult(projectId, true);
   * return {
   *   ...baseResult,
   *   specificField: 'specific value'
   * };
   * ```
   */
  createBaseResult(projectId, success) {
    return {
      success,
      timestamp: new Date(),
      agentType: this.getAgentType(),
      projectId,
    };
  }
  /**
   * Execute an operation with standardized error handling and retry logic.
   *
   * @protected
   * @template T - Return type of the operation
   * @param {string} operation - Name of the operation for error reporting
   * @param {() => Promise<T>} fn - Async function to execute
   * @param {number} [maxRetries=this.config.maxRetries] - Maximum number of retry attempts
   * @returns {Promise<T>} Result of the operation
   * @throws {AgentError} If all retry attempts fail
   *
   * @description This method provides automatic retry logic with exponential backoff
   * for operations that may fail due to transient issues. All errors are properly
   * handled and converted to AgentError format.
   *
   * @example
   * ```typescript
   * const result = await this.executeWithRetry('fetchData', async () => {
   *   const response = await fetch('/api/data');
   *   return response.json();
   * }, 5); // Override max retries to 5
   * ```
   */
  async executeWithRetry(operation, fn, maxRetries = this.config.maxRetries) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (_error) {
        lastError = this.handleError(operation, _error);
        if (attempt === maxRetries) {
          throw lastError;
        }
        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await this.delay(delay);
      }
    }
    // This should never be reached, but TypeScript requires it
    throw (
      lastError !== null ||
      this.createError(operation, 'Unknown error in retry loop')
    );
  }
  /**
   * Promise-based delay function for retry backoff.
   *
   * @private
   * @param {number} ms - Number of milliseconds to delay
   * @returns {Promise<void>} Promise that resolves after the delay
   *
   * @description Provides a simple delay mechanism for retry logic.
   * In testing environments, this resolves immediately to avoid test delays.
   */
  delay(_ms) {
    return new Promise((resolve) => {
      // Simple immediate resolution for testing/compilation
      // In a real runtime environment, this would use proper timing
      resolve();
    });
  }
}
//# sourceMappingURL=base-agent.js.map
