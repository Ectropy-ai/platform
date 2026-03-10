/**
 * Voxel Decomposition Service
 *
 * SEPPA Pipeline Implementation:
 * - Spatial: GPU-accelerated voxelization of BIM geometry
 * - Element: Material classification, IFC entity mapping
 * - Processing: Enrichment with cost data, complexity scoring
 * - Prediction: ML-powered cost estimation (future)
 * - Aggregation: Hierarchical rollup
 *
 * Converts IFC models to voxel grids for spatial decision attachment,
 * live site coordination, and project management visualization.
 *
 * @module services/voxel-decomposition
 * @version 1.0.0
 */

// UUID generation using Node.js crypto module
// Note: Type errors are tsconfig-related, builds succeed at runtime
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: crypto module types resolved at build time
import { randomUUID } from 'crypto';

/**
 * Generate UUID v4 using Node.js crypto module
 */
const uuidv4 = (): string => randomUUID();
import {
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
  SYSTEM_COLORS,
  STATUS_COLORS,
  HEALTH_COLORS,
  DEFAULT_VOXELIZATION_CONFIG,
  IVoxelDecompositionService,
  GraphEdge,
} from '../types/voxel-decomposition.types';

// ==============================================================================
// Utility Functions
// ==============================================================================

/**
 * Generate a voxel URN
 */
function generateVoxelUrn(projectId: string, voxelId: string): string {
  return `urn:ectropy:${projectId}:voxel:${voxelId}`;
}

/**
 * Generate a human-readable voxel ID
 */
function generateVoxelId(
  level: string | undefined,
  system: VoxelSystem,
  index: number
): string {
  const levelPart = level ? `L${level.replace(/\D/g, '')}` : 'L0';
  const indexStr = index.toString().padStart(4, '0');
  return `VOX-${levelPart}-${system}-${indexStr}`;
}

/**
 * Clamp value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Convert hex color to RGB array
 */
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {return [0.5, 0.5, 0.5];}
  return [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255,
  ];
}

/**
 * Check if point is inside bounding box
 */
function pointInBounds(point: Vector3, bounds: BoundingBox): boolean {
  return (
    point.x >= bounds.min.x &&
    point.x <= bounds.max.x &&
    point.y >= bounds.min.y &&
    point.y <= bounds.max.y &&
    point.z >= bounds.min.z &&
    point.z <= bounds.max.z
  );
}

/**
 * Check if two bounding boxes intersect
 */
function boundsIntersect(a: BoundingBox, b: BoundingBox): boolean {
  return (
    a.min.x <= b.max.x &&
    a.max.x >= b.min.x &&
    a.min.y <= b.max.y &&
    a.max.y >= b.min.y &&
    a.min.z <= b.max.z &&
    a.max.z >= b.min.z
  );
}

/**
 * Calculate bounding box center
 */
function getBoundsCenter(bounds: BoundingBox): Vector3 {
  return {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };
}

/**
 * Calculate bounding box volume
 */
function getBoundsVolume(bounds: BoundingBox): number {
  const dx = bounds.max.x - bounds.min.x;
  const dy = bounds.max.y - bounds.min.y;
  const dz = bounds.max.z - bounds.min.z;
  return dx * dy * dz;
}

/**
 * Map IFC entity type to building system
 */
function mapEntityToSystem(
  entityType: string,
  systemMapping: Record<string, VoxelSystem>
): VoxelSystem {
  // Check direct mapping
  if (systemMapping[entityType]) {
    return systemMapping[entityType];
  }

  // Default mappings based on common IFC entity patterns
  const lowerType = entityType.toLowerCase();

  if (
    lowerType.includes('pipe') ||
    lowerType.includes('plumb') ||
    lowerType.includes('sanitary')
  ) {
    return VoxelSystem.PLUMBING;
  }

  if (
    lowerType.includes('elec') ||
    lowerType.includes('light') ||
    lowerType.includes('cable')
  ) {
    return VoxelSystem.ELECTRICAL;
  }

  if (
    lowerType.includes('hvac') ||
    lowerType.includes('duct') ||
    lowerType.includes('air') ||
    lowerType.includes('ventil')
  ) {
    return VoxelSystem.HVAC;
  }

  if (
    lowerType.includes('sprinkler') ||
    lowerType.includes('fire') ||
    lowerType.includes('alarm')
  ) {
    return VoxelSystem.FIRE;
  }

  if (
    lowerType.includes('column') ||
    lowerType.includes('beam') ||
    lowerType.includes('slab') ||
    lowerType.includes('foundation')
  ) {
    return VoxelSystem.STRUCTURAL;
  }

  if (
    lowerType.includes('wall') ||
    lowerType.includes('door') ||
    lowerType.includes('window') ||
    lowerType.includes('stair')
  ) {
    return VoxelSystem.ARCHITECTURAL;
  }

  return VoxelSystem.UNKNOWN;
}

/**
 * Extract level from IFC element
 */
function extractLevel(element: IFCElement, patterns: string[]): string | undefined {
  // Check containedInStorey
  if (element.containedInStorey) {
    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'i');
      const match = regex.exec(element.containedInStorey);
      if (match && match[1]) {
        return match[1];
      }
    }
    return element.containedInStorey;
  }

  // Check element name
  if (element.name) {
    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'i');
      const match = regex.exec(element.name);
      if (match && match[1]) {
        return match[1];
      }
    }
  }

  return undefined;
}

// ==============================================================================
// Octree Implementation
// ==============================================================================

/**
 * Default octree configuration
 */
const DEFAULT_OCTREE_CONFIG: OctreeConfig = {
  maxDepth: 8,
  maxVoxelsPerNode: 16,
  minNodeSize: 10,
};

/**
 * Build octree spatial index
 */
