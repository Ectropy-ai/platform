/**
 * Voxel Decomposition Types
 *
 * Type definitions for the SEPPA (Spatial Element Processing Prediction Aggregation) pipeline.
 * Supports IFC→Voxel conversion, spatial indexing, and visualization.
 *
 * @module types/voxel-decomposition
 * @version 1.0.0
 */

// ==============================================================================
// Core Enums
// ==============================================================================

/**
 * Voxel resolution levels for different use cases
 */
export enum VoxelResolution {
  COARSE = 100, // 100mm - Overview/aggregation
  STANDARD = 40, // 40mm - Decision attachment (default)
  FINE = 10, // 10mm - Precision inspection
  CUSTOM = 0, // Custom resolution specified in config
}

/**
 * Voxel status in the construction lifecycle
 */
export enum VoxelStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETE = 'COMPLETE',
  ON_HOLD = 'ON_HOLD',
  INSPECTION_REQUIRED = 'INSPECTION_REQUIRED',
  BLOCKED = 'BLOCKED',
  ISSUE = 'ISSUE',
}

/**
 * Building system classification for voxels
 */
export enum VoxelSystem {
  STRUCTURAL = 'STRUCT',
  MECHANICAL = 'MECH',
  ELECTRICAL = 'ELEC',
  PLUMBING = 'PLUMB',
  HVAC = 'HVAC',
  FIRE = 'FIRE',
  ARCHITECTURAL = 'ARCH',
  CIVIL = 'CIVIL',
  TELECOM = 'TELE',
  LANDSCAPE = 'LAND',
  UNKNOWN = 'UNK',
}

/**
 * IFC entity categories for voxel classification
 */
export enum IFCEntityCategory {
  WALL = 'IfcWall',
  SLAB = 'IfcSlab',
  COLUMN = 'IfcColumn',
  BEAM = 'IfcBeam',
  DOOR = 'IfcDoor',
  WINDOW = 'IfcWindow',
  STAIR = 'IfcStair',
  ROOF = 'IfcRoof',
  COVERING = 'IfcCovering',
  CURTAIN_WALL = 'IfcCurtainWall',
  RAILING = 'IfcRailing',
  RAMP = 'IfcRamp',
  FURNISHING = 'IfcFurnishingElement',
  DISTRIBUTION_ELEMENT = 'IfcDistributionElement',
  FLOW_TERMINAL = 'IfcFlowTerminal',
  FLOW_SEGMENT = 'IfcFlowSegment',
  FLOW_FITTING = 'IfcFlowFitting',
  SPACE = 'IfcSpace',
  BUILDING_STOREY = 'IfcBuildingStorey',
  BUILDING = 'IfcBuilding',
  SITE = 'IfcSite',
  UNKNOWN = 'Unknown',
}

/**
 * Voxel health status for dashboard display
 */
export enum VoxelHealthStatus {
  HEALTHY = 'HEALTHY', // On schedule, on budget
  AT_RISK = 'AT_RISK', // Within tolerance but trending poorly
  CRITICAL = 'CRITICAL', // Exceeds tolerance, needs attention
  BLOCKED = 'BLOCKED', // Cannot proceed due to dependency
}

// ==============================================================================
// Coordinate & Spatial Types
// ==============================================================================

/**
 * 3D coordinate point
 */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Axis-aligned bounding box
 */
export interface BoundingBox {
  min: Vector3;
  max: Vector3;
}

/**
 * Voxel grid coordinate (integer indices)
 */
export interface VoxelCoord {
  i: number; // X index
  j: number; // Y index
  k: number; // Z index
}

/**
 * Spatial extent of the voxel grid
 */
export interface VoxelGridExtent {
  origin: Vector3; // Grid origin in world coordinates
  dimensions: VoxelCoord; // Grid dimensions (count in each axis)
  cellSize: number; // Size of each voxel cell in mm
  totalCells: number; // Total number of cells in grid
  boundingBox: BoundingBox; // World-space bounding box
}

// ==============================================================================
// Octree Spatial Index Types
// ==============================================================================

