/**
 * Voxel Coordination Service
 *
 * Unified enterprise-grade service coordinating all voxel operations:
 * - IFC/Speckle to Voxel conversion
 * - Prisma persistence with batch operations
 * - Real-time updates and synchronization
 * - Activity tracking and audit logging
 * - Multi-tenant project isolation
 *
 * This service provides the primary API for the ROS MRO frontend
 * and all voxel-related MCP tools.
 *
 * @module services/voxel-coordination
 * @version 1.0.0
 */

// Use dynamic import for PrismaClient when Prisma is generated
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaClient = any;
import {
  VoxelDecompositionService,
  createVoxelDecompositionService,
} from './voxel-decomposition.service';
import {
  VoxelPersistenceService,
  createVoxelPersistenceService,
  VoxelPersistenceResult,
  DecisionAttachmentInput,
} from './voxel-persistence.service';
import {
  SpeckleVoxelIntegrationService,
  createSpeckleVoxelIntegration,
  SpeckleVoxelResult,
  SpeckleVoxelOptions,
} from './speckle-voxel-integration.service';
import {
  DecisionSurfaceService,
  createDecisionSurfaceService,
  AttachDecisionInput,
  CreateToleranceOverrideInput,
  CreatePreApprovalInput,
  CreateAlertInput,
  RecordAcknowledgmentInput,
  DecisionSurfaceQueryOptions,
  DecisionSurfaceStats,
} from './decision-surface.service';
import {
  DecisionAuthorityCascadeService,
  createDecisionAuthorityCascadeService,
  DecisionImpact,
  AuthorityRoutingResult,
  AuthorityValidationResult,
  DecisionRoutingRequest,
  DecisionRoutingResponse,
} from './decision-authority-cascade.service';
import { AuthorityLevel as AuthorityLevelEnum } from '../types/pm.types';
import {
  VoxelData,
  VoxelDataV3,
  VoxelStatus,
  VoxelSystem,
  VoxelSpatialQuery,
  VoxelAggregation,
  AggregationLevel,
  VoxelActivityItem,
  VoxelizationResult,
  VoxelVisualizationConfig,
  VoxelInstanceData,
  VoxelColorScheme,
  VoxelVisualizationMode,
  VoxelCoordinationSession,
  VoxelRealtimeUpdate,
  IFCElement,
  DecisionSurface,
  AttachedDecision,
  ToleranceOverride,
  PreApproval,
  VoxelAlert,
  DecisionAcknowledgment,
  ToleranceType,
  AuthorityLevel,
  AlertPriority,
} from '../types/voxel-decomposition.types';

// ==============================================================================
// Types
// ==============================================================================

/**
 * Voxel coordination configuration
 */
export interface VoxelCoordinationConfig {
  enablePersistence: boolean;
  enableActivityTracking: boolean;
  enableDecisionSurface: boolean;
  enableAuthorityRouting: boolean;
  batchSize: number;
  syncInterval: number;
  defaultResolution: number;
}

/**
 * Result of voxelization with persistence
 */
export interface VoxelCoordinationResult {
  success: boolean;
  projectId: string;
  modelId?: string;
  voxelization: VoxelizationResult;
  persistence?: VoxelPersistenceResult;
  totalVoxels: number;
  processingTimeMs: number;
  errors: string[];
  warnings: string[];
}

/**
 * Visualization data for frontend
 */
export interface VoxelVisualizationData {
  instanceCount: number;
  voxelIds: string[];
  positions: Float32Array;
  colors: Float32Array;
  scales: Float32Array;
  metadata: Map<string, any>;
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
}

/**
 * Coordination session data
 */
export interface CoordinationSessionData {
  sessionId: string;
  projectId: string;
  participants: string[];
  createdAt: Date;
  expiresAt: Date;
  activeVoxelFocus?: string;
  recentUpdates: VoxelRealtimeUpdate[];
}

/**
 * Decision routing with voxel attachment result
 */
export interface VoxelDecisionRoutingResult {
  voxelId: string;
  decisionRef: string;
  routing: AuthorityRoutingResult;
  attachment: AttachedDecision;
  alertCreated: boolean;
  alertId?: string;
}

/**
 * Tolerance check result
 */
export interface ToleranceCheckResult {
  voxelId: string;
  withinStandardTolerance: boolean;
  withinApprovedTolerance: boolean;
  override?: ToleranceOverride;
  requiredAuthority?: AuthorityRoutingResult;
}

/**
 * Decision surface summary for project
 */
export interface ProjectDecisionSummary {
  projectId: string;
  totalVoxelsWithDecisions: number;
  totalDecisions: number;
  totalUnacknowledged: number;
  totalAlerts: number;
  criticalAlerts: number;
  toleranceOverrides: number;
  preApprovals: number;
  decisionDensityHotspots: Array<{
    voxelId: string;
    decisionCount: number;
    center: { x: number; y: number; z: number };
  }>;
}

// ==============================================================================
// Default Configuration
// ==============================================================================

const DEFAULT_CONFIG: VoxelCoordinationConfig = {
  enablePersistence: true,
  enableActivityTracking: true,
  enableDecisionSurface: true,
  enableAuthorityRouting: true,
  batchSize: 500,
  syncInterval: 5000,
  defaultResolution: 100,
};

// ==============================================================================
// Main Service Class
// ==============================================================================

/**
 * Voxel Coordination Service
 *
 * Enterprise-grade coordination layer that unifies voxel decomposition,
 * persistence, and Speckle integration into a single coherent API.
 */
