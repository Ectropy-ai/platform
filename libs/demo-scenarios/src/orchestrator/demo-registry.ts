/**
 * Demo Registry
 *
 * Central registry for available demo scenarios and active instances.
 * Provides discovery, validation, and instance tracking across the system.
 *
 * @module @ectropy/demo-scenarios/orchestrator/demo-registry
 */

import { v4 as uuidv4 } from 'uuid';
import {
  listScenarios,
  getScenario,
  type ScenarioId,
} from '../scenarios/index.js';
import type { BuildingType } from '../types/index.js';

/**
 * Scenario list item from listScenarios()
 */
interface ScenarioListItem {
  id: ScenarioId;
  name: string;
  description: string;
  buildingType: BuildingType;
  complexity: 'low' | 'medium' | 'high';
  durationWeeks: number;
}
import type {
  DemoInstance,
  DemoInstanceId,
  DemoInstanceState,
  DemoFlowConfig,
} from './types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Registered scenario with metadata
 */
export interface RegisteredScenario extends ScenarioListItem {
  /** Whether scenario is enabled for demo creation */
  enabled: boolean;

  /** Maximum concurrent instances allowed for this scenario */
  maxInstances: number;

  /** Current active instance count */
  activeInstances: number;

  /** Tags for filtering/discovery */
  tags: string[];
}

/**
 * Instance lookup criteria
 */
export interface InstanceLookup {
  ownerId?: string;
  scenarioId?: ScenarioId;
  state?: DemoInstanceState | DemoInstanceState[];
  projectId?: string;
}

// ============================================================================
// DEMO REGISTRY CLASS
// ============================================================================

/**
 * Demo Registry Service
 *
 * Manages the catalog of available scenarios and tracks all active instances.
 * Provides thread-safe instance management with quota enforcement.
 */
export class DemoRegistry {
  private instances: Map<DemoInstanceId, DemoInstance> = new Map();
  private instancesByOwner: Map<string, Set<DemoInstanceId>> = new Map();
  private instancesByScenario: Map<ScenarioId, Set<DemoInstanceId>> = new Map();
  private config: DemoFlowConfig;
  private logger: DemoFlowConfig['logger'];

  constructor(config: Partial<DemoFlowConfig> = {}) {
    this.config = {
      maxInstancesPerUser: config.maxInstancesPerUser ?? 3,
      maxGlobalInstances: config.maxGlobalInstances ?? 50,
      idleTimeoutMs: config.idleTimeoutMs ?? 30 * 60 * 1000, // 30 minutes
      maxPlaybackSpeed: config.maxPlaybackSpeed ?? 10,
      enableRealtimeSync: config.enableRealtimeSync ?? true,
      persistToDatabase: config.persistToDatabase ?? true,
      dbPool: config.dbPool,
      redis: config.redis,
      logger: config.logger,
    };

    this.logger = config.logger || {
      info: console.log,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };
  }

  // ==========================================================================
  // SCENARIO DISCOVERY
  // ==========================================================================

  /**
   * Lists all available demo scenarios
   */
  listAvailableScenarios(): RegisteredScenario[] {
    const baseScenarios = listScenarios();

    return baseScenarios.map(scenario => {
      const activeCount = this.instancesByScenario.get(scenario.id as ScenarioId)?.size ?? 0;

      return {
        ...scenario,
        enabled: true,
        maxInstances: 10, // Default max per scenario
        activeInstances: activeCount,
        tags: this.getScenarioTags(scenario.id),
      };
    });
  }

  /**
   * Gets detailed scenario information
   */
  getScenarioDetails(scenarioId: ScenarioId, projectId: string = 'preview') {
    return getScenario(scenarioId, projectId);
  }

  /**
   * Gets tags for a scenario based on its properties
   */
  private getScenarioTags(scenarioId: string): string[] {
    const tags: string[] = [];

    // Add building type tags
    if (scenarioId.includes('office')) tags.push('office', 'commercial');
    if (scenarioId.includes('house')) tags.push('residential', 'single-family');
    if (scenarioId.includes('duplex')) tags.push('residential', 'multi-family');
    if (scenarioId.includes('apartment')) tags.push('residential', 'multi-family');

    // Add complexity tags
    if (scenarioId.includes('simple')) tags.push('beginner', 'quick');
    if (scenarioId.includes('complex')) tags.push('advanced', 'detailed');

    // Default tag
    if (tags.length === 0) tags.push('standard');

    return tags;
  }

  // ==========================================================================
  // INSTANCE MANAGEMENT
  // ==========================================================================

  /**
   * Creates a new demo instance
   * Returns null if quota exceeded
   */
  createInstance(
    scenarioId: ScenarioId,
    ownerId: string,
    projectId: string,
    metadata: Record<string, unknown> = {}
  ): DemoInstance | null {
    // Check quotas
    if (!this.checkQuotas(ownerId)) {
      this.logger?.warn('Instance quota exceeded', { ownerId, scenarioId });
      return null;
    }

    const instanceId = uuidv4() as DemoInstanceId;
    const now = new Date();

    const instance: DemoInstance = {
      id: instanceId,
      scenarioId,
      state: 'initializing',
      ownerId,
      projectId,
      createdAt: now,
      lastActivityAt: now,
      currentPosition: { week: 1, day: 1, hour: 0 },
      playbackSpeed: 1,
      recordCounts: {
        users: 0,
        projects: 0,
        voxels: 0,
        decisions: 0,
        alerts: 0,
        activities: 0,
      },
      metadata,
    };

    // Register instance
    this.instances.set(instanceId, instance);

    // Update owner index
    if (!this.instancesByOwner.has(ownerId)) {
      this.instancesByOwner.set(ownerId, new Set());
    }
    this.instancesByOwner.get(ownerId)!.add(instanceId);

    // Update scenario index
    if (!this.instancesByScenario.has(scenarioId)) {
      this.instancesByScenario.set(scenarioId, new Set());
    }
    this.instancesByScenario.get(scenarioId)!.add(instanceId);

    this.logger?.info('Demo instance created', {
      instanceId,
      scenarioId,
      ownerId,
      projectId,
    });

    return instance;
  }