/**
 * Octree node for efficient spatial queries
 */
export interface OctreeNode {
  id: string;
  bounds: BoundingBox;
  depth: number;
  isLeaf: boolean;
  children?: OctreeNode[];
  voxelIds: string[];
  voxelCount: number;
}

/**
 * Octree configuration
 */
export interface OctreeConfig {
  maxDepth: number; // Maximum tree depth (default: 8)
  maxVoxelsPerNode: number; // Split threshold (default: 16)
  minNodeSize: number; // Minimum node size in mm (default: 10)
}

// ==============================================================================
// IFC Element Types
// ==============================================================================

/**
 * IFC element extracted from model
 */
export interface IFCElement {
  expressId: number;
  globalId: string;
  type: IFCEntityCategory | string;
  name?: string;
  description?: string;
  objectType?: string;
  boundingBox: BoundingBox;
  volume?: number; // Volume in m³
  surfaceArea?: number; // Surface area in m²
  materials: IFCMaterial[];
  properties: Record<string, unknown>;
  containedInStorey?: string;
  containedInSpace?: string;
}

/**
 * IFC material information
 */
export interface IFCMaterial {
  name: string;
  category?: string;
  thickness?: number;
  volume?: number;
  area?: number;
  density?: number;
  properties?: Record<string, unknown>;
}

/**
 * IFC property set
 */
export interface IFCPropertySet {
  name: string;
  properties: IFCProperty[];
}

/**
 * IFC property
 */
export interface IFCProperty {
  name: string;
  value: unknown;
  type: string;
  unit?: string;
}

// ==============================================================================
// Graph Types (must be before VoxelData for reference)
// ==============================================================================

/**
 * Graph edge for spatial and decision relationships
 */
export interface GraphEdge {
  from: string; // URN
  to: string; // URN
  type: 'contains' | 'adjacent-to' | 'depends-on' | 'affects';
  weight?: number;
  label?: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

// ==============================================================================
// Voxel Data Types
// ==============================================================================

/**
 * Core voxel data structure
 */
export interface VoxelData {
  id: string;
  urn: string;
  voxelId: string; // e.g., VOX-L2-MECH-047
  projectId: string;

  // Spatial
  coord: VoxelCoord; // Grid position
  center: Vector3; // World-space center
  bounds: BoundingBox; // World-space bounds
  resolution: number; // Voxel size in mm

  // Location hierarchy
  building?: string;
  level?: string;
  zone?: string;
  room?: string;
  gridReference?: string;
  system: VoxelSystem;

  // IFC elements contained
  ifcElements: string[]; // IFC GlobalIds
  primaryElement?: string; // Primary IFC element GlobalId
  elementCount: number;

  // Classification
  entityType?: IFCEntityCategory;
  materialType?: string;
  tradeCode?: string;

  // Metrics
  volume?: number; // m³
  surfaceArea?: number; // m²
  complexityScore?: number; // 0-100

  // Status
  status: VoxelStatus;
  healthStatus?: VoxelHealthStatus;
  percentComplete?: number;

  // Schedule
  plannedStart?: Date;
  plannedEnd?: Date;
  actualStart?: Date;
  actualEnd?: Date;
  isCriticalPath: boolean;

  // Cost & Labor
  estimatedCost?: number;
  actualCost?: number;
  estimatedHours?: number;
  actualHours?: number;

  // Decision surface
  decisionCount: number;
  unacknowledgedCount: number;

  // Adjacent voxels for spatial traversal (6-connected neighbors)
  adjacentVoxels?: string[]; // URNs of face-sharing neighbors