export class VoxelCoordinationService {
  private prisma: PrismaClient;
  private config: VoxelCoordinationConfig;
  private decompositionService: VoxelDecompositionService;
  private persistenceService: VoxelPersistenceService;
  private speckleService: SpeckleVoxelIntegrationService;
  private decisionSurfaceService: DecisionSurfaceService;
  private authorityCascadeService: DecisionAuthorityCascadeService;
  private activeSessions: Map<string, CoordinationSessionData>;
  private realtimeListeners: Map<string, Set<(update: VoxelRealtimeUpdate) => void>>;

  constructor(
    prisma: PrismaClient,
    config?: Partial<VoxelCoordinationConfig>
  ) {
    this.prisma = prisma;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize authority cascade first (used by decision surface)
    this.authorityCascadeService = createDecisionAuthorityCascadeService();

    // Initialize decision surface with authority cascade integration
    this.decisionSurfaceService = createDecisionSurfaceService(
      this.authorityCascadeService
    );

    // Initialize voxel services
    this.decompositionService = createVoxelDecompositionService({
      resolution: this.config.defaultResolution,
    });
    this.persistenceService = createVoxelPersistenceService(prisma);
    this.speckleService = createSpeckleVoxelIntegration(prisma);

    // Session management
    this.activeSessions = new Map();
    this.realtimeListeners = new Map();
  }

  // ===========================================================================
  // Voxelization Methods
  // ===========================================================================

  /**
   * Voxelize a model and persist to database
   *
   * Full pipeline: IFC → Voxelization → Persistence → Index
   */
  async voxelizeModel(
    projectId: string,
    modelId: string,
    persist: boolean = true
  ): Promise<VoxelCoordinationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Step 1: Voxelize using decomposition service
      const voxelization = await this.decompositionService.voxelizeModel(
        projectId,
        modelId
      );

      if (!voxelization.success) {
        return {
          success: false,
          projectId,
          modelId,
          voxelization,
          totalVoxels: 0,
          processingTimeMs: Date.now() - startTime,
          errors: voxelization.errors.map((e) => e.message),
          warnings: voxelization.warnings,
        };
      }

      errors.push(...voxelization.errors.map((e) => e.message));
      warnings.push(...voxelization.warnings);

      // Step 2: Persist to database if enabled
      let persistence: VoxelPersistenceResult | undefined;
      if (persist && this.config.enablePersistence) {
        persistence = await this.persistenceService.persistVoxels(
          projectId,
          voxelization.voxels
        );

        if (!persistence.success) {
          errors.push(...persistence.errors);
        }
      }

      // Step 3: Broadcast update to listeners
      this.broadcastUpdate(projectId, {
        type: 'progress',
        voxelId: `model-${modelId}`,
        timestamp: new Date(),
        projectId,
        newValue: { modelId, voxelCount: voxelization.voxelCount },
        source: 'system',
      });