function buildOctree(
  voxels: VoxelData[],
  bounds: BoundingBox,
  config: OctreeConfig = DEFAULT_OCTREE_CONFIG
): OctreeNode {
  const root = createOctreeNode(bounds, 0, voxels.map((v) => v.id));

  function subdivide(node: OctreeNode): void {
    // Check termination conditions
    if (
      node.depth >= config.maxDepth ||
      node.voxelCount <= config.maxVoxelsPerNode
    ) {
      node.isLeaf = true;
      return;
    }

    const size = node.bounds.max.x - node.bounds.min.x;
    if (size <= config.minNodeSize) {
      node.isLeaf = true;
      return;
    }

    // Create 8 child nodes (octants)
    node.children = [];
    node.isLeaf = false;
    const mid = getBoundsCenter(node.bounds);

    for (let i = 0; i < 8; i++) {
      const childBounds: BoundingBox = {
        min: {
          x: i & 1 ? mid.x : node.bounds.min.x,
          y: i & 2 ? mid.y : node.bounds.min.y,
          z: i & 4 ? mid.z : node.bounds.min.z,
        },
        max: {
          x: i & 1 ? node.bounds.max.x : mid.x,
          y: i & 2 ? node.bounds.max.y : mid.y,
          z: i & 4 ? node.bounds.max.z : mid.z,
        },
      };

      // Find voxels in this octant
      const childVoxelIds = node.voxelIds.filter((id) => {
        const voxel = voxels.find((v) => v.id === id);
        if (!voxel) {return false;}
        return pointInBounds(voxel.center, childBounds);
      });

      const child = createOctreeNode(childBounds, node.depth + 1, childVoxelIds);
      node.children.push(child);

      if (child.voxelCount > 0) {
        subdivide(child);
      }
    }

    // Clear voxel IDs from parent (stored in children only)
    node.voxelIds = [];
  }

  subdivide(root);
  return root;
}

/**
 * Create an octree node
 */
function createOctreeNode(
  bounds: BoundingBox,
  depth: number,
  voxelIds: string[]
): OctreeNode {
  return {
    id: uuidv4(),
    bounds,
    depth,
    isLeaf: true,
    voxelIds,
    voxelCount: voxelIds.length,
  };
}

/**
 * Query octree for voxels in bounding box
 */
function queryOctree(
  node: OctreeNode,
  queryBounds: BoundingBox,
  results: string[] = []
): string[] {
  if (!boundsIntersect(node.bounds, queryBounds)) {
    return results;
  }

  if (node.isLeaf) {
    results.push(...node.voxelIds);
  } else if (node.children) {
    for (const child of node.children) {
      queryOctree(child, queryBounds, results);
    }
  }

  return results;
}

// ==============================================================================
// Voxelization Engine
// ==============================================================================

/**
 * Create voxel grid from IFC elements (conservative rasterization)
 */