  // Metadata
  graphMetadata?: {
    inEdges: string[];
    outEdges: string[];
    edges?: GraphEdge[]; // Full edge data for graph traversal
  };
  meta?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

// ==============================================================================
// V3 Schema Compliance Types
// ==============================================================================

/**
 * V3 Schema constants
 */
export const VOXEL_SCHEMA_VERSION = '3.0.0';
export const VOXEL_SCHEMA_URL = 'https://luhtech.dev/schemas/pm/voxel.schema.json';

/**
 * Decision attachment type
 */
export type DecisionAttachmentType = 'PRIMARY' | 'AFFECTED' | 'ADJACENT' | 'DOWNSTREAM';

/**
 * Attached by type
 */
export type AttachedByType = 'SYSTEM' | 'USER' | 'AI';

/**
 * Alert priority levels
 */
export type AlertPriority = 'INFO' | 'WARNING' | 'CRITICAL';

/**
 * Acknowledgment method
 */
export type AcknowledgmentMethod = 'APP_TAP' | 'SMS_REPLY' | 'VOICE' | 'AR_GESTURE';

/**
 * Tolerance override types per V3 schema
 */
export type ToleranceType =
  | 'WALL_FLATNESS'
  | 'CEILING_HEIGHT'
  | 'FLOOR_LEVEL'
  | 'PROTRUSION'
  | 'GAP'
  | 'ALIGNMENT'
  | 'FINISH_QUALITY'
  | 'EQUIPMENT_CLEARANCE'
  | 'PIPE_SLOPE'
  | 'DUCT_SIZE';

/**
 * Work phase in construction lifecycle
 */
export type WorkPhase = 'NOT_STARTED' | 'ROUGH' | 'FINISH' | 'COMPLETE' | 'REWORK' | 'PUNCH_LIST';

/**
 * Inspection state
 */
export type InspectionState = 'NOT_SCHEDULED' | 'SCHEDULED' | 'PASSED' | 'FAILED' | 'CONDITIONAL';

/**
 * Authority levels per 7-tier cascade
 */
export type AuthorityLevel = 'FIELD' | 'FOREMAN' | 'SUPERINTENDENT' | 'PM' | 'ARCHITECT' | 'OWNER' | 'REGULATORY';

/**
 * Attached decision with full metadata (V3 schema compliant)
 */
export interface AttachedDecision {
  decisionRef: string; // URN of decision
  attachmentType: DecisionAttachmentType;
  attachedAt: Date;
  attachedBy: AttachedByType;
  affectedTrades?: string[];
  summary?: string;
  requiresAcknowledgment: boolean;
  acknowledged: boolean;
}

/**
 * Tolerance value with direction
 */
export interface ToleranceValue {
  value: number;
  unit: string;
  direction: '+' | '-' | '±';
}

/**
 * Pre-approved tolerance variance at a location (V3 schema)
 */
export interface ToleranceOverride {
  id: string;
  toleranceType: ToleranceType;
  standardValue: ToleranceValue;
  approvedValue: ToleranceValue;
  sourceDecisionRef: string; // URN
  approvedBy: string; // URN
  approvalDate: Date;
  expiresAt?: Date;
  rationale: string;
  applicableTrades: string[];
}

/**
 * Pre-approval authorizing future work variations (V3 schema)
 */
export interface PreApproval {
  id: string;
  scope: string;
  conditions: string[];
  validFrom: Date;
  validUntil?: Date;
  sourceDecisionRef: string; // URN
  authorityLevel: AuthorityLevel;
  applicableTrades: string[];
  usageCount: number;
}

/**
 * Alert shown to workers entering a voxel (V3 schema)
 */
export interface VoxelAlert {
  id: string;
  priority: AlertPriority;
  title: string;
  message: string;
  sourceDecisionRef?: string; // URN
  targetTrades?: string[];
  requiresAcknowledgment: boolean;
  createdAt: Date;
  expiresAt?: Date;
  acknowledgedBy: string[]; // URNs of workers who acknowledged
}

/**
 * Worker acknowledgment of a decision (V3 schema)
 */
export interface DecisionAcknowledgment {
  id: string;
  decisionRef: string; // URN
  workerRef: string; // URN
  workerName: string;
  workerTrade: string;
  timestamp: Date;
  method: AcknowledgmentMethod;
  location?: {
    gps?: { lat: number; lng: number; accuracy: number };
    uwb?: { x: number; y: number; z: number; accuracy: number };
  };
  notes?: string;
}

/**
 * Decision surface - the accumulated decisions affecting a location (V3 schema)
 */
export interface DecisionSurface {
  decisions: string[]; // URNs of all decisions
  attachedDecisions: AttachedDecision[];
  toleranceOverrides: ToleranceOverride[];
  preApprovals: PreApproval[];
  activeAlerts: VoxelAlert[];
  acknowledgments: DecisionAcknowledgment[];
  decisionCount: number;
  unacknowledgedCount: number;
  lastUpdated: Date;
}

/**
 * Scheduled trade work
 */
export interface ScheduledTrade {
  trade: string;
  taskId: string;
  startDate: string; // ISO date
  endDate: string; // ISO date
}

/**
 * Work status for a voxel (V3 schema)
 */
export interface WorkStatus {
  currentPhase: WorkPhase;
  activeTrades: string[];
  scheduledTrades: ScheduledTrade[];
  percentComplete: number;
}

/**
 * Inspection state reference
 */
export interface InspectionStateRef {
  status: InspectionState;
  date?: string; // ISO date
  inspectionRef?: string; // URN
}

/**
 * Inspection status for a voxel (V3 schema)
 */
export interface VoxelInspectionStatus {
  inspections: string[]; // URNs of inspections
  roughInspection?: InspectionStateRef;
  finalInspection?: InspectionStateRef;
  decisionsReviewed: string[]; // URNs of decisions inspector has reviewed
  readyForInspection: boolean;
}

/**
 * Material with carbon coefficient (V3 schema)
 */
export interface VoxelMaterial {
  materialId: string;
  name: string;
  quantity: number;
  unit: string;
  carbonCoefficient?: number; // kg CO2e per unit
}

/**
 * Labor allocation (V3 schema)
 */
export interface VoxelLabor {
  estimatedHours: number;
  actualHours: number;
  assignedTrade?: string;
  assignedCrew?: string;
}

/**
 * Carbon tracking (V3 schema)
 */
export interface VoxelCarbon {
  embodiedCarbon: number; // kg CO2e
  transportCarbon: number; // kg CO2e
  constructionCarbon: number; // kg CO2e
  totalCarbon: number; // kg CO2e
}

/**
 * Voxel dependencies (V3 schema)
 */
export interface VoxelDependencies {
  predecessors: string[]; // URNs of voxels that must complete first
  successors: string[]; // URNs of voxels that depend on this one
}

/**
 * V3-compliant voxel with full decision surface
 */
export interface VoxelDataV3 extends VoxelData {
  $schema: string; // Always VOXEL_SCHEMA_URL
  schemaVersion: string; // Always '3.0.0'

