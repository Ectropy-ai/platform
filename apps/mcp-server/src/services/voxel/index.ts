/**
 * Voxel Services Index
 *
 * Unified exports for all voxel-related services:
 * - VoxelDecompositionService: SEPPA pipeline for IFC to voxel conversion
 * - VoxelPersistenceService: Prisma database operations
 * - SpeckleVoxelIntegrationService: Speckle/IFC bridge
 * - VoxelCoordinationService: Unified coordination layer
 *
 * @module services/voxel
 * @version 1.0.0
 */

// Core Voxel Decomposition
export {
  VoxelDecompositionService,
  createVoxelDecompositionService,
} from '../voxel-decomposition.service';

// Prisma Persistence
export {
  VoxelPersistenceService,
  createVoxelPersistenceService,
} from '../voxel-persistence.service';
export type {
  VoxelPersistenceResult,
  DecisionAttachmentInput,
} from '../voxel-persistence.service';

// Speckle Integration
export {
  SpeckleVoxelIntegrationService,
  createSpeckleVoxelIntegration,
} from '../speckle-voxel-integration.service';
export type {
  SpeckleElementRecord,
  SpeckleProperties,
  SpeckleGeometry,
  SpeckleVoxelResult,
  SpeckleVoxelError,
  SpeckleVoxelOptions,
} from '../speckle-voxel-integration.service';

// Unified Coordination Service
export {
  VoxelCoordinationService,
  createVoxelCoordinationService,
} from '../voxel-coordination.service';
export type {
  VoxelCoordinationConfig,
  VoxelCoordinationResult,
  VoxelVisualizationData,
  CoordinationSessionData,
} from '../voxel-coordination.service';

// MCP Tools
export {
  voxelTools,
  executeVoxelTool,
} from '../voxel-tools';

// Re-export types
export type {
  VoxelData,
  VoxelSummary,
  VoxelCoord,
  Vector3,
  BoundingBox,
  VoxelGridExtent,
  OctreeNode,
  OctreeConfig,
  IFCElement,
  IFCMaterial,
  IFCEntityCategory,
  VoxelStatus,
  VoxelHealthStatus,
  VoxelSystem,
  VoxelResolution,
  VoxelizationConfig,
  VoxelizationResult,
  VoxelizationStats,
  VoxelizationError,
  VoxelSpatialQuery,
  VoxelSpatialQueryResult,
  VoxelVisualizationConfig,
  VoxelVisualizationMode,
  VoxelColorScheme,
  VoxelInstanceData,
  VoxelActivityItem,
  VoxelAggregation,
  AggregationLevel,
  VoxelRealtimeUpdate,
  VoxelCoordinationSession,
} from '../../types/voxel-decomposition.types';