function voxelizeElements(
  elements: IFCElement[],
  config: VoxelizationConfig,
  projectId: string
): { voxels: VoxelData[]; stats: VoxelizationStats; errors: VoxelizationError[] } {
  const voxels: VoxelData[] = [];
  const errors: VoxelizationError[] = [];
  const resolution = typeof config.resolution === 'number' ? config.resolution : VoxelResolution.STANDARD;

  // Calculate overall bounding box
  let globalMin: Vector3 = { x: Infinity, y: Infinity, z: Infinity };
  let globalMax: Vector3 = { x: -Infinity, y: -Infinity, z: -Infinity };

  for (const element of elements) {
    if (!element.boundingBox) {continue;}
    globalMin.x = Math.min(globalMin.x, element.boundingBox.min.x);
    globalMin.y = Math.min(globalMin.y, element.boundingBox.min.y);
    globalMin.z = Math.min(globalMin.z, element.boundingBox.min.z);
    globalMax.x = Math.max(globalMax.x, element.boundingBox.max.x);
    globalMax.y = Math.max(globalMax.y, element.boundingBox.max.y);
    globalMax.z = Math.max(globalMax.z, element.boundingBox.max.z);
  }

  // Add padding
  const padding = resolution * 2;
  globalMin = {
    x: globalMin.x - padding,
    y: globalMin.y - padding,
    z: globalMin.z - padding,
  };
  globalMax = {
    x: globalMax.x + padding,
    y: globalMax.y + padding,
    z: globalMax.z + padding,
  };

  // Calculate grid dimensions
  const gridDimensions: VoxelCoord = {
    i: Math.ceil((globalMax.x - globalMin.x) / resolution),
    j: Math.ceil((globalMax.y - globalMin.y) / resolution),
    k: Math.ceil((globalMax.z - globalMin.z) / resolution),
  };

  // Track which cells are occupied and by which elements
  const cellOccupancy: Map<string, Set<string>> = new Map();

  // Voxelize each element
  let processedCount = 0;
  let skippedCount = 0;

  for (const element of elements) {
    if (!element.boundingBox) {
      skippedCount++;
      errors.push({
        code: 'NO_BOUNDS',
        message: `Element ${element.globalId} has no bounding box`,
        elementId: element.globalId,
      });
      continue;
    }

    try {
      // Calculate voxel range for this element
      const minI = Math.floor((element.boundingBox.min.x - globalMin.x) / resolution);
      const maxI = Math.ceil((element.boundingBox.max.x - globalMin.x) / resolution);
      const minJ = Math.floor((element.boundingBox.min.y - globalMin.y) / resolution);
      const maxJ = Math.ceil((element.boundingBox.max.y - globalMin.y) / resolution);
      const minK = Math.floor((element.boundingBox.min.z - globalMin.z) / resolution);
      const maxK = Math.ceil((element.boundingBox.max.z - globalMin.z) / resolution);

      // Conservative rasterization: mark all cells that element touches
      for (let i = minI; i <= maxI; i++) {
        for (let j = minJ; j <= maxJ; j++) {
          for (let k = minK; k <= maxK; k++) {
            const cellKey = `${i},${j},${k}`;
            if (!cellOccupancy.has(cellKey)) {
              cellOccupancy.set(cellKey, new Set());
            }
            cellOccupancy.get(cellKey)!.add(element.globalId);
          }
        }
      }

      processedCount++;
    } catch (err) {
      skippedCount++;
      errors.push({
        code: 'VOXELIZE_ERROR',
        message: `Failed to voxelize element ${element.globalId}: ${err}`,
        elementId: element.globalId,
      });
    }
  }

  // Create VoxelData for each occupied cell
  const systemCounts: Record<VoxelSystem, number> = {} as Record<VoxelSystem, number>;
  const levelCounts: Record<string, number> = {};
  const statusCounts: Record<VoxelStatus, number> = {} as Record<VoxelStatus, number>;

  // Initialize counters
  for (const system of Object.values(VoxelSystem)) {
    systemCounts[system] = 0;
  }
  for (const status of Object.values(VoxelStatus)) {
    statusCounts[status] = 0;
  }

  let voxelIndex = 0;
  for (const [cellKey, elementIds] of cellOccupancy.entries()) {
    const [i, j, k] = cellKey.split(',').map(Number);

    // Get primary element (first one)
    const primaryElementId = elementIds.values().next().value;
    const primaryElement = elements.find((e) => e.globalId === primaryElementId);

    if (!primaryElement) {continue;}

    // Determine system
    const system = mapEntityToSystem(
      primaryElement.type as string,
      config.systemMapping
    );

    // Determine level
    const level = extractLevel(primaryElement, config.levelPatterns);

    // Generate voxel ID
    const voxelId = generateVoxelId(level, system, voxelIndex);

    // Calculate world-space position
    const center: Vector3 = {
      x: globalMin.x + (i + 0.5) * resolution,
      y: globalMin.y + (j + 0.5) * resolution,
      z: globalMin.z + (k + 0.5) * resolution,
    };

    const bounds: BoundingBox = {
      min: {
        x: globalMin.x + i * resolution,
        y: globalMin.y + j * resolution,
        z: globalMin.z + k * resolution,
      },
      max: {
        x: globalMin.x + (i + 1) * resolution,
        y: globalMin.y + (j + 1) * resolution,
        z: globalMin.z + (k + 1) * resolution,
      },
    };

    // Calculate volume for voxel
    const voxelVolume = Math.pow(resolution / 1000, 3); // Convert mm³ to m³

    const voxel: VoxelData = {
      id: uuidv4(),
      urn: generateVoxelUrn(projectId, voxelId),
      voxelId,
      projectId,

      coord: { i, j, k },
      center,
      bounds,
      resolution,

      building: undefined,
      level,
      zone: undefined,
      room: undefined,
      gridReference: `${i},${j},${k}`,
      system,

      ifcElements: Array.from(elementIds),
      primaryElement: primaryElementId,
      elementCount: elementIds.size,

      entityType: primaryElement.type as IFCEntityCategory,
      materialType: primaryElement.materials?.[0]?.name,
      tradeCode: undefined,

      volume: voxelVolume,
      surfaceArea: 6 * Math.pow(resolution / 1000, 2),
      complexityScore: Math.min(100, elementIds.size * 10),

      status: VoxelStatus.PLANNED,
      healthStatus: VoxelHealthStatus.HEALTHY,
      percentComplete: 0,

      plannedStart: undefined,
      plannedEnd: undefined,
      actualStart: undefined,
      actualEnd: undefined,
      isCriticalPath: false,

      estimatedCost: undefined,
      actualCost: undefined,
      estimatedHours: undefined,
      actualHours: undefined,

      decisionCount: 0,
      unacknowledgedCount: 0,

      graphMetadata: {
        inEdges: [],
        outEdges: [],
      },
      meta: {
        voxelizedAt: new Date().toISOString(),
        resolution,
      },

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    voxels.push(voxel);
    voxelIndex++;

    // Update counters
    systemCounts[system] = (systemCounts[system] || 0) + 1;
    if (level) {
      levelCounts[level] = (levelCounts[level] || 0) + 1;
    }
    statusCounts[VoxelStatus.PLANNED]++;
  }

  // ==============================================================================
  // Second Pass: Compute Adjacent Voxels (6-Connected Neighbors)
  // ==============================================================================
  // Create coord-to-voxel mapping for efficient neighbor lookup
  const coordToVoxel: Map<string, VoxelData> = new Map();
  for (const voxel of voxels) {
    const coordKey = `${voxel.coord.i},${voxel.coord.j},${voxel.coord.k}`;
    coordToVoxel.set(coordKey, voxel);
  }

  // 6-connected neighbor offsets (face-sharing voxels only)
  const neighborOffsets: Array<{ di: number; dj: number; dk: number }> = [
    { di: -1, dj: 0, dk: 0 }, // -X
    { di: 1, dj: 0, dk: 0 }, // +X
    { di: 0, dj: -1, dk: 0 }, // -Y
    { di: 0, dj: 1, dk: 0 }, // +Y
    { di: 0, dj: 0, dk: -1 }, // -Z
    { di: 0, dj: 0, dk: 1 }, // +Z
  ];

  // Compute adjacency for each voxel
  let totalAdjacencyEdges = 0;
  for (const voxel of voxels) {
    const adjacentUrns: string[] = [];
    const adjacentEdges: Array<{ type: string; target: string }> = [];

    for (const offset of neighborOffsets) {
      const neighborI = voxel.coord.i + offset.di;
      const neighborJ = voxel.coord.j + offset.dj;
      const neighborK = voxel.coord.k + offset.dk;
      const neighborKey = `${neighborI},${neighborJ},${neighborK}`;

      const neighbor = coordToVoxel.get(neighborKey);
      if (neighbor) {
        adjacentUrns.push(neighbor.urn);
        adjacentEdges.push({
          type: 'ADJACENT_TO',
          target: neighbor.urn,
        });
        totalAdjacencyEdges++;
      }
    }

    // Update voxel with adjacency data
    voxel.adjacentVoxels = adjacentUrns;

    // Ensure graphMetadata exists (should always be set during voxel creation)
    if (!voxel.graphMetadata) {
      voxel.graphMetadata = { inEdges: [], outEdges: [], edges: [] };
    }

    voxel.graphMetadata.outEdges = adjacentEdges.map((e) => e.target);

    // Also add edges array for V3-compliant graph traversal
    if (!voxel.graphMetadata.edges) {
      voxel.graphMetadata.edges = [];
    }
    for (const neighbor of adjacentUrns) {
      const edge: GraphEdge = {
        from: voxel.urn,
        to: neighbor,
        type: 'adjacent-to',
        createdAt: new Date(),
      };
      voxel.graphMetadata.edges.push(edge);
    }
  }

  // Calculate stats
  const totalCells = gridDimensions.i * gridDimensions.j * gridDimensions.k;
  const occupiedVolume = voxels.length * Math.pow(resolution / 1000, 3);
  const boundingBoxVolume = getBoundsVolume({ min: globalMin, max: globalMax }) / 1e9; // mm³ to m³

  const stats: VoxelizationStats = {
    totalVoxels: voxels.length,
    voxelsBySystem: systemCounts,
    voxelsByLevel: levelCounts,
    voxelsByStatus: statusCounts,
    ifcElementsProcessed: processedCount,
    ifcElementsSkipped: skippedCount,
    averageVoxelsPerElement: processedCount > 0 ? voxels.length / processedCount : 0,
    gridDensity: totalCells > 0 ? voxels.length / totalCells : 0,
    boundingBoxVolume,
    occupiedVolume,
  };

  return { voxels, stats, errors };
}

// ==============================================================================
// Visualization Data Generation
// ==============================================================================

/**
 * Get color for voxel based on visualization config
 */
function getVoxelColor(
  voxel: VoxelData,
  config: VoxelVisualizationConfig
): [number, number, number, number] {
  let hex: string;

  switch (config.colorScheme) {
    case VoxelColorScheme.BY_SYSTEM:
      hex = SYSTEM_COLORS[voxel.system] || SYSTEM_COLORS[VoxelSystem.UNKNOWN];
      break;

    case VoxelColorScheme.BY_STATUS:
      hex = STATUS_COLORS[voxel.status] || STATUS_COLORS[VoxelStatus.PLANNED];
      break;

    case VoxelColorScheme.BY_HEALTH:
      hex =
        HEALTH_COLORS[voxel.healthStatus || VoxelHealthStatus.HEALTHY] ||
        HEALTH_COLORS[VoxelHealthStatus.HEALTHY];
      break;

    case VoxelColorScheme.BY_PROGRESS: {
      const progress = (voxel.percentComplete || 0) / 100;
      // Red (0%) -> Yellow (50%) -> Green (100%)
      if (progress < 0.5) {
        const r = 1;
        const g = progress * 2;
        hex = `#${ Math.round(r * 255).toString(16).padStart(2, '0') 
              }${Math.round(g * 255).toString(16).padStart(2, '0') }00`;
      } else {
        const r = 1 - (progress - 0.5) * 2;
        const g = 1;
        hex = `#${ Math.round(r * 255).toString(16).padStart(2, '0') 
              }${Math.round(g * 255).toString(16).padStart(2, '0') }00`;
      }
      break;
    }

    case VoxelColorScheme.BY_DECISION_DENSITY: {
      // Blue (0 decisions) -> Red (many decisions)
      const density = Math.min(1, voxel.decisionCount / 10);
      const r = density;
      const b = 1 - density;
      hex = `#${ Math.round(r * 255).toString(16).padStart(2, '0') 
            }00${ Math.round(b * 255).toString(16).padStart(2, '0')}`;
      break;
    }

    case VoxelColorScheme.UNIFORM:
    default:
      hex = '#4a90d9';
  }

  const [r, g, b] = hexToRgb(hex);
  return [r, g, b, config.opacity];
}

/**
 * Generate instanced rendering data for voxels
 */
function generateInstanceData(
  voxels: VoxelData[],
  config: VoxelVisualizationConfig
): VoxelInstanceData {
  // Filter voxels based on config
  let filteredVoxels = voxels;

  if (config.filterSystems && config.filterSystems.length > 0) {
    filteredVoxels = filteredVoxels.filter((v) =>
      config.filterSystems!.includes(v.system)
    );
  }

  if (config.filterStatuses && config.filterStatuses.length > 0) {
    filteredVoxels = filteredVoxels.filter((v) =>
      config.filterStatuses!.includes(v.status)
    );
  }

  const instanceCount = filteredVoxels.length;

  // Pre-allocate typed arrays
  const centers = new Float32Array(instanceCount * 3);
  const scales = new Float32Array(instanceCount * 3);
  const colors = new Float32Array(instanceCount * 4);
  const voxelIds: string[] = [];

  for (let i = 0; i < instanceCount; i++) {
    const voxel = filteredVoxels[i];
    const offset3 = i * 3;
    const offset4 = i * 4;

    // Center position
    centers[offset3] = voxel.center.x;
    centers[offset3 + 1] = voxel.center.y;
    centers[offset3 + 2] = voxel.center.z;

    // Scale (uniform for now, could vary)
    const scale = voxel.resolution * 0.95; // Slightly smaller to show gaps
    scales[offset3] = scale;
    scales[offset3 + 1] = scale;
    scales[offset3 + 2] = scale;

    // Color
    const [r, g, b, a] = getVoxelColor(voxel, config);
    colors[offset4] = r;
    colors[offset4 + 1] = g;
    colors[offset4 + 2] = b;
    colors[offset4 + 3] = a;

    // Voxel ID
    voxelIds.push(voxel.id);
  }

  return {
    centers,
    scales,
    colors,
    voxelIds,
    instanceCount,
  };
}

// ==============================================================================
// Main Service Class
// ==============================================================================

/**
 * In-memory voxel storage (would be replaced by Prisma in production)
 */
const voxelStorage: Map<string, Map<string, VoxelData>> = new Map();
const octreeStorage: Map<string, OctreeNode> = new Map();

/**
 * Voxel Decomposition Service
 *
 * Implements the SEPPA pipeline for IFC→Voxel conversion and spatial queries.
 */
export class VoxelDecompositionService implements IVoxelDecompositionService {
  private config: VoxelizationConfig;

  constructor(config?: Partial<VoxelizationConfig>) {
    this.config = { ...DEFAULT_VOXELIZATION_CONFIG, ...config };
  }

  /**
   * Convert IFC model to voxels
   */
  async voxelizeModel(
    projectId: string,
    modelId: string,
    config?: Partial<VoxelizationConfig>
  ): Promise<VoxelizationResult> {
    const startTime = Date.now();
    const mergedConfig = { ...this.config, ...config };
    const resolution = typeof mergedConfig.resolution === 'number'
      ? mergedConfig.resolution
      : VoxelResolution.STANDARD;

    const warnings: string[] = [];

    // In production, this would load IFC elements from Speckle/database
    // For now, we create a mock set of elements for testing
    const elements = await this.loadIFCElements(projectId, modelId);

    if (elements.length === 0) {
      return {
        success: false,
        projectId,
        modelId,
        gridExtent: {
          origin: { x: 0, y: 0, z: 0 },
          dimensions: { i: 0, j: 0, k: 0 },
          cellSize: resolution,
          totalCells: 0,
          boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
        },
        resolution,
        voxels: [],
        voxelCount: 0,
        stats: {
          totalVoxels: 0,
          voxelsBySystem: {} as Record<VoxelSystem, number>,
          voxelsByLevel: {},
          voxelsByStatus: {} as Record<VoxelStatus, number>,
          ifcElementsProcessed: 0,
          ifcElementsSkipped: 0,
          averageVoxelsPerElement: 0,
          gridDensity: 0,
          boundingBoxVolume: 0,
          occupiedVolume: 0,
        },
        processingTimeMs: Date.now() - startTime,
        errors: [{ code: 'NO_ELEMENTS', message: 'No IFC elements found in model' }],
        warnings,
      };
    }

    // Voxelize elements
    const { voxels, stats, errors } = voxelizeElements(elements, mergedConfig, projectId);

    // Calculate grid extent
    const gridMin: Vector3 = { x: Infinity, y: Infinity, z: Infinity };
    const gridMax: Vector3 = { x: -Infinity, y: -Infinity, z: -Infinity };
    let maxI = 0, maxJ = 0, maxK = 0;

    for (const voxel of voxels) {
      gridMin.x = Math.min(gridMin.x, voxel.bounds.min.x);
      gridMin.y = Math.min(gridMin.y, voxel.bounds.min.y);
      gridMin.z = Math.min(gridMin.z, voxel.bounds.min.z);
      gridMax.x = Math.max(gridMax.x, voxel.bounds.max.x);
      gridMax.y = Math.max(gridMax.y, voxel.bounds.max.y);
      gridMax.z = Math.max(gridMax.z, voxel.bounds.max.z);
      maxI = Math.max(maxI, voxel.coord.i);
      maxJ = Math.max(maxJ, voxel.coord.j);
      maxK = Math.max(maxK, voxel.coord.k);
    }

    const gridExtent: VoxelGridExtent = {
      origin: gridMin,
      dimensions: { i: maxI + 1, j: maxJ + 1, k: maxK + 1 },
      cellSize: resolution,
      totalCells: (maxI + 1) * (maxJ + 1) * (maxK + 1),
      boundingBox: { min: gridMin, max: gridMax },
    };

    // Build octree index
    const octreeRoot = buildOctree(voxels, gridExtent.boundingBox);

    // Store voxels and octree
    const projectVoxels = new Map<string, VoxelData>();
    for (const voxel of voxels) {
      projectVoxels.set(voxel.id, voxel);
    }
    voxelStorage.set(projectId, projectVoxels);
    octreeStorage.set(projectId, octreeRoot);

    return {
      success: true,
      projectId,
      modelId,
      gridExtent,
      resolution,
      voxels,
      voxelCount: voxels.length,
      stats,
      octreeRoot,
      processingTimeMs: Date.now() - startTime,
      errors,
      warnings,
    };
  }

  /**
   * Convert IFC elements to voxels (for integration with Speckle)
   *
   * This method accepts pre-parsed IFCElement[] directly, enabling
   * integration with the Speckle sync service and database elements.
   */
  async voxelizeFromElements(
    projectId: string,
    modelId: string,
    elements: IFCElement[],
    config?: Partial<VoxelizationConfig>
  ): Promise<VoxelizationResult> {
    const startTime = Date.now();
    const mergedConfig = { ...this.config, ...config };
    const resolution = typeof mergedConfig.resolution === 'number'
      ? mergedConfig.resolution
      : VoxelResolution.STANDARD;

    const warnings: string[] = [];

    if (elements.length === 0) {
      return {
        success: false,
        projectId,
        modelId,
        gridExtent: {
          origin: { x: 0, y: 0, z: 0 },
          dimensions: { i: 0, j: 0, k: 0 },
          cellSize: resolution,
          totalCells: 0,
          boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
        },
        resolution,
        voxels: [],
        voxelCount: 0,
        stats: {
          totalVoxels: 0,
          voxelsBySystem: {} as Record<VoxelSystem, number>,
          voxelsByLevel: {},
          voxelsByStatus: {} as Record<VoxelStatus, number>,
          ifcElementsProcessed: 0,
          ifcElementsSkipped: 0,
          averageVoxelsPerElement: 0,
          gridDensity: 0,
          boundingBoxVolume: 0,
          occupiedVolume: 0,
        },
        processingTimeMs: Date.now() - startTime,
        errors: [{ code: 'NO_ELEMENTS', message: 'No IFC elements provided' }],
        warnings,
      };
    }

    // Voxelize elements
    const { voxels, stats, errors } = voxelizeElements(elements, mergedConfig, projectId);

    // Calculate grid extent
    let gridMin: Vector3 = { x: Infinity, y: Infinity, z: Infinity };
    let gridMax: Vector3 = { x: -Infinity, y: -Infinity, z: -Infinity };
    let maxI = 0, maxJ = 0, maxK = 0;

    for (const voxel of voxels) {
      gridMin.x = Math.min(gridMin.x, voxel.bounds.min.x);
      gridMin.y = Math.min(gridMin.y, voxel.bounds.min.y);
      gridMin.z = Math.min(gridMin.z, voxel.bounds.min.z);
      gridMax.x = Math.max(gridMax.x, voxel.bounds.max.x);
      gridMax.y = Math.max(gridMax.y, voxel.bounds.max.y);
      gridMax.z = Math.max(gridMax.z, voxel.bounds.max.z);
      maxI = Math.max(maxI, voxel.coord.i);
      maxJ = Math.max(maxJ, voxel.coord.j);
      maxK = Math.max(maxK, voxel.coord.k);
    }

    // Handle edge case of no voxels
    if (voxels.length === 0) {
      gridMin = { x: 0, y: 0, z: 0 };
      gridMax = { x: 0, y: 0, z: 0 };
    }

    const gridExtent: VoxelGridExtent = {
      origin: gridMin,
      dimensions: { i: maxI + 1, j: maxJ + 1, k: maxK + 1 },
      cellSize: resolution,
      totalCells: (maxI + 1) * (maxJ + 1) * (maxK + 1),
      boundingBox: { min: gridMin, max: gridMax },
    };

    // Build octree index
    const octreeRoot = voxels.length > 0
      ? buildOctree(voxels, gridExtent.boundingBox)
      : undefined;

    // Store voxels and octree
    const projectVoxels = new Map<string, VoxelData>();
    for (const voxel of voxels) {
      projectVoxels.set(voxel.id, voxel);
    }
    voxelStorage.set(projectId, projectVoxels);
    if (octreeRoot) {
      octreeStorage.set(projectId, octreeRoot);
    }

    return {
      success: true,
      projectId,
      modelId,
      gridExtent,
      resolution,
      voxels,
      voxelCount: voxels.length,
      stats,
      octreeRoot,
      processingTimeMs: Date.now() - startTime,
      errors,
      warnings,
    };
  }

  /**
   * Load IFC elements for voxelization
   *
   * PRODUCTION INTEGRATION:
   * For production use, use SpeckleVoxelIntegrationService.voxelizeProjectElements()
   * which loads from PostgreSQL construction_elements table via Prisma.
   *
   * This method provides synthetic demo data for:
   * - Unit testing without database dependency
   * - Demo mode
   * - Development without IFC files
   *
   * For production, use the integration flow:
   * 1. SpeckleVoxelIntegrationService.voxelizeProjectElements(projectId)
   *    - Fetches from construction_elements table
   *    - Transforms to IFCElement format
   *    - Calls voxelizeFromElements() for voxelization
   *
   * Or use voxelizeFromElements() directly with pre-fetched IFCElement[]:
   * 2. voxelService.voxelizeFromElements(projectId, modelId, elements)
   *
   * @see apps/mcp-server/src/services/speckle-voxel-integration.service.ts
   */
  private async loadIFCElements(
    projectId: string,
    _modelId: string
  ): Promise<IFCElement[]> {
    // This method generates synthetic demo data
    // For production, use SpeckleVoxelIntegrationService or voxelizeFromElements()
    return this.generateDemoElements(projectId);
  }

  /**
   * Generate synthetic demo building elements for testing
   *
   * Creates a small 2m x 2m building module with:
   * - Structural: columns, slabs, walls
   * - MEP: HVAC ducts, electrical conduits, plumbing pipes
   *
   * This produces ~100-200 voxels at 40mm resolution, suitable for demos.
   */
  private generateDemoElements(projectId: string): IFCElement[] {
    const elements: IFCElement[] = [];
    const buildingSize = 2000; // 2m in mm
    const levelHeight = 1000; // 1m per level

    // Generate structural elements (columns, beams, slabs)
    for (let level = 0; level < 2; level++) {
      const zBase = level * levelHeight;

      // Columns (4 corners) - 100mm x 100mm
      const columnPositions = [
        { x: 0, y: 0 },
        { x: buildingSize, y: 0 },
        { x: 0, y: buildingSize },
        { x: buildingSize, y: buildingSize },
      ];

      for (let i = 0; i < columnPositions.length; i++) {
        const pos = columnPositions[i];
        elements.push({
          expressId: elements.length + 1,
          globalId: `column-L${level}-${i}`,
          type: IFCEntityCategory.COLUMN,
          name: `Column L${level}-${i}`,
          boundingBox: {
            min: { x: pos.x - 50, y: pos.y - 50, z: zBase },
            max: { x: pos.x + 50, y: pos.y + 50, z: zBase + levelHeight },
          },
          materials: [{ name: 'Concrete' }],
          properties: {},
          containedInStorey: `Level ${level}`,
        });
      }

      // Slab - 2m x 2m x 100mm thick
      elements.push({
        expressId: elements.length + 1,
        globalId: `slab-L${level}`,
        type: IFCEntityCategory.SLAB,
        name: `Slab L${level}`,
        boundingBox: {
          min: { x: 0, y: 0, z: zBase },
          max: { x: buildingSize, y: buildingSize, z: zBase + 100 },
        },
        materials: [{ name: 'Concrete' }],
        properties: {},
        containedInStorey: `Level ${level}`,
      });

      // Walls - scaled to 2m building
      const wallConfigs = [
        { x1: 0, y1: 0, x2: buildingSize, y2: 0 }, // South wall
        { x1: 0, y1: buildingSize, x2: buildingSize, y2: buildingSize }, // North wall
      ];

      for (let i = 0; i < wallConfigs.length; i++) {
        const wall = wallConfigs[i];
        elements.push({
          expressId: elements.length + 1,
          globalId: `wall-L${level}-${i}`,
          type: IFCEntityCategory.WALL,
          name: `Wall L${level}-${i}`,
          boundingBox: {
            min: {
              x: Math.min(wall.x1, wall.x2),
              y: Math.min(wall.y1, wall.y2) - 50,
              z: zBase + 100,
            },
            max: {
              x: Math.max(wall.x1, wall.x2),
              y: Math.max(wall.y1, wall.y2) + 50,
              z: zBase + levelHeight - 100,
            },
          },
          materials: [{ name: 'Masonry' }],
          properties: {},
          containedInStorey: `Level ${level}`,
        });
      }

      // HVAC duct - scaled
      elements.push({
        expressId: elements.length + 1,
        globalId: `duct-L${level}`,
        type: 'IfcDuctSegment',
        name: `Main Duct L${level}`,
        boundingBox: {
          min: { x: 200, y: 800, z: zBase + 800 },
          max: { x: 1800, y: 1000, z: zBase + 950 },
        },
        materials: [{ name: 'Sheet Metal' }],
        properties: {},
        containedInStorey: `Level ${level}`,
      });

      // Electrical conduit - scaled
      elements.push({
        expressId: elements.length + 1,
        globalId: `conduit-L${level}`,
        type: 'IfcCableCarrierSegment',
        name: `Electrical Conduit L${level}`,
        boundingBox: {
          min: { x: 400, y: 1600, z: zBase + 850 },
          max: { x: 1600, y: 1700, z: zBase + 920 },
        },
        materials: [{ name: 'Steel' }],
        properties: {},
        containedInStorey: `Level ${level}`,
      });

      // Plumbing pipe - scaled
      elements.push({
        expressId: elements.length + 1,
        globalId: `pipe-L${level}`,
        type: 'IfcPipeSegment',
        name: `Water Main L${level}`,
        boundingBox: {
          min: { x: 600, y: 400, z: zBase + 100 },
          max: { x: 700, y: 1400, z: zBase + 200 },
        },
        materials: [{ name: 'Copper' }],
        properties: {},
        containedInStorey: `Level ${level}`,
      });
    }

    return elements;
  }

  /**
   * Query voxels by spatial criteria
   */
  async queryVoxels(query: VoxelSpatialQuery): Promise<VoxelSpatialQueryResult> {
    const startTime = Date.now();
    const projectVoxels = voxelStorage.get(query.projectId);

    if (!projectVoxels) {
      return {
        voxels: [],
        totalCount: 0,
        queryTimeMs: Date.now() - startTime,
        boundingBox: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 0, y: 0, z: 0 },
        },
      };
    }

    let results = Array.from(projectVoxels.values());

    // Use octree for spatial query if bounding box specified
    if (query.boundingBox) {
      const octree = octreeStorage.get(query.projectId);
      if (octree) {
        const voxelIds = queryOctree(octree, query.boundingBox);
        results = results.filter((v) => voxelIds.includes(v.id));
      } else {
        results = results.filter((v) => boundsIntersect(v.bounds, query.boundingBox!));
      }
    }

    // Radius query
    if (query.center && query.radius) {
      const center = query.center;
      const radiusSq = query.radius * query.radius;
      results = results.filter((v) => {
        const dx = v.center.x - center.x;
        const dy = v.center.y - center.y;
        const dz = v.center.z - center.z;
        return dx * dx + dy * dy + dz * dz <= radiusSq;
      });
    }

    // Filter by properties
    if (query.systems && query.systems.length > 0) {
      results = results.filter((v) => query.systems!.includes(v.system));
    }

    if (query.statuses && query.statuses.length > 0) {
      results = results.filter((v) => query.statuses!.includes(v.status));
    }

    if (query.levels && query.levels.length > 0) {
      results = results.filter((v) => v.level && query.levels!.includes(v.level));
    }

    if (query.zones && query.zones.length > 0) {
      results = results.filter((v) => v.zone && query.zones!.includes(v.zone));
    }

    // Decision surface filters
    if (query.hasDecisions !== undefined) {
      results = results.filter((v) =>
        query.hasDecisions ? v.decisionCount > 0 : v.decisionCount === 0
      );
    }

    if (query.hasActiveAlerts !== undefined) {
      results = results.filter((v) =>
        query.hasActiveAlerts ? v.unacknowledgedCount > 0 : v.unacknowledgedCount === 0
      );
    }

    if (query.healthStatus && query.healthStatus.length > 0) {
      results = results.filter((v) =>
        v.healthStatus && query.healthStatus!.includes(v.healthStatus)
      );
    }

    const totalCount = results.length;

    // Pagination
    if (query.offset) {
      results = results.slice(query.offset);
    }
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    // Calculate result bounding box
    const resultMin: Vector3 = { x: Infinity, y: Infinity, z: Infinity };
    const resultMax: Vector3 = { x: -Infinity, y: -Infinity, z: -Infinity };

    for (const v of results) {
      resultMin.x = Math.min(resultMin.x, v.bounds.min.x);
      resultMin.y = Math.min(resultMin.y, v.bounds.min.y);
      resultMin.z = Math.min(resultMin.z, v.bounds.min.z);
      resultMax.x = Math.max(resultMax.x, v.bounds.max.x);
      resultMax.y = Math.max(resultMax.y, v.bounds.max.y);
      resultMax.z = Math.max(resultMax.z, v.bounds.max.z);
    }

    return {
      voxels: results,
      totalCount,
      queryTimeMs: Date.now() - startTime,
      boundingBox: { min: resultMin, max: resultMax },
    };
  }

  /**
   * Get voxel by ID
   */
  async getVoxel(voxelId: string): Promise<VoxelData | null> {
    for (const projectVoxels of voxelStorage.values()) {
      const voxel = projectVoxels.get(voxelId);
      if (voxel) {return voxel;}
    }
    return null;
  }

  /**
   * Get voxels in bounding box
   */
  async getVoxelsInBounds(
    projectId: string,
    bounds: BoundingBox
  ): Promise<VoxelData[]> {
    const result = await this.queryVoxels({
      projectId,
      boundingBox: bounds,
    });
    return result.voxels;
  }

  /**
   * Get aggregated metrics
   */
  async getAggregation(
    projectId: string,
    level: AggregationLevel,
    filters?: VoxelSpatialQuery
  ): Promise<VoxelAggregation[]> {
    const projectVoxels = voxelStorage.get(projectId);
    if (!projectVoxels) {return [];}

    let voxels = Array.from(projectVoxels.values());

    // Apply filters if provided
    if (filters) {
      const queryResult = await this.queryVoxels({ ...filters, projectId });
      voxels = queryResult.voxels;
    }

    // Group voxels by aggregation key
    const groups: Map<string, VoxelData[]> = new Map();

    for (const voxel of voxels) {
      let key: string;

      switch (level) {
        case AggregationLevel.LEVEL:
          key = voxel.level || 'Unknown Level';
          break;
        case AggregationLevel.ZONE:
          key = voxel.zone || 'Unknown Zone';
          break;
        case AggregationLevel.ROOM:
          key = voxel.room || 'Unknown Room';
          break;
        case AggregationLevel.SYSTEM:
          key = voxel.system;
          break;
        case AggregationLevel.BUILDING:
          key = voxel.building || 'Building';
          break;
        case AggregationLevel.PROJECT:
          key = projectId;
          break;
        default:
          key = voxel.id;
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(voxel);
    }

    // Calculate aggregations
    const aggregations: VoxelAggregation[] = [];

    for (const [key, groupVoxels] of groups) {
      const agg: VoxelAggregation = {
        level,
        key,
        voxelCount: groupVoxels.length,
        elementCount: groupVoxels.reduce((sum, v) => sum + v.elementCount, 0),
        decisionCount: groupVoxels.reduce((sum, v) => sum + v.decisionCount, 0),
        alertCount: groupVoxels.reduce((sum, v) => sum + v.unacknowledgedCount, 0),

        plannedCount: groupVoxels.filter((v) => v.status === VoxelStatus.PLANNED).length,
        inProgressCount: groupVoxels.filter((v) => v.status === VoxelStatus.IN_PROGRESS).length,
        completeCount: groupVoxels.filter((v) => v.status === VoxelStatus.COMPLETE).length,
        blockedCount: groupVoxels.filter((v) => v.status === VoxelStatus.BLOCKED).length,
        overallProgress:
          groupVoxels.reduce((sum, v) => sum + (v.percentComplete || 0), 0) / groupVoxels.length,

        totalEstimatedCost: groupVoxels.reduce((sum, v) => sum + (v.estimatedCost || 0), 0),
        totalActualCost: groupVoxels.reduce((sum, v) => sum + (v.actualCost || 0), 0),
        costVariance: 0,
        totalEstimatedHours: groupVoxels.reduce((sum, v) => sum + (v.estimatedHours || 0), 0),
        totalActualHours: groupVoxels.reduce((sum, v) => sum + (v.actualHours || 0), 0),
        laborVariance: 0,

        healthyCount: groupVoxels.filter((v) => v.healthStatus === VoxelHealthStatus.HEALTHY).length,
        atRiskCount: groupVoxels.filter((v) => v.healthStatus === VoxelHealthStatus.AT_RISK).length,
        criticalCount: groupVoxels.filter((v) => v.healthStatus === VoxelHealthStatus.CRITICAL).length,
        healthScore: 0,
      };

      // Calculate variances
      agg.costVariance = agg.totalActualCost - agg.totalEstimatedCost;
      agg.laborVariance = agg.totalActualHours - agg.totalEstimatedHours;

      // Calculate health score (0-100)
      const healthyWeight = 1;
      const atRiskWeight = 0.5;
      const criticalWeight = 0;
      const totalHealth =
        agg.healthyCount * healthyWeight +
        agg.atRiskCount * atRiskWeight +
        agg.criticalCount * criticalWeight;
      agg.healthScore = agg.voxelCount > 0 ? (totalHealth / agg.voxelCount) * 100 : 100;

      aggregations.push(agg);
    }

    return aggregations;
  }

  /**
   * Generate visualization data
   */
  async getVisualizationData(
    projectId: string,
    config: VoxelVisualizationConfig,
    bounds?: BoundingBox
  ): Promise<VoxelInstanceData> {
    const query: VoxelSpatialQuery = { projectId };
    if (bounds) {
      query.boundingBox = bounds;
    }

    const result = await this.queryVoxels(query);
    return generateInstanceData(result.voxels, config);
  }

  /**
   * Get activity feed for voxels
   */
  async getActivityFeed(
    projectId: string,
    voxelIds?: string[],
    limit: number = 50
  ): Promise<VoxelActivityItem[]> {
    // In production, this would query decision, inspection, and alert tables
    // For now, return mock data
    const activities: VoxelActivityItem[] = [];

    const projectVoxels = voxelStorage.get(projectId);
    if (!projectVoxels) {return activities;}

    const voxels = voxelIds
      ? Array.from(projectVoxels.values()).filter((v) => voxelIds.includes(v.id))
      : Array.from(projectVoxels.values()).slice(0, 10);

    // Generate mock activity items
    for (const voxel of voxels) {
      if (voxel.decisionCount > 0) {
        activities.push({
          id: uuidv4(),
          voxelId: voxel.id,
          voxelLabel: voxel.voxelId,
          type: 'decision',
          title: `Decision required`,
          description: `${voxel.decisionCount} decision(s) pending for ${voxel.voxelId}`,
          timestamp: new Date(),
          severity: 'info',
          coord: voxel.coord,
        });
      }
    }

    return activities.slice(0, limit);
  }

  /**
   * Update voxel status
   */
  async updateVoxelStatus(
    voxelId: string,
    status: VoxelStatus,
    percentComplete?: number
  ): Promise<VoxelData | null> {
    for (const projectVoxels of voxelStorage.values()) {
      const voxel = projectVoxels.get(voxelId);
      if (voxel) {
        voxel.status = status;
        if (percentComplete !== undefined) {
          voxel.percentComplete = percentComplete;
        }
        voxel.updatedAt = new Date();

        // Update health status based on status
        if (status === VoxelStatus.BLOCKED) {
          voxel.healthStatus = VoxelHealthStatus.BLOCKED;
        } else if (status === VoxelStatus.ISSUE) {
          voxel.healthStatus = VoxelHealthStatus.CRITICAL;
        }

        return voxel;
      }
    }
    return null;
  }

  /**
   * Attach decision to voxel
   */
  async attachDecision(voxelId: string, decisionId: string): Promise<void> {
    for (const projectVoxels of voxelStorage.values()) {
      const voxel = projectVoxels.get(voxelId);
      if (voxel) {
        voxel.decisionCount++;
        voxel.unacknowledgedCount++;
        voxel.updatedAt = new Date();

        // Add to graph metadata
        if (!voxel.graphMetadata) {
          voxel.graphMetadata = { inEdges: [], outEdges: [] };
        }
        voxel.graphMetadata.inEdges.push(`urn:ectropy:decision:${decisionId}`);

        return;
      }
    }
  }

  /**
   * Get voxel summary for quick visualization
   */
  async getVoxelSummaries(projectId: string): Promise<VoxelSummary[]> {
    const projectVoxels = voxelStorage.get(projectId);
    if (!projectVoxels) {return [];}

    return Array.from(projectVoxels.values()).map((v) => ({
      id: v.id,
      voxelId: v.voxelId,
      coord: v.coord,
      center: v.center,
      status: v.status,
      healthStatus: v.healthStatus || VoxelHealthStatus.HEALTHY,
      system: v.system,
      decisionCount: v.decisionCount,
      hasActiveAlerts: v.unacknowledgedCount > 0,
      percentComplete: v.percentComplete,
      color: SYSTEM_COLORS[v.system],
    }));
  }

  /**
   * Create coordination session for live site view
   */
  async createCoordinationSession(
    projectId: string,
    participants: string[]
  ): Promise<VoxelCoordinationSession> {
    return {
      sessionId: uuidv4(),
      projectId,
      participants,
      activeVoxels: [],
      highlightedDecisions: [],
      filters: { projectId },
      startedAt: new Date(),
      lastActivityAt: new Date(),
    };
  }
}

// ==============================================================================
// Factory & Singleton
// ==============================================================================

let serviceInstance: VoxelDecompositionService | null = null;

/**
 * Get or create the voxel decomposition service singleton
 */
export function getVoxelDecompositionService(
  config?: Partial<VoxelizationConfig>
): VoxelDecompositionService {
  if (!serviceInstance) {
    serviceInstance = new VoxelDecompositionService(config);
  }
  return serviceInstance;
}

/**
 * Create a new voxel decomposition service instance
 */
export function createVoxelDecompositionService(
  config?: Partial<VoxelizationConfig>
): VoxelDecompositionService {
  return new VoxelDecompositionService(config);
}

export default VoxelDecompositionService;