  // Enhanced decision surface (V3)
  decisionSurface?: DecisionSurface;

  // Work status (V3)
  workStatus?: WorkStatus;

  // Inspection status (V3)
  inspectionStatus?: VoxelInspectionStatus;

  // Materials with carbon (V3)
  materials?: VoxelMaterial[];

  // Labor allocation (V3)
  labor?: VoxelLabor;

  // Carbon tracking (V3)
  carbon?: VoxelCarbon;

  // Dependencies (V3)
  dependencies?: VoxelDependencies;

  // Adjacent voxels for spatial traversal
  adjacentVoxels?: string[]; // URNs

  // Graph metadata is now required
  graphMetadata: {
    inEdges: string[];
    outEdges: string[];
    edges?: GraphEdge[];
  };
}

/**
 * Convert VoxelData to V3-compliant format
 */
export function toVoxelDataV3(voxel: VoxelData): VoxelDataV3 {
  return {
    ...voxel,
    $schema: VOXEL_SCHEMA_URL,
    schemaVersion: VOXEL_SCHEMA_VERSION,
    graphMetadata: voxel.graphMetadata || { inEdges: [], outEdges: [] },
  };
}

/**
 * Voxel summary for visualization (lightweight)
 */
export interface VoxelSummary {
  id: string;
  voxelId: string;
  coord: VoxelCoord;
  center: Vector3;
  status: VoxelStatus;
  healthStatus: VoxelHealthStatus;
  system: VoxelSystem;
  decisionCount: number;
  hasActiveAlerts: boolean;
  percentComplete?: number;
  color?: string; // Hex color for visualization
}

// ==============================================================================
// Voxelization Configuration
// ==============================================================================

/**
 * Voxelization configuration
 */
export interface VoxelizationConfig {
  resolution: VoxelResolution | number;
  includeHollow: boolean; // Include hollow interior voxels
  includePartial: boolean; // Include partially filled voxels
  minOccupancy: number; // Minimum occupancy threshold (0-1)
  systemMapping: Record<string, VoxelSystem>;
  levelPatterns: string[]; // Regex patterns to detect levels
  zonePatterns: string[]; // Regex patterns to detect zones
}

/**
 * Default voxelization configuration
 */
export const DEFAULT_VOXELIZATION_CONFIG: VoxelizationConfig = {
  resolution: VoxelResolution.STANDARD,
  includeHollow: false,
  includePartial: true,
  minOccupancy: 0.1,
  systemMapping: {
    'IfcDistributionElement': VoxelSystem.MECHANICAL,
    'IfcFlowTerminal': VoxelSystem.MECHANICAL,
    'IfcFlowSegment': VoxelSystem.MECHANICAL,
    'IfcFlowFitting': VoxelSystem.MECHANICAL,
    'IfcWall': VoxelSystem.ARCHITECTURAL,
    'IfcSlab': VoxelSystem.STRUCTURAL,
    'IfcColumn': VoxelSystem.STRUCTURAL,
    'IfcBeam': VoxelSystem.STRUCTURAL,
  },
  levelPatterns: [
    /level\s*(\d+)/i.source,
    /floor\s*(\d+)/i.source,
    /storey\s*(\d+)/i.source,
    /L(\d+)/i.source,
  ],
  zonePatterns: [
    /zone\s*([A-Z0-9]+)/i.source,
    /area\s*([A-Z0-9]+)/i.source,
  ],
};

// ==============================================================================
// Voxelization Result Types
// ==============================================================================

/**
 * Result of voxelization process
 */
export interface VoxelizationResult {
  success: boolean;
  projectId: string;
  modelId: string;