  /**
   * Gets an instance by ID
   */
  getInstance(instanceId: DemoInstanceId): DemoInstance | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * Finds instances matching criteria
   */
  findInstances(lookup: InstanceLookup): DemoInstance[] {
    let candidates: DemoInstance[] = [];

    // Start with owner filter if specified (most selective)
    if (lookup.ownerId) {
      const ownerInstanceIds = this.instancesByOwner.get(lookup.ownerId);
      if (!ownerInstanceIds) return [];
      candidates = Array.from(ownerInstanceIds)
        .map(id => this.instances.get(id)!)
        .filter(Boolean);
    } else {
      candidates = Array.from(this.instances.values());
    }

    // Apply additional filters
    if (lookup.scenarioId) {
      candidates = candidates.filter(i => i.scenarioId === lookup.scenarioId);
    }

    if (lookup.state) {
      const states = Array.isArray(lookup.state) ? lookup.state : [lookup.state];
      candidates = candidates.filter(i => states.includes(i.state));
    }

    if (lookup.projectId) {
      candidates = candidates.filter(i => i.projectId === lookup.projectId);
    }

    return candidates;
  }

  /**
   * Updates an instance state
   */
  updateInstanceState(
    instanceId: DemoInstanceId,
    state: DemoInstanceState,
    error?: DemoInstance['error']
  ): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    instance.state = state;
    instance.lastActivityAt = new Date();

    if (error) {
      instance.error = error;
    } else {
      delete instance.error;
    }

    return true;
  }

  /**
   * Updates instance record counts
   */
  updateRecordCounts(
    instanceId: DemoInstanceId,
    counts: Partial<DemoInstance['recordCounts']>
  ): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    Object.assign(instance.recordCounts, counts);
    instance.lastActivityAt = new Date();

    return true;
  }

  /**
   * Updates playback position
   */
  updatePosition(instanceId: DemoInstanceId, position: DemoInstance['currentPosition']): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    instance.currentPosition = position;
    instance.lastActivityAt = new Date();

    return true;
  }

  /**
   * Destroys an instance and cleans up references
   */
  destroyInstance(instanceId: DemoInstanceId): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    // Remove from owner index
    this.instancesByOwner.get(instance.ownerId)?.delete(instanceId);

    // Remove from scenario index
    this.instancesByScenario.get(instance.scenarioId)?.delete(instanceId);

    // Remove instance
    this.instances.delete(instanceId);

    this.logger?.info('Demo instance destroyed', {
      instanceId,
      scenarioId: instance.scenarioId,
      ownerId: instance.ownerId,
    });

    return true;
  }

  // ==========================================================================
  // QUOTA MANAGEMENT
  // ==========================================================================

  /**
   * Checks if user can create new instance
   */
  checkQuotas(ownerId: string): boolean {
    // Check global limit
    if (this.instances.size >= this.config.maxGlobalInstances) {
      return false;
    }

    // Check per-user limit
    const ownerInstances = this.instancesByOwner.get(ownerId);
    if (ownerInstances && ownerInstances.size >= this.config.maxInstancesPerUser) {
      return false;
    }

    return true;
  }

  /**
   * Gets quota information for a user
   */
  getQuotaInfo(ownerId: string): {
    used: number;
    limit: number;
    globalUsed: number;
    globalLimit: number;
  } {
    return {
      used: this.instancesByOwner.get(ownerId)?.size ?? 0,
      limit: this.config.maxInstancesPerUser,
      globalUsed: this.instances.size,
      globalLimit: this.config.maxGlobalInstances,
    };
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  /**
   * Finds idle instances that should be cleaned up
   */
  findIdleInstances(): DemoInstance[] {
    const now = Date.now();
    const threshold = now - this.config.idleTimeoutMs;

    return Array.from(this.instances.values()).filter(instance => {
      // Only clean up instances that aren't actively playing
      if (instance.state === 'playing') return false;

      return instance.lastActivityAt.getTime() < threshold;
    });
  }

  /**
   * Gets registry statistics
   */
  getStats(): {
    totalInstances: number;
    instancesByState: Record<DemoInstanceState, number>;
    instancesByScenario: Record<string, number>;
    uniqueOwners: number;
  } {
    const byState: Record<string, number> = {};
    const byScenario: Record<string, number> = {};

    for (const instance of this.instances.values()) {
      byState[instance.state] = (byState[instance.state] ?? 0) + 1;
      byScenario[instance.scenarioId] = (byScenario[instance.scenarioId] ?? 0) + 1;
    }

    return {
      totalInstances: this.instances.size,
      instancesByState: byState as Record<DemoInstanceState, number>,
      instancesByScenario: byScenario,
      uniqueOwners: this.instancesByOwner.size,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let registryInstance: DemoRegistry | null = null;

export function getDemoRegistry(config?: Partial<DemoFlowConfig>): DemoRegistry {
  if (!registryInstance) {
    registryInstance = new DemoRegistry(config);
  }
  return registryInstance;
}

export function resetDemoRegistry(): void {
  registryInstance = null;
}
