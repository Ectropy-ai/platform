/**
 * Context Registry
 *
 * Manages multiple domain context adapters for the Unified Decision Engine.
 * Provides adapter registration, retrieval by domain ID, and multi-context
 * operations (e.g., querying across all registered domains).
 *
 * The registry is a singleton — one registry per MCP server instance.
 * Adapters register on startup and are available for the server's lifetime.
 *
 * Design Principles:
 * - Registry Pattern: Central lookup for domain adapters
 * - Singleton: One registry per process
 * - Fail-safe: Operations on unregistered domains return clear errors
 * - Observable: Health status for all registered adapters
 *
 * @module adapters
 * @version 1.0.0
 */

import type { DomainId, DomainContext } from './universal/universal.types.js';
import type {
  IContextAdapter,
  AdapterHealthStatus,
} from './universal/context-adapter.interface.js';

// ============================================================================
// Registry Types
// ============================================================================

/**
 * Status of a registered adapter.
 */
export interface RegisteredAdapter {
  /** The adapter instance */
  adapter: IContextAdapter;
  /** Domain context from the adapter */
  domain: DomainContext;
  /** When the adapter was registered (ISO 8601) */
  registeredAt: string;
  /** Whether the adapter has been initialized */
  initialized: boolean;
  /** Last health check result */
  lastHealthCheck?: AdapterHealthStatus;
}

/**
 * Summary of all registered adapters.
 */
export interface RegistrySummary {
  /** Number of registered adapters */
  adapterCount: number;
  /** List of registered domain IDs */
  domainIds: DomainId[];
  /** Per-adapter status */
  adapters: Array<{
    domainId: DomainId;
    domainName: string;
    initialized: boolean;
    healthy: boolean | null;
    registeredAt: string;
  }>;
}

// ============================================================================
// Context Registry
// ============================================================================

/**
 * Central registry for domain context adapters.
 *
 * @example
 * ```typescript
 * const registry = ContextRegistry.getInstance();
 *
 * // Register adapters
 * await registry.register(new PlatformContextAdapter(config));
 * await registry.register(new ConstructionContextAdapter(config));
 *
 * // Retrieve by domain
 * const platform = registry.getAdapter('platform');
 * const workUnits = await platform.getWorkUnits();
 *
 * // Query across all domains
 * const allDecisions = await registry.getAllDecisions();
 * ```
 */
export class ContextRegistry {
  private static instance: ContextRegistry | null = null;
  private adapters: Map<DomainId, RegisteredAdapter> = new Map();

  private constructor() {
    // Singleton — use getInstance()
  }

  /**
   * Get the singleton registry instance.
   */
  static getInstance(): ContextRegistry {
    if (!ContextRegistry.instance) {
      ContextRegistry.instance = new ContextRegistry();
    }
    return ContextRegistry.instance;
  }

  /**
   * Reset the singleton instance (for testing only).
   */
  static resetInstance(): void {
    if (ContextRegistry.instance) {
      ContextRegistry.instance.adapters.clear();
    }
    ContextRegistry.instance = null;
  }

  // ==========================================================================
  // Registration
  // ==========================================================================

  /**
   * Register a context adapter.
   * Calls adapter.initialize() and runs a health check.
   *
   * @throws Error if an adapter for this domain is already registered
   */
  async register(adapter: IContextAdapter): Promise<void> {
    const domain = adapter.getDomainContext();

    if (this.adapters.has(domain.domainId)) {
      throw new Error(
        `Adapter already registered for domain '${domain.domainId}'. ` +
          `Unregister the existing adapter first.`
      );
    }

    // Initialize the adapter
    await adapter.initialize();

    // Run initial health check
    const healthCheck = await adapter.healthCheck();

    this.adapters.set(domain.domainId, {
      adapter,
      domain,
      registeredAt: new Date().toISOString(),
      initialized: true,
      lastHealthCheck: healthCheck,
    });
  }

  /**
   * Unregister a context adapter by domain ID.
   *
   * @returns true if the adapter was found and removed, false if not found
   */
  unregister(domainId: DomainId): boolean {
    return this.adapters.delete(domainId);
  }

  // ==========================================================================
  // Retrieval
  // ==========================================================================

  /**
   * Get an adapter by domain ID.
   *
   * @throws Error if no adapter is registered for the given domain
   */
  getAdapter(domainId: DomainId): IContextAdapter {
    const registered = this.adapters.get(domainId);
    if (!registered) {
      const available = Array.from(this.adapters.keys()).join(', ') || '(none)';
      throw new Error(
        `No adapter registered for domain '${domainId}'. ` +
          `Available domains: ${available}`
      );
    }
    return registered.adapter;
  }

  /**
   * Check if an adapter is registered for a domain.
   */
  hasAdapter(domainId: DomainId): boolean {
    return this.adapters.has(domainId);
  }

  /**
   * Get all registered domain IDs.
   */
  getDomainIds(): DomainId[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get all registered adapters.
   */
  getAllAdapters(): IContextAdapter[] {
    return Array.from(this.adapters.values()).map((r) => r.adapter);
  }

  // ==========================================================================
  // Multi-Context Operations
  // ==========================================================================

  /**
   * Run health checks on all registered adapters.
   * Returns a map of domain ID → health status.
   */
  async healthCheckAll(): Promise<Map<DomainId, AdapterHealthStatus>> {
    const results = new Map<DomainId, AdapterHealthStatus>();

    for (const [domainId, registered] of this.adapters) {
      try {
        const status = await registered.adapter.healthCheck();
        registered.lastHealthCheck = status;
        results.set(domainId, status);
      } catch (error) {
        const errorStatus: AdapterHealthStatus = {
          healthy: false,
          source: domainId,
          error: (error as Error).message,
        };
        registered.lastHealthCheck = errorStatus;
        results.set(domainId, errorStatus);
      }
    }

    return results;
  }

  /**
   * Clear caches on all registered adapters.
   */
  clearAllCaches(): void {
    for (const registered of this.adapters.values()) {
      registered.adapter.clearCache();
    }
  }

  /**
   * Get a summary of the registry state.
   */
  getSummary(): RegistrySummary {
    const adapters: RegistrySummary['adapters'] = [];

    for (const [domainId, registered] of this.adapters) {
      adapters.push({
        domainId,
        domainName: registered.domain.domainName,
        initialized: registered.initialized,
        healthy: registered.lastHealthCheck?.healthy ?? null,
        registeredAt: registered.registeredAt,
      });
    }

    return {
      adapterCount: this.adapters.size,
      domainIds: Array.from(this.adapters.keys()),
      adapters,
    };
  }
}