  // Grid information
  gridExtent: VoxelGridExtent;
  resolution: number;

  // Generated voxels
  voxels: VoxelData[];
  voxelCount: number;

  // Statistics
  stats: VoxelizationStats;

  // Octree index
  octreeRoot?: OctreeNode;

  // Timing
  processingTimeMs: number;

  // Errors/warnings
  errors: VoxelizationError[];
  warnings: string[];
}

/**
 * Voxelization statistics
 */
export interface VoxelizationStats {
  totalVoxels: number;
  voxelsBySystem: Record<VoxelSystem, number>;
  voxelsByLevel: Record<string, number>;
  voxelsByStatus: Record<VoxelStatus, number>;
  ifcElementsProcessed: number;
  ifcElementsSkipped: number;
  averageVoxelsPerElement: number;
  gridDensity: number; // Occupied / total cells
  boundingBoxVolume: number; // m³
  occupiedVolume: number; // m³
}

/**
 * Voxelization error
 */
export interface VoxelizationError {
  code: string;
  message: string;
  elementId?: string;
  details?: Record<string, unknown>;
}

// ==============================================================================
// Spatial Query Types
// ==============================================================================

/**
 * Spatial query filter
 */
export interface VoxelSpatialQuery {
  projectId: string;

  // Bounding box query
  boundingBox?: BoundingBox;

  // Radius query from point
  center?: Vector3;
  radius?: number;

  // Filter by properties
  systems?: VoxelSystem[];
  statuses?: VoxelStatus[];
  levels?: string[];
  zones?: string[];

  // Decision surface filters
  hasDecisions?: boolean;
  hasActiveAlerts?: boolean;
  healthStatus?: VoxelHealthStatus[];

