/**
 * ============================================================================
 * DEMO SCENARIO SERVICE
 * ============================================================================
 * Enterprise service for managing demo scenario lifecycle including
 * instantiation, database seeding, and playback coordination.
 *
 * @module @ectropy/demo-scenarios/services
 * @version 1.0.0
 * ============================================================================
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  DemoScenario,
  ScenarioInstance,
  GenerationOptions,
  GeneratedRecords,
  TimelinePosition,
  ScenarioEvent,
  VoxelDefinition,
  // Persona, // Unused import
} from '../types/index.js';
import {
  getScenario,
  listScenarios,
  type ScenarioId,
} from '../scenarios/index.js';
import { generateBuildingVoxels } from '../generators/voxel.generator.js';
import { addDays, addHours, addWeeks } from 'date-fns'; // format removed - unused

// ============================================================================
// TYPES
// ============================================================================

/**
 * Scenario service configuration
 */
export interface ScenarioServiceConfig {
  /** Base URL for Speckle integration */
  speckleBaseUrl?: string;
  /** Database connection (PrismaClient or Pool) */
  database?: unknown;
  /** Logger instance */
  logger?: {
    info: (message: string, meta?: unknown) => void;
    warn: (message: string, meta?: unknown) => void;
    error: (message: string, meta?: unknown) => void;
    debug: (message: string, meta?: unknown) => void;
  };
}

/**
 * Scenario instantiation result
 */
export interface InstantiationResult {
  success: boolean;
  instanceId: string;
  scenario: DemoScenario;
  generatedRecords: GeneratedRecords;
  errors: string[];
  warnings: string[];
}

/**
 * Active scenario instances cache
 */
const activeInstances = new Map<string, ScenarioInstance>();

// ============================================================================
// SERVICE CLASS
// ============================================================================

/**
 * Demo Scenario Service
 *
 * Manages the complete lifecycle of demo scenarios:
 * - Listing available scenarios
 * - Instantiating scenarios with database records
 * - Managing playback state
 * - Cleanup and reset
 */
export class DemoScenarioService {
  private logger: ScenarioServiceConfig['logger'];

  constructor(config: ScenarioServiceConfig = {}) {
    this.logger = config.logger || {
      info: console.log,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };
  }

  // ==========================================================================
  // SCENARIO LISTING
  // ==========================================================================

  /**
   * Lists all available scenario templates
   */
  listAvailableScenarios() {
    return listScenarios();
  }

  /**
   * Gets detailed information about a specific scenario
   */
  getScenarioDetails(scenarioId: ScenarioId, projectId: string): DemoScenario {
    return getScenario(scenarioId, projectId);
  }

  // ==========================================================================
  // SCENARIO INSTANTIATION
  // ==========================================================================

  /**
   * Instantiates a scenario, generating all required data
   */
  async instantiateScenario(
    scenarioId: ScenarioId,
    options: Partial<GenerationOptions>
  ): Promise<InstantiationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const instanceId = uuidv4();

    // Merge with defaults
    const generationOptions: GenerationOptions = {
      seed: options.seed,
      startDate: options.startDate || new Date(),
      projectId: options.projectId || `demo-${instanceId.substring(0, 8)}`,
      tenantId: options.tenantId,
      includeSpeckle: options.includeSpeckle ?? true,
      variations: options.variations,
    };

    this.logger?.info(`Instantiating scenario: ${scenarioId}`, {
      instanceId,
      projectId: generationOptions.projectId,
    });