      return {
        success: true,
        projectId,
        modelId,
        voxelization,
        persistence,
        totalVoxels: voxelization.voxelCount,
        processingTimeMs: Date.now() - startTime,
        errors,
        warnings,
      };
    } catch (error) {
      return {
        success: false,
        projectId,
        modelId,
        voxelization: {
          success: false,
          projectId,
          modelId,
          gridExtent: {
            origin: { x: 0, y: 0, z: 0 },
            dimensions: { i: 0, j: 0, k: 0 },
            cellSize: this.config.defaultResolution,
            totalCells: 0,
            boundingBox: {
              min: { x: 0, y: 0, z: 0 },
              max: { x: 0, y: 0, z: 0 },
            },
          },
          resolution: this.config.defaultResolution,
          voxels: [],
          voxelCount: 0,
          stats: {
            totalVoxels: 0,
            voxelsBySystem: {} as any,
            voxelsByLevel: {},
            voxelsByStatus: {} as any,
            ifcElementsProcessed: 0,
            ifcElementsSkipped: 0,
            averageVoxelsPerElement: 0,
            gridDensity: 0,
            boundingBoxVolume: 0,
            occupiedVolume: 0,
          },
          processingTimeMs: Date.now() - startTime,
          errors: [{ code: 'COORDINATION_ERROR', message: String(error) }],
          warnings: [],
        },
        totalVoxels: 0,
        processingTimeMs: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: [],
      };
    }
  }

  /**
   * Voxelize from IFC elements with persistence
   */
  async voxelizeFromElements(
    projectId: string,
    modelId: string,
    elements: IFCElement[],
    persist: boolean = true
  ): Promise<VoxelCoordinationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Voxelize elements
      const voxelization = await this.decompositionService.voxelizeFromElements(
        projectId,
        modelId,
        elements
      );

      if (!voxelization.success) {
        return {
          success: false,
          projectId,
          modelId,
          voxelization,
          totalVoxels: 0,
          processingTimeMs: Date.now() - startTime,
          errors: voxelization.errors.map((e) => e.message),
          warnings: voxelization.warnings,
        };
      }

      // Persist if enabled
      let persistence: VoxelPersistenceResult | undefined;
      if (persist && this.config.enablePersistence) {
        persistence = await this.persistenceService.persistVoxels(
          projectId,
          voxelization.voxels
        );
        if (!persistence.success) {
          errors.push(...persistence.errors);
        }
      }

      return {
        success: true,
        projectId,
        modelId,
        voxelization,
        persistence,
        totalVoxels: voxelization.voxelCount,
        processingTimeMs: Date.now() - startTime,
        errors,
        warnings,
      };
    } catch (error) {
      return {
        success: false,
        projectId,
        modelId,
        voxelization: {
          success: false,
          projectId,
          modelId,
          gridExtent: {
            origin: { x: 0, y: 0, z: 0 },
            dimensions: { i: 0, j: 0, k: 0 },
            cellSize: this.config.defaultResolution,
            totalCells: 0,
            boundingBox: {
              min: { x: 0, y: 0, z: 0 },
              max: { x: 0, y: 0, z: 0 },
            },
          },
          resolution: this.config.defaultResolution,
          voxels: [],
          voxelCount: 0,
          stats: {
            totalVoxels: 0,
            voxelsBySystem: {} as any,
            voxelsByLevel: {},
            voxelsByStatus: {} as any,
            ifcElementsProcessed: 0,
            ifcElementsSkipped: elements.length,
            averageVoxelsPerElement: 0,
            gridDensity: 0,
            boundingBoxVolume: 0,
            occupiedVolume: 0,
          },
          processingTimeMs: Date.now() - startTime,
          errors: [{ code: 'ELEMENT_VOXELIZATION_ERROR', message: String(error) }],
          warnings: [],
        },
        totalVoxels: 0,
        processingTimeMs: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: [],
      };
    }
  }

  /**
   * Voxelize from Speckle/IFC database with persistence
   */
  async voxelizeFromSpeckle(
    projectId: string,
    modelId?: string
  ): Promise<SpeckleVoxelResult> {
    const result = await this.speckleService.voxelizeProjectElements(
      projectId,
      modelId
    );

    // Persist voxels if successful
    if (result.success && result.voxelizationResult && this.config.enablePersistence) {
      await this.persistenceService.persistVoxels(
        projectId,
        result.voxelizationResult.voxels
      );
    }

    return result;
  }

  // ===========================================================================
  // Query Methods
  // ===========================================================================

  /**
   * Query voxels with spatial and property filters
   *
   * Queries from persistence layer for database-backed results
   * Falls back to in-memory decomposition service
   */
  async queryVoxels(query: VoxelSpatialQuery): Promise<{
    voxels: VoxelData[];
    totalCount: number;
  }> {
    if (this.config.enablePersistence) {
      return this.persistenceService.queryVoxels(query);
    }
    // Fallback to in-memory query
    return this.decompositionService.queryVoxels(query);
  }

  /**
   * Get single voxel by ID
   */
  async getVoxel(voxelId: string): Promise<VoxelData | null> {
    if (this.config.enablePersistence) {
      return this.persistenceService.getVoxel(voxelId);
    }
    return this.decompositionService.getVoxel(voxelId);
  }

  /**
   * Load all voxels for a project
   */
  async loadProjectVoxels(projectId: string): Promise<VoxelData[]> {
    if (this.config.enablePersistence) {
      return this.persistenceService.loadProjectVoxels(projectId);
    }

    const result = await this.decompositionService.queryVoxels({ projectId });
    return result.voxels;
  }

  /**
   * Get voxel count for project
   */
  async getVoxelCount(projectId: string): Promise<number> {
    if (this.config.enablePersistence) {
      return this.persistenceService.getVoxelCount(projectId);
    }

    const result = await this.decompositionService.queryVoxels({
      projectId,
      limit: 1,
    });
    return result.totalCount;
  }

  // ===========================================================================
  // Status & Update Methods
  // ===========================================================================

  /**
   * Update voxel status with activity tracking
   */
  async updateVoxelStatus(
    voxelId: string,
    status: VoxelStatus,
    percentComplete?: number,
    userId?: string
  ): Promise<VoxelData | null> {
    let result: VoxelData | null = null;

    if (this.config.enablePersistence) {
      result = await this.persistenceService.updateVoxelStatus(
        voxelId,
        status,
        percentComplete
      );
    } else {
      result = await this.decompositionService.updateVoxelStatus(
        voxelId,
        status,
        percentComplete
      );
    }

    // Broadcast update
    if (result) {
      this.broadcastUpdate(result.projectId, {
        type: 'status',
        voxelId,
        timestamp: new Date(),
        projectId: result.projectId,
        newValue: { status, percentComplete },
        source: userId ? 'field' : 'system',
      });
    }

    return result;
  }

  /**
   * Attach decision to voxel
   */
  async attachDecision(input: DecisionAttachmentInput): Promise<boolean> {
    if (!this.config.enablePersistence) {
      await this.decompositionService.attachDecision(
        input.voxelId,
        input.decisionId
      );
      return true;
    }

    const success = await this.persistenceService.attachDecision(input);

    // Broadcast update
    if (success) {
      const voxel = await this.getVoxel(input.voxelId);
      if (voxel) {
        this.broadcastUpdate(voxel.projectId, {
          type: 'decision',
          voxelId: input.voxelId,
          timestamp: new Date(),
          projectId: voxel.projectId,
          newValue: {
            decisionId: input.decisionId,
            attachmentType: input.attachmentType,
          },
          source: 'system',
        });
      }
    }

    return success;
  }

  // ===========================================================================
  // Aggregation Methods
  // ===========================================================================

  /**
   * Get aggregated metrics for project
   */
  async getAggregation(
    projectId: string,
    level: AggregationLevel
  ): Promise<VoxelAggregation[]> {
    if (this.config.enablePersistence) {
      return this.persistenceService.getAggregation(projectId, level);
    }
    return this.decompositionService.getAggregation(projectId, level);
  }

  // ===========================================================================
  // Visualization Methods
  // ===========================================================================

  /**
   * Get visualization data for Three.js rendering
   *
   * Returns optimized instanced mesh data for efficient rendering
   * of thousands of voxels on the frontend.
   */
  async getVisualizationData(
    projectId: string,
    config?: Partial<VoxelVisualizationConfig>
  ): Promise<VoxelVisualizationData> {
    // Build default config if not provided
    const fullConfig: VoxelVisualizationConfig = {
      colorScheme: config?.colorScheme || VoxelColorScheme.BY_STATUS,
      mode: config?.mode || VoxelVisualizationMode.SOLID,
      opacity: config?.opacity || 0.7,
      showWireframe: config?.showWireframe || false,
      showLabels: config?.showLabels || false,
      labelField: config?.labelField || 'voxelId',
      filterSystems: config?.filterSystems,
      filterStatuses: config?.filterStatuses,
    };

    // Get instanced data from decomposition service
    const instanceData = await this.decompositionService.getVisualizationData(
      projectId,
      fullConfig
    );

    // Convert to typed arrays for WebGL
    const positions = new Float32Array(instanceData.instanceCount * 3);
    const colors = new Float32Array(instanceData.instanceCount * 3);
    const scales = new Float32Array(instanceData.instanceCount * 3);
    const metadata = new Map<string, any>();

    // Calculate bounds
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    // This would typically iterate over actual instance data
    // For now, we use placeholder implementation
    for (let i = 0; i < instanceData.instanceCount; i++) {
      // Positions would be populated from instance matrices
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;

      // Colors from instance colors array
      colors[i * 3] = 0.5;
      colors[i * 3 + 1] = 0.5;
      colors[i * 3 + 2] = 0.5;

      // Scales from resolution
      scales[i * 3] = 1;
      scales[i * 3 + 1] = 1;
      scales[i * 3 + 2] = 1;
    }

    // Query actual voxels for accurate data
    const { voxels } = await this.queryVoxels({
      projectId,
      limit: instanceData.instanceCount,
    });

    for (let i = 0; i < voxels.length; i++) {
      const voxel = voxels[i];

      positions[i * 3] = voxel.center.x;
      positions[i * 3 + 1] = voxel.center.y;
      positions[i * 3 + 2] = voxel.center.z;

      // Update bounds
      minX = Math.min(minX, voxel.bounds.min.x);
      minY = Math.min(minY, voxel.bounds.min.y);
      minZ = Math.min(minZ, voxel.bounds.min.z);
      maxX = Math.max(maxX, voxel.bounds.max.x);
      maxY = Math.max(maxY, voxel.bounds.max.y);
      maxZ = Math.max(maxZ, voxel.bounds.max.z);

      scales[i * 3] = voxel.resolution;
      scales[i * 3 + 1] = voxel.resolution;
      scales[i * 3 + 2] = voxel.resolution;

      metadata.set(voxel.id, {
        voxelId: voxel.voxelId,
        status: voxel.status,
        system: voxel.system,
        level: voxel.level,
        decisionCount: voxel.decisionCount,
      });
    }

    return {
      instanceCount: instanceData.instanceCount,
      voxelIds: instanceData.voxelIds,
      positions,
      colors,
      scales,
      metadata,
      bounds: {
        min: { x: minX === Infinity ? 0 : minX, y: minY === Infinity ? 0 : minY, z: minZ === Infinity ? 0 : minZ },
        max: { x: maxX === -Infinity ? 0 : maxX, y: maxY === -Infinity ? 0 : maxY, z: maxZ === -Infinity ? 0 : maxZ },
      },
    };
  }

  // ===========================================================================
  // Activity Methods
  // ===========================================================================

  /**
   * Get recent activity for voxels in project
   */
  async getActivity(
    projectId: string,
    limit?: number,
    voxelIds?: string[]
  ): Promise<VoxelActivityItem[]> {
    if (this.config.enablePersistence) {
      return this.persistenceService.getVoxelActivity(projectId, limit);
    }
    // In-memory mode doesn't track activity, return empty
    return [];
  }

  // ===========================================================================
  // Coordination Session Methods
  // ===========================================================================

  /**
   * Create a coordination session for multi-user collaboration
   */
  createCoordinationSession(
    projectId: string,
    participants: string[]
  ): CoordinationSessionData {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const session: CoordinationSessionData = {
      sessionId,
      projectId,
      participants,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      recentUpdates: [],
    };

    this.activeSessions.set(sessionId, session);
    return session;
  }

  /**
   * Get coordination session by ID
   */
  getCoordinationSession(sessionId: string): CoordinationSessionData | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Subscribe to real-time updates for a project
   */
  subscribeToUpdates(
    projectId: string,
    callback: (update: VoxelRealtimeUpdate) => void
  ): () => void {
    if (!this.realtimeListeners.has(projectId)) {
      this.realtimeListeners.set(projectId, new Set());
    }

    this.realtimeListeners.get(projectId)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.realtimeListeners.get(projectId)?.delete(callback);
    };
  }

  /**
   * Broadcast update to all listeners for a project
   */
  private broadcastUpdate(projectId: string, update: VoxelRealtimeUpdate): void {
    const listeners = this.realtimeListeners.get(projectId);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(update);
        } catch (error) {
          console.error('[VoxelCoordination] Listener error:', error);
        }
      }
    }

    // Update active sessions
    for (const [, session] of this.activeSessions) {
      if (session.projectId === projectId) {
        session.recentUpdates.unshift(update);
        if (session.recentUpdates.length > 100) {
          session.recentUpdates.pop();
        }
      }
    }
  }

  // ===========================================================================
  // Navigation Methods
  // ===========================================================================

  /**
   * Navigate decision surface (spatial/causal/temporal traversal)
   */
  async navigateDecisionSurface(
    projectId: string,
    startVoxelId: string,
    traversalType: 'spatial' | 'causal' | 'temporal',
    depth?: number
  ): Promise<{
    startVoxel: VoxelData;
    relatedVoxels: VoxelData[];
    traversalType: string;
    depth: number;
  } | null> {
    const startVoxel = await this.getVoxel(startVoxelId);
    if (!startVoxel) {
      return null;
    }

    let relatedVoxels: VoxelData[] = [];

    switch (traversalType) {
      case 'spatial': {
        // Find spatially adjacent voxels
        const { voxels } = await this.queryVoxels({
          projectId,
          boundingBox: {
            min: {
              x: startVoxel.center.x - startVoxel.resolution * 2,
              y: startVoxel.center.y - startVoxel.resolution * 2,
              z: startVoxel.center.z - startVoxel.resolution * 2,
            },
            max: {
              x: startVoxel.center.x + startVoxel.resolution * 2,
              y: startVoxel.center.y + startVoxel.resolution * 2,
              z: startVoxel.center.z + startVoxel.resolution * 2,
            },
          },
          limit: depth || 26,
        });
        relatedVoxels = voxels.filter((v) => v.id !== startVoxelId);
        break;
      }
      case 'causal': {
        // Find voxels with same decisions
        if (startVoxel.decisionCount > 0) {
          const { voxels } = await this.queryVoxels({
            projectId,
            hasDecisions: true,
            limit: depth || 50,
          });
          relatedVoxels = voxels.filter((v) => v.id !== startVoxelId);
        }
        break;
      }
      case 'temporal': {
        // Find voxels on same level with sequential phases
        const { voxels } = await this.queryVoxels({
          projectId,
          levels: startVoxel.level ? [startVoxel.level] : undefined,
          limit: depth || 50,
        });
        relatedVoxels = voxels
          .filter((v) => v.id !== startVoxelId)
          .sort((a, b) => {
            const aStart = a.plannedStart?.getTime() || 0;
            const bStart = b.plannedStart?.getTime() || 0;
            return aStart - bStart;
          });
        break;
      }
    }

    return {
      startVoxel,
      relatedVoxels,
      traversalType,
      depth: depth || (traversalType === 'spatial' ? 26 : 50),
    };
  }

  // ===========================================================================
  // Decision Surface & Authority Cascade Integration
  // ===========================================================================

  /**
   * Route a decision through authority cascade and attach to voxel
   *
   * This is the primary method for attaching decisions to voxels with
   * proper authority routing. It:
   * 1. Calculates required authority based on impact
   * 2. Validates the requester has sufficient authority
   * 3. Attaches the decision to the voxel's decision surface
   * 4. Creates alerts for high-authority decisions
   * 5. Broadcasts real-time updates
   */
  async routeAndAttachDecision(
    voxelId: string,
    decisionRef: string,
    impact: DecisionImpact,
    attachedBy: 'SYSTEM' | 'USER' | 'AI',
    summary?: string
  ): Promise<VoxelDecisionRoutingResult> {
    if (!this.config.enableDecisionSurface) {
      throw new Error('Decision surface is not enabled');
    }

    // Route and attach via decision surface service
    const { attachment, routing } =
      this.decisionSurfaceService.routeAndAttachDecision(
        decisionRef,
        voxelId,
        impact,
        attachedBy,
        summary
      );

    // Check if alert was created (high authority decisions)
    let alertCreated = false;
    let alertId: string | undefined;
    if (routing.requiredLevelNumber >= 3) {
      const alerts = this.decisionSurfaceService.getActiveAlerts(voxelId, {
        onlyUnacknowledged: true,
      });
      const latestAlert = alerts.find(
        (a) => a.sourceDecisionRef === decisionRef
      );
      if (latestAlert) {
        alertCreated = true;
        alertId = latestAlert.id;
      }
    }

    // Also persist to database if enabled
    if (this.config.enablePersistence) {
      await this.persistenceService.attachDecision({
        voxelId,
        decisionId: decisionRef,
        attachmentType: 'LOCATION', // Map PRIMARY to LOCATION for persistence
        summary,
        attachedBy,
      });
    }

    // Broadcast update
    const voxel = await this.getVoxel(voxelId);
    if (voxel) {
      this.broadcastUpdate(voxel.projectId, {
        type: 'decision',
        voxelId,
        timestamp: new Date(),
        projectId: voxel.projectId,
        newValue: {
          decisionRef,
          routing: {
            requiredLevel: routing.requiredLevel,
            requiredTitle: routing.requiredTitle,
          },
          alertCreated,
        },
        source: attachedBy === 'USER' ? 'field' : 'system',
      });
    }

    return {
      voxelId,
      decisionRef,
      routing,
      attachment,
      alertCreated,
      alertId,
    };
  }

  /**
   * Calculate required authority for a voxel-based decision
   *
   * Uses voxel context (cost, schedule, system type) combined with
   * additional impact factors to determine authority requirements.
   */
  async calculateVoxelDecisionAuthority(
    voxelId: string,
    additionalImpact?: Partial<DecisionImpact>
  ): Promise<AuthorityRoutingResult | null> {
    if (!this.config.enableAuthorityRouting) {
      return null;
    }

    const voxel = await this.getVoxel(voxelId);
    if (!voxel) {
      return null;
    }

    return this.authorityCascadeService.calculateVoxelDecisionAuthority(
      voxel,
      additionalImpact || {}
    );
  }

  /**
   * Validate if a user can approve a decision on a voxel
   */
  async validateDecisionAuthority(
    voxelId: string,
    userLevel: AuthorityLevelEnum,
    impact: DecisionImpact
  ): Promise<AuthorityValidationResult | null> {
    if (!this.config.enableAuthorityRouting) {
      return null;
    }

    const routing = this.authorityCascadeService.calculateRequiredAuthority(impact);
    return this.authorityCascadeService.validateAuthority(
      userLevel,
      routing.requiredLevel
    );
  }

  /**
   * Route a full decision request with project/voxel context
   */
  async routeDecisionRequest(
    request: DecisionRoutingRequest
  ): Promise<DecisionRoutingResponse> {
    return this.authorityCascadeService.routeDecision(request);
  }

  // ===========================================================================
  // Tolerance Override Management
  // ===========================================================================

  /**
   * Create a tolerance override at a voxel
   *
   * Tolerance overrides allow deviations from standard construction
   * tolerances with proper approval chain.
   */
  createToleranceOverride(
    input: CreateToleranceOverrideInput
  ): ToleranceOverride {
    if (!this.config.enableDecisionSurface) {
      throw new Error('Decision surface is not enabled');
    }

    const override = this.decisionSurfaceService.createToleranceOverride(input);

    // Broadcast update
    this.broadcastUpdateForVoxel(input.voxelId, {
      type: 'progress',
      newValue: {
        toleranceOverrideCreated: override.id,
        toleranceType: override.toleranceType,
      },
    });

    return override;
  }

  /**
   * Check if a variance is within approved tolerance
   */
  checkToleranceCompliance(
    voxelId: string,
    toleranceType: ToleranceType,
    actualValue: number,
    trade?: string
  ): ToleranceCheckResult {
    if (!this.config.enableDecisionSurface) {
      return {
        voxelId,
        withinStandardTolerance: false,
        withinApprovedTolerance: false,
      };
    }

    // Get standard tolerance for type (per V3 schema tolerance types)
    const standardTolerances: Record<ToleranceType, number> = {
      WALL_FLATNESS: 6.35, // 1/4" in 10'
      CEILING_HEIGHT: 12.7, // 1/2"
      FLOOR_LEVEL: 6.35, // 1/4"
      PROTRUSION: 3.175, // 1/8"
      GAP: 3.175, // 1/8"
      ALIGNMENT: 3.175, // 1/8"
      FINISH_QUALITY: 1.5875, // 1/16"
      EQUIPMENT_CLEARANCE: 12.7, // 1/2"
      PIPE_SLOPE: 3.175, // 1/8" per foot
      DUCT_SIZE: 6.35, // 1/4"
    };

    const standardTolerance = standardTolerances[toleranceType] || 3.175;
    const withinStandardTolerance = Math.abs(actualValue) <= standardTolerance;

    // Check for approved override
    const { withinTolerance, override } =
      this.decisionSurfaceService.isWithinApprovedTolerance(
        voxelId,
        toleranceType,
        actualValue,
        trade
      );

    // If not within approved tolerance, calculate required authority
    let requiredAuthority: AuthorityRoutingResult | undefined;
    if (!withinTolerance && !withinStandardTolerance) {
      requiredAuthority = this.authorityCascadeService.calculateRequiredAuthority({
        budgetImpact: 0,
        scheduleImpactDays: 0,
        varianceAmountMM: Math.abs(actualValue),
        isSafetyRelated: false,
      });
    }

    return {
      voxelId,
      withinStandardTolerance,
      withinApprovedTolerance: withinTolerance,
      override,
      requiredAuthority,
    };
  }

  /**
   * Get tolerance overrides for a voxel
   */
  getToleranceOverrides(
    voxelId: string,
    options?: { toleranceType?: ToleranceType; trade?: string }
  ): ToleranceOverride[] {
    if (!this.config.enableDecisionSurface) {
      return [];
    }
    return this.decisionSurfaceService.getToleranceOverrides(voxelId, options);
  }

  // ===========================================================================
  // Pre-Approval Management
  // ===========================================================================

  /**
   * Create a pre-approval at a voxel
   *
   * Pre-approvals allow certain actions within scope without requiring
   * per-decision authority escalation.
   */
  createPreApproval(input: CreatePreApprovalInput): PreApproval {
    if (!this.config.enableDecisionSurface) {
      throw new Error('Decision surface is not enabled');
    }

    const preApproval = this.decisionSurfaceService.createPreApproval(input);

    // Broadcast update
    this.broadcastUpdateForVoxel(input.voxelId, {
      type: 'progress',
      newValue: {
        preApprovalCreated: preApproval.id,
        scope: preApproval.scope,
      },
    });

    return preApproval;
  }

  /**
   * Check if an action is covered by a pre-approval
   * Uses the string-based authority level for decision surface compatibility
   */
  checkPreApproval(
    voxelId: string,
    scope: string,
    trade: string,
    requiredLevel: AuthorityLevel // Uses the type alias from voxel-decomposition.types
  ): { covered: boolean; preApproval?: PreApproval } {
    if (!this.config.enableDecisionSurface) {
      return { covered: false };
    }
    return this.decisionSurfaceService.checkPreApproval(
      voxelId,
      scope,
      trade,
      requiredLevel
    );
  }

  /**
   * Get pre-approvals for a voxel
   */
  getPreApprovals(
    voxelId: string,
    options?: { trade?: string; authorityLevel?: AuthorityLevel }
  ): PreApproval[] {
    if (!this.config.enableDecisionSurface) {
      return [];
    }
    return this.decisionSurfaceService.getPreApprovals(voxelId, options);
  }

  // ===========================================================================
  // Alert Management
  // ===========================================================================

  /**
   * Create an alert at a voxel
   */
  createVoxelAlert(input: CreateAlertInput): VoxelAlert {
    if (!this.config.enableDecisionSurface) {
      throw new Error('Decision surface is not enabled');
    }

    const alert = this.decisionSurfaceService.createAlert(input);

    // Broadcast high-priority alerts immediately
    if (alert.priority === 'CRITICAL' || alert.priority === 'WARNING') {
      this.broadcastUpdateForVoxel(input.voxelId, {
        type: 'progress',
        newValue: {
          alertCreated: alert.id,
          priority: alert.priority,
          title: alert.title,
        },
      });
    }

    return alert;
  }

  /**
   * Get active alerts for a voxel
   */
  getVoxelAlerts(
    voxelId: string,
    options?: DecisionSurfaceQueryOptions
  ): VoxelAlert[] {
    if (!this.config.enableDecisionSurface) {
      return [];
    }
    return this.decisionSurfaceService.getActiveAlerts(voxelId, options);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeVoxelAlert(
    voxelId: string,
    alertId: string,
    workerRef: string
  ): boolean {
    if (!this.config.enableDecisionSurface) {
      return false;
    }

    const success = this.decisionSurfaceService.acknowledgeAlert(
      voxelId,
      alertId,
      workerRef
    );

    if (success) {
      this.broadcastUpdateForVoxel(voxelId, {
        type: 'progress',
        newValue: {
          alertAcknowledged: alertId,
          acknowledgedBy: workerRef,
        },
      });
    }

    return success;
  }

  /**
   * Dismiss an alert
   */
  dismissVoxelAlert(voxelId: string, alertId: string): boolean {
    if (!this.config.enableDecisionSurface) {
      return false;
    }
    return this.decisionSurfaceService.dismissAlert(voxelId, alertId);
  }

  // ===========================================================================
  // Worker Acknowledgment
  // ===========================================================================

  /**
   * Record a worker acknowledgment of a decision
   *
   * Used for field workers to confirm they've received and understood
   * a decision affecting their work area.
   */
  recordDecisionAcknowledgment(
    input: RecordAcknowledgmentInput
  ): DecisionAcknowledgment {
    if (!this.config.enableDecisionSurface) {
      throw new Error('Decision surface is not enabled');
    }

    const acknowledgment =
      this.decisionSurfaceService.recordAcknowledgment(input);

    // Broadcast update
    this.broadcastUpdateForVoxel(input.voxelId, {
      type: 'progress',
      newValue: {
        decisionAcknowledged: input.decisionRef,
        workerName: input.workerName,
        method: input.method,
      },
    });

    return acknowledgment;
  }

  /**
   * Get acknowledgments for a voxel
   */
  getDecisionAcknowledgments(
    voxelId: string,
    decisionRef?: string
  ): DecisionAcknowledgment[] {
    if (!this.config.enableDecisionSurface) {
      return [];
    }
    return this.decisionSurfaceService.getAcknowledgments(voxelId, decisionRef);
  }

  /**
   * Check if a worker has acknowledged a decision
   */
  hasWorkerAcknowledged(
    voxelId: string,
    decisionRef: string,
    workerRef: string
  ): boolean {
    if (!this.config.enableDecisionSurface) {
      return false;
    }
    return this.decisionSurfaceService.hasWorkerAcknowledged(
      voxelId,
      decisionRef,
      workerRef
    );
  }

  // ===========================================================================
  // Decision Surface Statistics
  // ===========================================================================

  /**
   * Get decision surface statistics for a voxel
   */
  getDecisionSurfaceStats(voxelId: string): DecisionSurfaceStats {
    if (!this.config.enableDecisionSurface) {
      return {
        totalDecisions: 0,
        unacknowledgedCount: 0,
        activeAlerts: 0,
        criticalAlerts: 0,
        toleranceOverrides: 0,
        preApprovals: 0,
        acknowledgmentRate: 1,
      };
    }
    return this.decisionSurfaceService.getStats(voxelId);
  }

  /**
   * Get project-wide decision surface summary
   */
  async getProjectDecisionSummary(
    projectId: string
  ): Promise<ProjectDecisionSummary> {
    if (!this.config.enableDecisionSurface) {
      return {
        projectId,
        totalVoxelsWithDecisions: 0,
        totalDecisions: 0,
        totalUnacknowledged: 0,
        totalAlerts: 0,
        criticalAlerts: 0,
        toleranceOverrides: 0,
        preApprovals: 0,
        decisionDensityHotspots: [],
      };
    }

    // Get all voxels with decision surfaces
    const voxelIds = this.decisionSurfaceService.getAllVoxelIdsWithSurfaces();
    const densityMap = this.decisionSurfaceService.getDecisionDensityMap();

    let totalDecisions = 0;
    let totalUnacknowledged = 0;
    let totalAlerts = 0;
    let criticalAlerts = 0;
    let toleranceOverrides = 0;
    let preApprovals = 0;

    const hotspots: Array<{
      voxelId: string;
      decisionCount: number;
      center: { x: number; y: number; z: number };
    }> = [];

    // Aggregate stats across all voxels
    for (const voxelId of voxelIds) {
      const stats = this.decisionSurfaceService.getStats(voxelId);
      totalDecisions += stats.totalDecisions;
      totalUnacknowledged += stats.unacknowledgedCount;
      totalAlerts += stats.activeAlerts;
      criticalAlerts += stats.criticalAlerts;
      toleranceOverrides += stats.toleranceOverrides;
      preApprovals += stats.preApprovals;

      // Track hotspots (voxels with > 3 decisions)
      if (stats.totalDecisions > 3) {
        const voxel = await this.getVoxel(voxelId);
        if (voxel && voxel.projectId === projectId) {
          hotspots.push({
            voxelId,
            decisionCount: stats.totalDecisions,
            center: voxel.center,
          });
        }
      }
    }

    // Sort hotspots by decision count
    hotspots.sort((a, b) => b.decisionCount - a.decisionCount);

    return {
      projectId,
      totalVoxelsWithDecisions: voxelIds.length,
      totalDecisions,
      totalUnacknowledged,
      totalAlerts,
      criticalAlerts,
      toleranceOverrides,
      preApprovals,
      decisionDensityHotspots: hotspots.slice(0, 20), // Top 20
    };
  }

  /**
   * Find voxels with critical issues (unacknowledged or critical alerts)
   */
  findCriticalVoxels(): {
    unacknowledged: string[];
    criticalAlerts: string[];
  } {
    if (!this.config.enableDecisionSurface) {
      return { unacknowledged: [], criticalAlerts: [] };
    }

    return {
      unacknowledged:
        this.decisionSurfaceService.findVoxelsWithUnacknowledgedDecisions(),
      criticalAlerts:
        this.decisionSurfaceService.findVoxelsWithCriticalAlerts(),
    };
  }

  /**
   * Get decision density heat map for visualization
   */
  getDecisionDensityMap(): Map<string, number> {
    if (!this.config.enableDecisionSurface) {
      return new Map();
    }
    return this.decisionSurfaceService.getDecisionDensityMap();
  }

  // ===========================================================================
  // V3 Schema Compliance
  // ===========================================================================

  /**
   * Get voxel with full V3 schema decision surface
   */
  async getVoxelV3(voxelId: string): Promise<VoxelDataV3 | null> {
    const voxel = await this.getVoxel(voxelId);
    if (!voxel) {
      return null;
    }

    if (!this.config.enableDecisionSurface) {
      // Return basic V3 structure
      return {
        ...voxel,
        $schema: 'https://luhtech.dev/schemas/pm/voxel.schema.json',
        schemaVersion: '3.0.0',
        graphMetadata: voxel.graphMetadata || { inEdges: [], outEdges: [] },
      };
    }

    // Apply full decision surface
    return this.decisionSurfaceService.applyDecisionSurfaceToVoxel(voxel);
  }

  /**
   * Export decision surface for persistence
   */
  exportVoxelDecisionSurface(voxelId: string): DecisionSurface | null {
    if (!this.config.enableDecisionSurface) {
      return null;
    }
    return this.decisionSurfaceService.exportDecisionSurface(voxelId);
  }

  /**
   * Import decision surface from persistence
   */
  importVoxelDecisionSurface(
    voxelId: string,
    surface: DecisionSurface
  ): void {
    if (!this.config.enableDecisionSurface) {
      return;
    }
    this.decisionSurfaceService.importDecisionSurface(voxelId, surface);
  }

  // ===========================================================================
  // Authority Tier Information
  // ===========================================================================

  /**
   * Get authority tier information
   */
  getAuthorityTier(level: number) {
    return this.authorityCascadeService.getTier(level);
  }

  /**
   * Get authority tier by name
   */
  getAuthorityTierByName(name: AuthorityLevelEnum) {
    return this.authorityCascadeService.getTierByName(name);
  }

  /**
   * Get all authority tiers
   */
  getAllAuthorityTiers() {
    return this.authorityCascadeService.getAllTiers();
  }

  /**
   * Get next escalation target
   */
  getEscalationTarget(currentLevel: AuthorityLevelEnum) {
    return this.authorityCascadeService.getEscalationTarget(currentLevel);
  }

  /**
   * Get system-specific authority requirements
   */
  getSystemAuthorityRequirements(system: VoxelSystem) {
    return this.authorityCascadeService.getSystemAuthorityRequirements(system);
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Broadcast update helper for voxel-specific updates
   */
  private async broadcastUpdateForVoxel(
    voxelId: string,
    partialUpdate: Partial<VoxelRealtimeUpdate>
  ): Promise<void> {
    const voxel = await this.getVoxel(voxelId);
    if (voxel) {
      this.broadcastUpdate(voxel.projectId, {
        type: 'progress',
        voxelId,
        timestamp: new Date(),
        projectId: voxel.projectId,
        source: 'system',
        ...partialUpdate,
      } as VoxelRealtimeUpdate);
    }
  }

  // ===========================================================================
  // Cleanup Methods
  // ===========================================================================

  /**
   * Delete all voxels for a project
   */
  async deleteProjectVoxels(projectId: string): Promise<number> {
    if (this.config.enablePersistence) {
      return this.persistenceService.deleteProjectVoxels(projectId);
    }
    return 0;
  }

  /**
   * Sync in-memory voxels to database
   */
  async syncToDatabase(projectId: string): Promise<VoxelPersistenceResult | null> {
    if (!this.config.enablePersistence) {
      return null;
    }

    const { voxels } = await this.decompositionService.queryVoxels({
      projectId,
      limit: 100000,
    });

    return this.persistenceService.persistVoxels(projectId, voxels);
  }

  /**
   * Load voxels from database to memory
   */
  async loadFromDatabase(projectId: string): Promise<number> {
    const voxels = await this.persistenceService.loadProjectVoxels(projectId);
    // Load into decomposition service memory (would need to implement)
    return voxels.length;
  }

  // ===========================================================================
  // Service Accessors
  // ===========================================================================

  /**
   * Get underlying decomposition service for direct access
   */
  getDecompositionService(): VoxelDecompositionService {
    return this.decompositionService;
  }

  /**
   * Get underlying persistence service for direct access
   */
  getPersistenceService(): VoxelPersistenceService {
    return this.persistenceService;
  }

  /**
   * Get underlying Speckle integration service for direct access
   */
  getSpeckleService(): SpeckleVoxelIntegrationService {
    return this.speckleService;
  }

  /**
   * Get underlying decision surface service for direct access
   */
  getDecisionSurfaceService(): DecisionSurfaceService {
    return this.decisionSurfaceService;
  }

  /**
   * Get underlying authority cascade service for direct access
   */
  getAuthorityCascadeService(): DecisionAuthorityCascadeService {
    return this.authorityCascadeService;
  }
}

// ==============================================================================
// Factory Function
// ==============================================================================

/**
 * Create voxel coordination service
 */
export function createVoxelCoordinationService(
  prisma: PrismaClient,
  config?: Partial<VoxelCoordinationConfig>
): VoxelCoordinationService {
  return new VoxelCoordinationService(prisma, config);
}

export default VoxelCoordinationService;