  // Pagination
  limit?: number;
  offset?: number;
}

/**
 * Spatial query result
 */
export interface VoxelSpatialQueryResult {
  voxels: VoxelData[];
  totalCount: number;
  queryTimeMs: number;
  boundingBox: BoundingBox;
}

// ==============================================================================
// Visualization Types
// ==============================================================================

/**
 * Voxel visualization configuration
 */
export interface VoxelVisualizationConfig {
  mode: VoxelVisualizationMode;
  colorScheme: VoxelColorScheme;
  opacity: number; // 0-1
  showWireframe: boolean;
  showLabels: boolean;
  labelField: keyof VoxelData;
  filterSystems?: VoxelSystem[];
  filterStatuses?: VoxelStatus[];
  highlightedVoxels?: string[];
}

/**
 * Visualization mode
 */
export enum VoxelVisualizationMode {
  SOLID = 'SOLID', // Solid cubes
  WIREFRAME = 'WIREFRAME', // Wireframe only
  POINTS = 'POINTS', // Point cloud
  HEATMAP = 'HEATMAP', // Color gradient based on value
}

/**
 * Color scheme for voxel visualization
 */
export enum VoxelColorScheme {
  BY_SYSTEM = 'BY_SYSTEM', // Color by building system
  BY_STATUS = 'BY_STATUS', // Color by status
  BY_HEALTH = 'BY_HEALTH', // Color by health status
  BY_PROGRESS = 'BY_PROGRESS', // Color by percent complete
  BY_DECISION_DENSITY = 'BY_DECISION_DENSITY',
  UNIFORM = 'UNIFORM', // Single color
}

/**
 * System color mapping
 */
export const SYSTEM_COLORS: Record<VoxelSystem, string> = {
  [VoxelSystem.STRUCTURAL]: '#808080', // Gray
  [VoxelSystem.MECHANICAL]: '#0066cc', // Blue
  [VoxelSystem.ELECTRICAL]: '#ffcc00', // Yellow
  [VoxelSystem.PLUMBING]: '#00cc66', // Green
  [VoxelSystem.HVAC]: '#00cccc', // Cyan
  [VoxelSystem.FIRE]: '#ff0000', // Red
  [VoxelSystem.ARCHITECTURAL]: '#996633', // Brown
  [VoxelSystem.CIVIL]: '#663300', // Dark brown
  [VoxelSystem.TELECOM]: '#9900cc', // Purple
  [VoxelSystem.LANDSCAPE]: '#00ff00', // Bright green
  [VoxelSystem.UNKNOWN]: '#cccccc', // Light gray
};

/**
 * Status color mapping
 */
export const STATUS_COLORS: Record<VoxelStatus, string> = {
  [VoxelStatus.PLANNED]: '#3498db', // Blue
  [VoxelStatus.IN_PROGRESS]: '#f39c12', // Orange
  [VoxelStatus.COMPLETE]: '#27ae60', // Green
  [VoxelStatus.ON_HOLD]: '#95a5a6', // Gray
  [VoxelStatus.INSPECTION_REQUIRED]: '#9b59b6', // Purple
  [VoxelStatus.BLOCKED]: '#e74c3c', // Red
  [VoxelStatus.ISSUE]: '#c0392b', // Dark red
};

/**
 * Health status color mapping
 */
export const HEALTH_COLORS: Record<VoxelHealthStatus, string> = {
  [VoxelHealthStatus.HEALTHY]: '#27ae60', // Green
  [VoxelHealthStatus.AT_RISK]: '#f39c12', // Orange
  [VoxelHealthStatus.CRITICAL]: '#e74c3c', // Red
  [VoxelHealthStatus.BLOCKED]: '#7f8c8d', // Gray
};

/**
 * Voxel mesh data for Three.js/WebGL rendering
 */
export interface VoxelMeshData {
  positions: Float32Array; // Vertex positions
  colors: Float32Array; // Vertex colors
  indices: Uint32Array; // Triangle indices
  voxelIds: string[]; // Voxel ID for each cube
  instanceCount: number;
}

/**
 * Instanced voxel rendering data (more efficient)
 */
export interface VoxelInstanceData {
  centers: Float32Array; // Instance centers (x, y, z for each)
  scales: Float32Array; // Instance scales (sx, sy, sz for each)
  colors: Float32Array; // Instance colors (r, g, b, a for each)
  voxelIds: string[]; // Voxel ID per instance
  instanceCount: number;
}

// ==============================================================================
// Live Site Coordination Types
// ==============================================================================

/**
 * Real-time voxel update for live coordination
 */
export interface VoxelRealtimeUpdate {
  type: 'status' | 'decision' | 'alert' | 'progress' | 'inspection';
  voxelId: string;
  projectId: string;
  timestamp: Date;
  previousValue?: unknown;
  newValue: unknown;
  updatedBy?: string;
  source: 'field' | 'office' | 'system' | 'ai';
}

/**
 * Voxel activity feed item
 */
export interface VoxelActivityItem {
  id: string;
  voxelId: string;
  voxelLabel: string;
  type: 'decision' | 'inspection' | 'alert' | 'status_change' | 'progress';
  title: string;
  description: string;
  timestamp: Date;
  actorId?: string;
  actorName?: string;
  severity?: 'info' | 'warning' | 'critical';
  coord: VoxelCoord;
}

/**
 * Voxel coordination session for ROS MRO view
 */
export interface VoxelCoordinationSession {
  sessionId: string;
  projectId: string;
  participants: string[];
  activeVoxels: string[];
  focusArea?: BoundingBox;
  highlightedDecisions: string[];
  filters: VoxelSpatialQuery;
  startedAt: Date;
  lastActivityAt: Date;
}

// ==============================================================================
// Aggregation Types
// ==============================================================================

/**
 * Voxel aggregation level
 */
export enum AggregationLevel {
  VOXEL = 'VOXEL', // Individual voxel
  ROOM = 'ROOM', // Room level
  ZONE = 'ZONE', // Zone level
  LEVEL = 'LEVEL', // Floor level
  SYSTEM = 'SYSTEM', // By building system
  BUILDING = 'BUILDING', // Building level
  PROJECT = 'PROJECT', // Entire project
}

/**
 * Aggregated voxel metrics
 */
export interface VoxelAggregation {
  level: AggregationLevel;
  key: string; // e.g., "Level 2", "Zone A", "MECH"