    try {
      // Load scenario template
      const scenario = getScenario(scenarioId, generationOptions.projectId);

      // Generate voxels
      const voxels = this.generateVoxels(scenario, generationOptions);

      // Generate database records
      const generatedRecords = this.generateDatabaseRecords(
        scenario,
        generationOptions,
        voxels
      );

      // Create instance tracking
      const instance: ScenarioInstance = {
        id: instanceId,
        scenarioId: scenario.id,
        options: generationOptions,
        generatedAt: new Date().toISOString(),
        currentPosition: { week: 1, day: 1, hour: 0 },
        state: 'ready',
        generatedRecords,
      };

      // Cache the instance
      activeInstances.set(instanceId, instance);

      this.logger?.info(`Scenario instantiated successfully`, {
        instanceId,
        eventCount: scenario.timeline?.length || 0,
        voxelCount: voxels.length,
      });

      return {
        success: true,
        instanceId,
        scenario,
        generatedRecords,
        errors,
        warnings,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);
      this.logger?.error(`Scenario instantiation failed: ${errorMessage}`);

      return {
        success: false,
        instanceId,
        scenario: getScenario(scenarioId, generationOptions.projectId),
        generatedRecords: this.createEmptyRecords(),
        errors,
        warnings,
      };
    }
  }

  /**
   * Generates voxels for the scenario
   */
  private generateVoxels(
    scenario: DemoScenario,
    options: GenerationOptions
  ): VoxelDefinition[] {
    return generateBuildingVoxels({
      projectId: options.projectId,
      buildingType: scenario.buildingType,
      resolution: 1.0,
      targetCount: scenario.seedRequirements?.voxelCount || 50,
      statusDistribution: {
        PLANNED: 0.7,
        IN_PROGRESS: 0.2,
        COMPLETED: 0.08,
        ON_HOLD: 0.01,
        BLOCKED: 0.01,
      },
    });
  }

  /**
   * Generates all database records for the scenario
   */
  private generateDatabaseRecords(
    scenario: DemoScenario,
    options: GenerationOptions,
    voxels: VoxelDefinition[]
  ): GeneratedRecords {
    const startDate = options.startDate;

    // Generate user records from cast
    const users = this.generateUserRecords(scenario, options);

    // Generate project record
    const projects = this.generateProjectRecords(scenario, options);

    // Generate participant records
    const participants = this.generateParticipantRecords(scenario, options);

    // Convert voxels to database format
    const voxelRecords = voxels.map((v) => this.voxelToDbRecord(v, options));

    // Generate decision records from timeline
    const decisions = this.generateDecisionRecords(
      scenario,
      options,
      startDate
    );

    // Generate inspection records from timeline
    const inspections = this.generateInspectionRecords(
      scenario,
      options,
      startDate
    );

    // Generate consequence records
    const consequences = this.generateConsequenceRecords(scenario, options);

    // Generate decision event records
    const decisionEvents = this.generateDecisionEventRecords(
      scenario,
      options,
      startDate
    );

    // Generate alert records
    const alerts = this.generateAlertRecords(scenario, options, startDate);

    // Generate acknowledgment records
    const acknowledgments: unknown[] = [];

    return {
      users,
      projects,
      participants,
      voxels: voxelRecords,
      decisions,
      inspections,
      consequences,
      decisionEvents,
      alerts,
      acknowledgments,
    };
  }

  /**
   * Generates user records from scenario cast
   */
  private generateUserRecords(
    scenario: DemoScenario,
    options: GenerationOptions
  ): unknown[] {
    const cast = scenario.cast!; // Assert non-null: scenarios should always have cast
    const allPersonas = [
      cast.architect,
      cast.engineer,
      cast.contractor,
      cast.owner,
      ...(cast.supporting || []),
    ];

    return allPersonas.map((persona) => ({
      id: persona.id,
      email: persona.email,
      name: persona.name,
      role: persona.role,
      company: persona.company,
      tenant_id: options.tenantId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'active',
      email_verified: true,
      permissions: persona.permissions,
      metadata: {
        demo: true,
        scenario_id: scenario.id,
        authority_level: persona.authorityLevel,
      },
    }));
  }

  /**
   * Generates project records
   */
  private generateProjectRecords(
    scenario: DemoScenario,
    options: GenerationOptions
  ): unknown[] {
    return [
      {
        id: options.projectId,
        name: scenario.buildingConfig!.name, // Assert non-null: valid scenarios have buildingConfig
        description: scenario.buildingConfig!.description,
        status: 'active',
        owner_id: scenario.cast!.owner.id, // Assert non-null: scenarios should have cast
        tenant_id: options.tenantId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          demo: true,
          scenario_id: scenario.id,
          building_type: scenario.buildingType,
          square_feet: scenario.buildingConfig!.squareFeet,
          levels: scenario.buildingConfig!.levels,
          duration_weeks: scenario.duration.weeks,
        },
      },
    ];
  }

  /**
   * Generates participant records from cast
   */
  private generateParticipantRecords(
    scenario: DemoScenario,
    options: GenerationOptions
  ): unknown[] {
    const cast = scenario.cast!; // Assert non-null: scenarios should always have cast
    const allPersonas = [
      cast.architect,
      cast.engineer,
      cast.contractor,
      cast.owner,
      ...(cast.supporting || []),
    ];

    return allPersonas.map((persona) => ({
      id: uuidv4(),
      urn: persona.urn,
      project_id: options.projectId,
      participant_id: persona.id,
      name: persona.name,
      email: persona.email,
      company: persona.company,
      trade: persona.trade || null,
      authority_level_id: persona.authorityLevel,
      created_at: new Date().toISOString(),
    }));
  }

  /**
   * Converts a voxel definition to database record format
   */
  private voxelToDbRecord(
    voxel: VoxelDefinition,
    options: GenerationOptions
  ): unknown {
    return {
      id: uuidv4(),
      urn: voxel.urn,
      project_id: options.projectId,
      voxel_id: voxel.id,
      status: voxel.status,
      coord_x: voxel.coordinates.x,
      coord_y: voxel.coordinates.y,
      coord_z: voxel.coordinates.z,
      resolution: voxel.resolution,
      min_x: voxel.bounds.minX,
      max_x: voxel.bounds.maxX,
      min_y: voxel.bounds.minY,
      max_y: voxel.bounds.maxY,
      min_z: voxel.bounds.minZ,
      max_z: voxel.bounds.maxZ,
      building: voxel.location.building,
      level: voxel.location.level,
      zone: voxel.location.zone,
      system: voxel.system || null,
      grid_reference: voxel.location.gridReference,
      graph_metadata: {},
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Generates decision records from timeline events
   */
  private generateDecisionRecords(
    scenario: DemoScenario,
    options: GenerationOptions,
    startDate: Date
  ): unknown[] {
    const decisionEvents = scenario.timeline!.filter(
      (e) => e.type === 'decision'
    );

    return decisionEvents.map((event) => {
      const payload = event.payload as {
        type: 'decision';
        decisionType: string;
        question: string;
        options: unknown[];
        authorityRequired: number;
      };
      const eventDate = this.positionToDate(event.position, startDate);

      return {
        id: uuidv4(),
        urn: `urn:ectropy:${options.projectId}:decision:${event.decisionRefs[0] || uuidv4()}`,
        project_id: options.projectId,
        decision_id: event.decisionRefs[0] || `DEC-${uuidv4().substring(0, 8)}`,
        title: event.title,
        description: event.description,
        type: payload.decisionType,
        status: 'PENDING',
        authority_required: payload.authorityRequired,
        authority_current: 0,
        question: payload.question,
        options: payload.options,
        created_at: eventDate.toISOString(),
        graph_metadata: {},
      };
    });
  }

  /**
   * Generates inspection records from timeline events
   */
  private generateInspectionRecords(
    scenario: DemoScenario,
    options: GenerationOptions,
    startDate: Date
  ): unknown[] {
    const inspectionEvents = scenario.timeline!.filter(
      (e) => e.type === 'inspection'
    );

    return inspectionEvents.map((event) => {
      const payload = event.payload as {
        type: 'inspection';
        inspectionType: string;
        requirements: string[];
      };
      const eventDate = this.positionToDate(event.position, startDate);

      return {
        id: uuidv4(),
        project_id: options.projectId,
        inspection_type: payload.inspectionType,
        title: event.title,
        description: event.description,
        requirements: payload.requirements,
        status: 'SCHEDULED',
        scheduled_at: eventDate.toISOString(),
        created_at: new Date().toISOString(),
      };
    });
  }

  /**
   * Generates consequence records
   */
  private generateConsequenceRecords(
    scenario: DemoScenario,
    options: GenerationOptions
  ): unknown[] {
    const consequences: unknown[] = [];

    scenario.timeline!.forEach((event) => {
      event.consequences.forEach((consequence) => {
        consequences.push({
          id: uuidv4(),
          project_id: options.projectId,
          event_id: event.id,
          category: consequence.category,
          description: consequence.description,
          severity: consequence.severity,
          cost_impact: consequence.quantifiedImpact?.cost,
          schedule_impact_days: consequence.quantifiedImpact?.days,
          created_at: new Date().toISOString(),
        });
      });
    });

    return consequences;
  }

  /**
   * Generates decision event records for audit trail
   */
  private generateDecisionEventRecords(
    scenario: DemoScenario,
    options: GenerationOptions,
    startDate: Date
  ): unknown[] {
    return scenario.timeline!.map((event) => {
      const eventDate = this.positionToDate(event.position, startDate);

      return {
        id: uuidv4(),
        project_id: options.projectId,
        event_type: event.type,
        event_id: event.id,
        actor: event.actor,
        title: event.title,
        description: event.description,
        priority: event.priority,
        voxel_refs: event.voxelRefs,
        decision_refs: event.decisionRefs,
        payload: event.payload,
        occurred_at: eventDate.toISOString(),
        created_at: new Date().toISOString(),
      };
    });
  }

  /**
   * Generates alert records from timeline events
   */
  private generateAlertRecords(
    scenario: DemoScenario,
    options: GenerationOptions,
    startDate: Date
  ): unknown[] {
    const alertEvents = scenario.timeline!.filter((e) => e.type === 'alert');

    return alertEvents.map((event) => {
      const payload = event.payload as {
        type: 'alert';
        alertType: string;
        severity: string;
        message: string;
      };
      const eventDate = this.positionToDate(event.position, startDate);

      return {
        id: uuidv4(),
        project_id: options.projectId,
        alert_type: payload.alertType,
        severity: payload.severity,
        message: payload.message,
        voxel_refs: event.voxelRefs,
        status: 'active',
        created_at: eventDate.toISOString(),
      };
    });
  }

  /**
   * Converts a timeline position to an actual date
   */
  private positionToDate(position: TimelinePosition, startDate: Date): Date {
    let date = startDate;
    date = addWeeks(date, position.week - 1);
    date = addDays(date, position.day - 1);
    date = addHours(date, position.hour);
    if (position.minute) {
      date = addHours(date, position.minute / 60);
    }
    return date;
  }

  /**
   * Creates empty records structure
   */
  private createEmptyRecords(): GeneratedRecords {
    return {
      users: [],
      projects: [],
      participants: [],
      voxels: [],
      decisions: [],
      inspections: [],
      consequences: [],
      decisionEvents: [],
      alerts: [],
      acknowledgments: [],
    };
  }

  // ==========================================================================
  // INSTANCE MANAGEMENT
  // ==========================================================================

  /**
   * Gets an active scenario instance
   */
  getInstance(instanceId: string): ScenarioInstance | undefined {
    return activeInstances.get(instanceId);
  }

  /**
   * Lists all active scenario instances
   */
  listActiveInstances(): ScenarioInstance[] {
    return Array.from(activeInstances.values());
  }

  /**
   * Deletes a scenario instance
   */
  deleteInstance(instanceId: string): boolean {
    return activeInstances.delete(instanceId);
  }

  /**
   * Clears all scenario instances
   */
  clearAllInstances(): void {
    activeInstances.clear();
  }

  // ==========================================================================
  // PLAYBACK SUPPORT
  // ==========================================================================

  /**
   * Updates the current position of an instance
   */
  updateInstancePosition(
    instanceId: string,
    position: TimelinePosition
  ): boolean {
    const instance = activeInstances.get(instanceId);
    if (!instance) return false;

    instance.currentPosition = position;
    return true;
  }

  /**
   * Updates the playback state of an instance
   */
  updateInstanceState(
    instanceId: string,
    state: 'ready' | 'playing' | 'paused' | 'completed'
  ): boolean {
    const instance = activeInstances.get(instanceId);
    if (!instance) return false;

    instance.state = state;
    return true;
  }

  /**
   * Gets events at or before a timeline position
   */
  getEventsUpToPosition(
    scenario: DemoScenario,
    position: TimelinePosition
  ): ScenarioEvent[] {
    return scenario.timeline!.filter((event) => {
      if (event.position.week < position.week) return true;
      if (event.position.week > position.week) return false;
      if (event.position.day < position.day) return true;
      if (event.position.day > position.day) return false;
      return event.position.hour <= position.hour;
    });
  }

  /**
   * Gets the next event after a timeline position
   */
  getNextEvent(
    scenario: DemoScenario,
    position: TimelinePosition
  ): ScenarioEvent | undefined {
    return scenario.timeline!.find((event) => {
      if (event.position.week > position.week) return true;
      if (event.position.week < position.week) return false;
      if (event.position.day > position.day) return true;
      if (event.position.day < position.day) return false;
      return event.position.hour > position.hour;
    });
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let serviceInstance: DemoScenarioService | null = null;

/**
 * Gets the demo scenario service singleton
 */
export function getDemoScenarioService(
  config?: ScenarioServiceConfig
): DemoScenarioService {
  if (!serviceInstance) {
    serviceInstance = new DemoScenarioService(config);
  }
  return serviceInstance;
}

/**
 * Resets the service singleton (for testing)
 */
export function resetDemoScenarioService(): void {
  serviceInstance = null;
}