  // Counts
  voxelCount: number;
  elementCount: number;
  decisionCount: number;
  alertCount: number;

  // Progress
  plannedCount: number;
  inProgressCount: number;
  completeCount: number;
  blockedCount: number;
  overallProgress: number; // 0-100

  // Cost & Labor
  totalEstimatedCost: number;
  totalActualCost: number;
  costVariance: number;
  totalEstimatedHours: number;
  totalActualHours: number;
  laborVariance: number;

  // Health
  healthyCount: number;
  atRiskCount: number;
  criticalCount: number;
  healthScore: number; // 0-100

  // Children
  children?: VoxelAggregation[];
}

// ==============================================================================
// Service Types
// ==============================================================================

/**
 * Voxelization service interface
 */
export interface IVoxelDecompositionService {
  /**
   * Convert IFC model to voxels
   */
  voxelizeModel(
    projectId: string,
    modelId: string,
    config?: Partial<VoxelizationConfig>
  ): Promise<VoxelizationResult>;

  /**
   * Query voxels by spatial criteria
   */
  queryVoxels(query: VoxelSpatialQuery): Promise<VoxelSpatialQueryResult>;

  /**
   * Get voxel by ID
   */
  getVoxel(voxelId: string): Promise<VoxelData | null>;

  /**
   * Get voxels in bounding box
   */
  getVoxelsInBounds(
    projectId: string,
    bounds: BoundingBox
  ): Promise<VoxelData[]>;

  /**
   * Get aggregated metrics
   */
  getAggregation(
    projectId: string,
    level: AggregationLevel,
    filters?: VoxelSpatialQuery
  ): Promise<VoxelAggregation[]>;

  /**
   * Generate visualization data
   */
  getVisualizationData(
    projectId: string,
    config: VoxelVisualizationConfig,
    bounds?: BoundingBox
  ): Promise<VoxelInstanceData>;

  /**
   * Get activity feed for voxels
   */
  getActivityFeed(
    projectId: string,
    voxelIds?: string[],
    limit?: number
  ): Promise<VoxelActivityItem[]>;
}
