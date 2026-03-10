/**
 * Voxel MCP Tools
 *
 * MCP tool definitions for AI agent voxel operations including:
 * - Voxelization of IFC models
 * - Spatial queries
 * - Voxel status management
 * - Decision attachment
 * - Visualization data generation
 * - Live site coordination
 *
 * @module services/voxel-tools
 * @version 1.0.0
 */

import {
  VoxelDecompositionService,
  getVoxelDecompositionService,
} from './voxel-decomposition.service';
import {
  VoxelPersistenceService,
  createVoxelPersistenceService,
} from './voxel-persistence.service';
import {
  VoxelData,
  VoxelStatus,
  VoxelHealthStatus,
  VoxelSystem,
  VoxelResolution,
  VoxelSpatialQuery,
  VoxelVisualizationConfig,
  VoxelColorScheme,
  VoxelVisualizationMode,
  AggregationLevel,
  BoundingBox,
  Vector3,
  VoxelizationResult,
  VoxelSpatialQueryResult,
  VoxelAggregation,
  VoxelInstanceData,
  VoxelActivityItem,
  VoxelCoordinationSession,
} from '../types/voxel-decomposition.types';

// ==============================================================================
// Tool Definitions
// ==============================================================================

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ==============================================================================
// Tool Schemas
// ==============================================================================

export const voxelTools: MCPTool[] = [
  {
    name: 'voxelize_model',
    description: `Convert an IFC/BIM model to voxel grid representation. This tool performs the SEPPA pipeline:
- Spatial: Converts BIM geometry to 3D voxel grid
- Element: Classifies materials and IFC entities
- Processing: Enriches with cost data and complexity scoring
- Returns voxel grid with spatial coordinates, system classifications, and metadata

Use this to enable spatial decision attachment and live site coordination for a project.`,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID to voxelize',
        },
        modelId: {
          type: 'string',
          description: 'BIM model ID (Speckle stream/commit)',
        },
        resolution: {
          type: 'number',
          description: 'Voxel resolution in mm (default: 40). Use 100 for coarse overview, 10 for fine detail.',
          default: 40,
        },
        includePartial: {
          type: 'boolean',
          description: 'Include partially filled voxels (default: true)',
          default: true,
        },
      },
      required: ['projectId', 'modelId'],
    },
  },
  {
    name: 'query_voxels',
    description: `Query voxels using spatial and property filters. Supports:
- Bounding box queries (find voxels in 3D region)
- Radius queries (find voxels within distance of point)
- Property filters (by system, status, level, zone)
- Decision surface filters (has decisions, has alerts, health status)

Returns matching voxels with full metadata.`,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID to query',
        },
        boundingBox: {
          type: 'object',
          description: 'Bounding box to search within',
          properties: {
            min: {
              type: 'object',
              properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                z: { type: 'number' },
              },
            },
            max: {
              type: 'object',
              properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                z: { type: 'number' },
              },
            },
          },
        },
        center: {
          type: 'object',
          description: 'Center point for radius query',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
        },
        radius: {
          type: 'number',
          description: 'Search radius in mm (requires center)',
        },
        systems: {
          type: 'array',
          description: 'Filter by building systems (STRUCT, MECH, ELEC, PLUMB, HVAC, FIRE, ARCH)',
          items: { type: 'string' },
        },
        statuses: {
          type: 'array',
          description: 'Filter by status (PLANNED, IN_PROGRESS, COMPLETE, BLOCKED, ISSUE)',
          items: { type: 'string' },
        },
        levels: {
          type: 'array',
          description: 'Filter by building levels',
          items: { type: 'string' },
        },
        hasDecisions: {
          type: 'boolean',
          description: 'Filter to voxels with/without decisions',
        },
        hasActiveAlerts: {
          type: 'boolean',
          description: 'Filter to voxels with/without active alerts',
        },
        healthStatus: {
          type: 'array',
          description: 'Filter by health status (HEALTHY, AT_RISK, CRITICAL, BLOCKED)',
          items: { type: 'string' },
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 100)',
          default: 100,
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'get_voxel',
    description: `Get detailed information about a specific voxel by ID. Returns full voxel data including:
- Spatial coordinates and bounds
- Building system and location hierarchy
- IFC elements contained
- Status and health
- Decision and alert counts
- Cost and labor estimates`,
    inputSchema: {
      type: 'object',
      properties: {
        voxelId: {
          type: 'string',
          description: 'Voxel ID to retrieve',
        },
      },
      required: ['voxelId'],
    },
  },
  {
    name: 'update_voxel_status',
    description: `Update the status and progress of a voxel. Use this to track construction progress:
- PLANNED: Not yet started
- IN_PROGRESS: Work underway
- COMPLETE: Work finished
- ON_HOLD: Work paused
- INSPECTION_REQUIRED: Awaiting inspection
- BLOCKED: Cannot proceed
- ISSUE: Problem identified

Optionally update percent complete (0-100).`,
    inputSchema: {
      type: 'object',
      properties: {
        voxelId: {
          type: 'string',
          description: 'Voxel ID to update',
        },
        status: {
          type: 'string',
          description: 'New status',
          enum: ['PLANNED', 'IN_PROGRESS', 'COMPLETE', 'ON_HOLD', 'INSPECTION_REQUIRED', 'BLOCKED', 'ISSUE'],
        },
        percentComplete: {
          type: 'number',
          description: 'Progress percentage (0-100)',
          minimum: 0,
          maximum: 100,
        },
      },
      required: ['voxelId', 'status'],
    },
  },
  {
    name: 'attach_decision_to_voxel',
    description: `Attach a PM decision to a voxel location. This creates the spatial link between decisions and physical locations in the BIM model, enabling:
- Decision surface visualization
- Spatial impact analysis
- Live site coordination`,
    inputSchema: {
      type: 'object',
      properties: {
        voxelId: {
          type: 'string',
          description: 'Voxel ID to attach decision to',
        },
        decisionId: {
          type: 'string',
          description: 'Decision ID to attach',
        },
      },
      required: ['voxelId', 'decisionId'],
    },
  },
  {
    name: 'get_voxel_aggregation',
    description: `Get aggregated metrics for voxels grouped by level, zone, system, or building. Returns:
- Voxel and element counts
- Progress breakdown (planned/in-progress/complete)
- Cost and labor totals with variances
- Health scores

Use for project dashboards and status reports.`,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID',
        },
        level: {
          type: 'string',
          description: 'Aggregation level',
          enum: ['VOXEL', 'ROOM', 'ZONE', 'LEVEL', 'SYSTEM', 'BUILDING', 'PROJECT'],
        },
        filterSystems: {
          type: 'array',
          description: 'Filter to specific systems before aggregating',
          items: { type: 'string' },
        },
        filterStatuses: {
          type: 'array',
          description: 'Filter to specific statuses before aggregating',
          items: { type: 'string' },
        },
      },
      required: ['projectId', 'level'],
    },
  },
  {
    name: 'get_voxel_visualization',
    description: `Generate visualization data for rendering voxels in the BIM viewer. Returns instanced rendering data optimized for WebGL/Three.js:
- Instance centers (positions)
- Instance scales (sizes)
- Instance colors (based on color scheme)

Color schemes available: BY_SYSTEM, BY_STATUS, BY_HEALTH, BY_PROGRESS, BY_DECISION_DENSITY, UNIFORM`,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID',
        },
        colorScheme: {
          type: 'string',
          description: 'How to color voxels',
          enum: ['BY_SYSTEM', 'BY_STATUS', 'BY_HEALTH', 'BY_PROGRESS', 'BY_DECISION_DENSITY', 'UNIFORM'],
          default: 'BY_SYSTEM',
        },
        mode: {
          type: 'string',
          description: 'Visualization mode',
          enum: ['SOLID', 'WIREFRAME', 'POINTS', 'HEATMAP'],
          default: 'SOLID',
        },
        opacity: {
          type: 'number',
          description: 'Opacity (0-1)',
          default: 0.7,
        },
        filterSystems: {
          type: 'array',
          description: 'Show only these systems',
          items: { type: 'string' },
        },
        filterStatuses: {
          type: 'array',
          description: 'Show only these statuses',
          items: { type: 'string' },
        },
        boundingBox: {
          type: 'object',
          description: 'Limit to voxels in this region',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'get_voxel_activity',
    description: `Get recent activity feed for voxels. Shows decisions, inspections, alerts, and status changes. Useful for:
- Live site coordination view
- Activity monitoring
- Audit trail`,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID',
        },
        voxelIds: {
          type: 'array',
          description: 'Specific voxels to get activity for (optional)',
          items: { type: 'string' },
        },
        limit: {
          type: 'number',
          description: 'Maximum items to return (default: 50)',
          default: 50,
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'create_coordination_session',
    description: `Create a live coordination session for real-time collaboration on the voxel view. Sessions enable:
- Multi-user synchronized viewing
- Real-time status updates
- Shared decision discussions
- Focus area coordination`,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID',
        },
        participants: {
          type: 'array',
          description: 'Participant user IDs',
          items: { type: 'string' },
        },
      },
      required: ['projectId', 'participants'],
    },
  },
  {
    name: 'navigate_decision_surface',
    description: `Navigate the decision surface attached to voxels. Supports traversal by:
- Spatial: Find decisions in adjacent voxels
- Causal: Follow consequence chains
- Temporal: View decision timeline
- Authority: Trace escalation paths

Use for impact analysis and decision context exploration.`,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID',
        },
        startVoxelId: {
          type: 'string',
          description: 'Starting voxel ID',
        },
        traversalType: {
          type: 'string',
          description: 'Type of navigation',
          enum: ['spatial', 'causal', 'temporal', 'authority'],
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum traversal depth (default: 3)',
          default: 3,
        },
      },
      required: ['projectId', 'startVoxelId', 'traversalType'],
    },
  },

  // ===========================================================================
  // Decision Surface Tools (Phase 2)
  // ===========================================================================

  {
    name: 'get_voxel_decisions',
    description: `Get all decisions attached to a voxel with optional filtering.
Returns attached decisions with metadata including attachment type, acknowledgment status, and affected trades.
Use to display decision context for a specific voxel location.`,
    inputSchema: {
      type: 'object',
      properties: {
        voxelId: {
          type: 'string',
          description: 'Voxel ID to get decisions for',
        },
        attachmentType: {
          type: 'string',
          description: 'Filter by attachment type',
          enum: ['PRIMARY', 'AFFECTED', 'ADJACENT', 'DOWNSTREAM'],
        },
        requiresAcknowledgment: {
          type: 'boolean',
          description: 'Filter to decisions requiring acknowledgment',
        },
        acknowledged: {
          type: 'boolean',
          description: 'Filter by acknowledgment status',
        },
        trades: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter to decisions affecting specific trades',
        },
      },
      required: ['voxelId'],
    },
  },
  {
    name: 'acknowledge_decision',
    description: `Record a worker acknowledgment of a decision with location tracking.
Captures worker identity, trade, method (APP_TAP, SMS_REPLY, VOICE, AR_GESTURE), and location (GPS/UWB).
Use when a field worker confirms receipt of a decision.`,
    inputSchema: {
      type: 'object',
      properties: {
        voxelId: {
          type: 'string',
          description: 'Voxel ID where decision is attached',
        },
        decisionId: {
          type: 'string',
          description: 'Decision ID (UUID) to acknowledge',
        },
        participantId: {
          type: 'string',
          description: 'Participant/worker ID (UUID)',
        },
        workerName: {
          type: 'string',
          description: 'Worker display name',
        },
        workerTrade: {
          type: 'string',
          description: 'Worker trade (MECH, ELEC, PLUMB, etc.)',
        },
        method: {
          type: 'string',
          description: 'Acknowledgment method',
          enum: ['APP_TAP', 'SMS_REPLY', 'VOICE', 'AR_GESTURE'],
        },
        gpsLat: {
          type: 'number',
          description: 'GPS latitude',
        },
        gpsLng: {
          type: 'number',
          description: 'GPS longitude',
        },
        gpsAccuracy: {
          type: 'number',
          description: 'GPS accuracy in meters',
        },
        notes: {
          type: 'string',
          description: 'Optional worker notes',
        },
      },
      required: ['voxelId', 'decisionId', 'participantId', 'method'],
    },
  },
  {
    name: 'apply_tolerance_override',
    description: `Create an approved tolerance variance for a voxel.
Records the standard value, approved variance, approving authority, and rationale.
Use when a deviation from spec is authorized by appropriate authority.`,
    inputSchema: {
      type: 'object',
      properties: {
        voxelId: {
          type: 'string',
          description: 'Voxel ID to apply override',
        },
        toleranceType: {
          type: 'string',
          description: 'Type of tolerance',
          enum: ['WALL_FLATNESS', 'CEILING_HEIGHT', 'FLOOR_LEVEL', 'PROTRUSION', 'GAP', 'ALIGNMENT', 'FINISH_QUALITY', 'EQUIPMENT_CLEARANCE', 'PIPE_SLOPE', 'DUCT_SIZE'],
        },
        standardValue: {
          type: 'number',
          description: 'Standard tolerance value (mm)',
        },
        standardUnit: {
          type: 'string',
          description: 'Unit of measurement',
          default: 'mm',
        },
        approvedValue: {
          type: 'number',
          description: 'Approved variance value (mm)',
        },
        approvedUnit: {
          type: 'string',
          description: 'Unit of measurement',
          default: 'mm',
        },
        sourceDecisionUrn: {
          type: 'string',
          description: 'URN of decision authorizing override',
        },
        approvedByUrn: {
          type: 'string',
          description: 'URN of approving authority',
        },
        rationale: {
          type: 'string',
          description: 'Reason for variance approval',
        },
        applicableTrades: {
          type: 'array',
          items: { type: 'string' },
          description: 'Trades this override applies to',
        },
        expiresAt: {
          type: 'string',
          description: 'Expiration date (ISO 8601)',
        },
      },
      required: ['voxelId', 'toleranceType', 'standardValue', 'approvedValue', 'sourceDecisionUrn', 'rationale'],
    },
  },
  {
    name: 'query_tolerance_overrides',
    description: `Query tolerance overrides by criteria.
Returns active overrides filtered by voxel, type, trade, or expiration status.
Use to check what variances are approved for a location or trade.`,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID',
        },
        voxelId: {
          type: 'string',
          description: 'Filter to specific voxel',
        },
        toleranceType: {
          type: 'string',
          description: 'Filter by tolerance type',
          enum: ['WALL_FLATNESS', 'CEILING_HEIGHT', 'FLOOR_LEVEL', 'PROTRUSION', 'GAP', 'ALIGNMENT', 'FINISH_QUALITY', 'EQUIPMENT_CLEARANCE', 'PIPE_SLOPE', 'DUCT_SIZE'],
        },
        trade: {
          type: 'string',
          description: 'Filter by applicable trade',
        },
        includeExpired: {
          type: 'boolean',
          description: 'Include expired overrides (default: false)',
          default: false,
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'request_inspection',
    description: `Schedule an inspection for a voxel.
Creates an inspection request with type, priority, and target date.
Use when work at a voxel location is ready for verification.`,
    inputSchema: {
      type: 'object',
      properties: {
        voxelId: {
          type: 'string',
          description: 'Voxel ID to inspect',
        },
        projectId: {
          type: 'string',
          description: 'Project ID',
        },
        inspectionType: {
          type: 'string',
          description: 'Type of inspection',
          enum: ['ROUGH', 'FINAL', 'SPECIAL'],
        },
        requestedBy: {
          type: 'string',
          description: 'URN of requester',
        },
        priority: {
          type: 'string',
          description: 'Request priority',
          enum: ['NORMAL', 'EXPEDITED'],
          default: 'NORMAL',
        },
        notes: {
          type: 'string',
          description: 'Additional notes for inspector',
        },
        targetDate: {
          type: 'string',
          description: 'Target inspection date (ISO 8601)',
        },
      },
      required: ['voxelId', 'projectId', 'inspectionType', 'requestedBy'],
    },
  },
  {
    name: 'complete_inspection',
    description: `Record inspection completion results.
Captures result (PASSED, FAILED, CONDITIONAL), findings, and decisions reviewed.
Use when inspector finishes verification at a voxel location.`,
    inputSchema: {
      type: 'object',
      properties: {
        inspectionId: {
          type: 'string',
          description: 'Inspection ID (UUID)',
        },
        voxelId: {
          type: 'string',
          description: 'Voxel ID inspected',
        },
        result: {
          type: 'string',
          description: 'Inspection result',
          enum: ['PASSED', 'FAILED', 'CONDITIONAL'],
        },
        inspectorRef: {
          type: 'string',
          description: 'URN of inspector',
        },
        findings: {
          type: 'string',
          description: 'Inspection findings text',
        },
        conditions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Conditions for CONDITIONAL result',
        },
        decisionsReviewed: {
          type: 'array',
          items: { type: 'string' },
          description: 'URNs of decisions inspector reviewed',
        },
      },
      required: ['inspectionId', 'voxelId', 'result', 'inspectorRef'],
    },
  },
];

// ==============================================================================
// Tool Handlers
// ==============================================================================

/**
 * Execute a voxel tool
 */
export async function executeVoxelTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const service = getVoxelDecompositionService();

  try {
    switch (toolName) {
      case 'voxelize_model':
        return await handleVoxelizeModel(service, args);

      case 'query_voxels':
        return await handleQueryVoxels(service, args);

      case 'get_voxel':
        return await handleGetVoxel(service, args);

      case 'update_voxel_status':
        return await handleUpdateVoxelStatus(service, args);

      case 'attach_decision_to_voxel':
        return await handleAttachDecision(service, args);

      case 'get_voxel_aggregation':
        return await handleGetAggregation(service, args);

      case 'get_voxel_visualization':
        return await handleGetVisualization(service, args);

      case 'get_voxel_activity':
        return await handleGetActivity(service, args);

      case 'create_coordination_session':
        return await handleCreateSession(service, args);

      case 'navigate_decision_surface':
        return await handleNavigateDecisionSurface(service, args);

      // Decision Surface Phase 2 Tools
      case 'get_voxel_decisions':
        return await handleGetVoxelDecisions(args);

      case 'acknowledge_decision':
        return await handleAcknowledgeDecision(args);

      case 'apply_tolerance_override':
        return await handleApplyToleranceOverride(args);

      case 'query_tolerance_overrides':
        return await handleQueryToleranceOverrides(args);

      case 'request_inspection':
        return await handleRequestInspection(service, args);

      case 'complete_inspection':
        return await handleCompleteInspection(service, args);

      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==============================================================================
// Individual Tool Handlers
// ==============================================================================

async function handleVoxelizeModel(
  service: VoxelDecompositionService,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const projectId = args.projectId as string;
  const modelId = args.modelId as string;
  const resolution = (args.resolution as number) || VoxelResolution.STANDARD;
  const includePartial = args.includePartial !== false;

  const result = await service.voxelizeModel(projectId, modelId, {
    resolution,
    includePartial,
  });

  return {
    success: result.success,
    data: {
      voxelCount: result.voxelCount,
      gridExtent: result.gridExtent,
      stats: result.stats,
      processingTimeMs: result.processingTimeMs,
      errors: result.errors,
      warnings: result.warnings,
    },
    error: result.success ? undefined : 'Voxelization failed',
  };
}

async function handleQueryVoxels(
  service: VoxelDecompositionService,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const query: VoxelSpatialQuery = {
    projectId: args.projectId as string,
    boundingBox: args.boundingBox as BoundingBox | undefined,
    center: args.center as Vector3 | undefined,
    radius: args.radius as number | undefined,
    systems: args.systems as VoxelSystem[] | undefined,
    statuses: args.statuses as VoxelStatus[] | undefined,
    levels: args.levels as string[] | undefined,
    hasDecisions: args.hasDecisions as boolean | undefined,
    hasActiveAlerts: args.hasActiveAlerts as boolean | undefined,
    healthStatus: args.healthStatus as VoxelHealthStatus[] | undefined,
    limit: (args.limit as number) || 100,
  };

  const result = await service.queryVoxels(query);

  // Return summary to reduce payload size
  return {
    success: true,
    data: {
      totalCount: result.totalCount,
      queryTimeMs: result.queryTimeMs,
      boundingBox: result.boundingBox,
      voxels: result.voxels.map((v) => ({
        id: v.id,
        voxelId: v.voxelId,
        center: v.center,
        system: v.system,
        status: v.status,
        healthStatus: v.healthStatus,
        level: v.level,
        decisionCount: v.decisionCount,
        percentComplete: v.percentComplete,
      })),
    },
  };
}

async function handleGetVoxel(
  service: VoxelDecompositionService,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const voxelId = args.voxelId as string;
  const voxel = await service.getVoxel(voxelId);

  if (!voxel) {
    return {
      success: false,
      error: `Voxel not found: ${voxelId}`,
    };
  }

  return {
    success: true,
    data: voxel,
  };
}

async function handleUpdateVoxelStatus(
  service: VoxelDecompositionService,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const voxelId = args.voxelId as string;
  const status = args.status as VoxelStatus;
  const percentComplete = args.percentComplete as number | undefined;

  const voxel = await service.updateVoxelStatus(voxelId, status, percentComplete);

  if (!voxel) {
    return {
      success: false,
      error: `Voxel not found: ${voxelId}`,
    };
  }

  return {
    success: true,
    data: {
      id: voxel.id,
      voxelId: voxel.voxelId,
      status: voxel.status,
      healthStatus: voxel.healthStatus,
      percentComplete: voxel.percentComplete,
      updatedAt: voxel.updatedAt,
    },
  };
}

async function handleAttachDecision(
  service: VoxelDecompositionService,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const voxelId = args.voxelId as string;
  const decisionId = args.decisionId as string;

  await service.attachDecision(voxelId, decisionId);

  return {
    success: true,
    data: {
      voxelId,
      decisionId,
      message: 'Decision attached to voxel successfully',
    },
  };
}

async function handleGetAggregation(
  service: VoxelDecompositionService,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const projectId = args.projectId as string;
  const level = args.level as AggregationLevel;

  const filters: VoxelSpatialQuery | undefined =
    args.filterSystems || args.filterStatuses
      ? {
          projectId,
          systems: args.filterSystems as VoxelSystem[] | undefined,
          statuses: args.filterStatuses as VoxelStatus[] | undefined,
        }
      : undefined;

  const aggregations = await service.getAggregation(projectId, level, filters);

  return {
    success: true,
    data: aggregations,
  };
}

async function handleGetVisualization(
  service: VoxelDecompositionService,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const projectId = args.projectId as string;

  const config: VoxelVisualizationConfig = {
    mode: (args.mode as VoxelVisualizationMode) || VoxelVisualizationMode.SOLID,
    colorScheme: (args.colorScheme as VoxelColorScheme) || VoxelColorScheme.BY_SYSTEM,
    opacity: (args.opacity as number) || 0.7,
    showWireframe: false,
    showLabels: false,
    labelField: 'voxelId',
    filterSystems: args.filterSystems as VoxelSystem[] | undefined,
    filterStatuses: args.filterStatuses as VoxelStatus[] | undefined,
  };

  const bounds = args.boundingBox as BoundingBox | undefined;
  const instanceData = await service.getVisualizationData(projectId, config, bounds);

  // Return serializable data (convert typed arrays to regular arrays)
  return {
    success: true,
    data: {
      instanceCount: instanceData.instanceCount,
      voxelIds: instanceData.voxelIds,
      // Note: In production, these would be sent as binary data
      // For MCP, we return metadata and let client fetch binary separately
      centersLength: instanceData.centers.length,
      scalesLength: instanceData.scales.length,
      colorsLength: instanceData.colors.length,
    },
  };
}

async function handleGetActivity(
  service: VoxelDecompositionService,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const projectId = args.projectId as string;
  const voxelIds = args.voxelIds as string[] | undefined;
  const limit = (args.limit as number) || 50;

  const activity = await service.getActivityFeed(projectId, voxelIds, limit);

  return {
    success: true,
    data: activity,
  };
}

async function handleCreateSession(
  service: VoxelDecompositionService,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const projectId = args.projectId as string;
  const participants = args.participants as string[];

  const session = await service.createCoordinationSession(projectId, participants);

  return {
    success: true,
    data: session,
  };
}

async function handleNavigateDecisionSurface(
  service: VoxelDecompositionService,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const projectId = args.projectId as string;
  const startVoxelId = args.startVoxelId as string;
  const traversalType = args.traversalType as string;
  const maxDepth = (args.maxDepth as number) || 3;

  // Get the starting voxel
  const startVoxel = await service.getVoxel(startVoxelId);
  if (!startVoxel) {
    return {
      success: false,
      error: `Starting voxel not found: ${startVoxelId}`,
    };
  }

  // For spatial traversal, get adjacent voxels
  if (traversalType === 'spatial') {
    const radius = startVoxel.resolution * 2 * maxDepth;
    const result = await service.queryVoxels({
      projectId,
      center: startVoxel.center,
      radius,
      limit: 100,
    });

    return {
      success: true,
      data: {
        traversalType,
        startVoxel: {
          id: startVoxel.id,
          voxelId: startVoxel.voxelId,
          center: startVoxel.center,
        },
        relatedVoxels: result.voxels.map((v) => ({
          id: v.id,
          voxelId: v.voxelId,
          center: v.center,
          distance: Math.sqrt(
            Math.pow(v.center.x - startVoxel.center.x, 2) +
            Math.pow(v.center.y - startVoxel.center.y, 2) +
            Math.pow(v.center.z - startVoxel.center.z, 2)
          ),
          decisionCount: v.decisionCount,
        })),
      },
    };
  }

  // For other traversal types, return decision graph metadata
  return {
    success: true,
    data: {
      traversalType,
      startVoxel: {
        id: startVoxel.id,
        voxelId: startVoxel.voxelId,
        decisionCount: startVoxel.decisionCount,
        graphMetadata: startVoxel.graphMetadata,
      },
      message: `${traversalType} traversal would follow graph edges in production`,
    },
  };
}

// ==============================================================================
// Decision Surface Phase 2 Handlers
// ==============================================================================

// Persistence service singleton (lazy-initialized)
let persistenceService: VoxelPersistenceService | null = null;

/**
 * Get or create persistence service instance
 */
function getPersistenceService(): VoxelPersistenceService {
  if (!persistenceService) {
    // Note: In production, this would be injected from the MCP server context
    // For now, create with a placeholder that would be replaced at runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globalObj = typeof globalThis !== 'undefined' ? globalThis : ({} as any);
    const prisma = (globalObj as any).__prisma_client__;
    if (!prisma) {
      throw new Error('Prisma client not initialized. Ensure database connection is established.');
    }
    persistenceService = createVoxelPersistenceService(prisma);
  }
  return persistenceService;
}

/**
 * Handle get_voxel_decisions tool
 */
async function handleGetVoxelDecisions(
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const voxelId = args.voxelId as string;
  const filters = {
    attachmentType: args.attachmentType as string | undefined,
    requiresAcknowledgment: args.requiresAcknowledgment as boolean | undefined,
    acknowledged: args.acknowledged as boolean | undefined,
    trades: args.trades as string[] | undefined,
  };

  const persistence = getPersistenceService();
  const decisions = await persistence.getVoxelDecisions(voxelId, filters);

  return {
    success: true,
    data: {
      voxelId,
      decisionCount: decisions.length,
      decisions: decisions.map((d: any) => ({
        attachmentId: d.id,
        decisionId: d.decision_id,
        attachmentType: d.attachment_type,
        label: d.label,
        affectedTrades: d.affected_trades,
        summary: d.summary,
        requiresAcknowledgment: d.requires_acknowledgment,
        acknowledged: d.acknowledged,
        attachedAt: d.attached_at,
        decision: d.decision ? {
          id: d.decision.id,
          title: d.decision.title,
          status: d.decision.status,
        } : null,
      })),
    },
  };
}

/**
 * Handle acknowledge_decision tool
 */
async function handleAcknowledgeDecision(
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const voxelId = args.voxelId as string;
  const decisionId = args.decisionId as string;
  const participantId = args.participantId as string;
  const method = args.method as string;
  const workerName = args.workerName as string | undefined;
  const workerTrade = args.workerTrade as string | undefined;
  const notes = args.notes as string | undefined;

  // Build location object from GPS parameters
  const location: {
    gps?: { lat: number; lng: number; accuracy: number };
  } = {};

  if (args.gpsLat !== undefined && args.gpsLng !== undefined) {
    location.gps = {
      lat: args.gpsLat as number,
      lng: args.gpsLng as number,
      accuracy: (args.gpsAccuracy as number) || 10,
    };
  }

  const persistence = getPersistenceService();
  const result = await persistence.recordAcknowledgment({
    decisionId,
    participantId,
    workerName,
    workerTrade,
    method,
    location: Object.keys(location).length > 0 ? location : undefined,
    notes,
  });

  return {
    success: true,
    data: {
      acknowledgmentId: result.id,
      voxelId,
      decisionId,
      participantId,
      method,
      message: 'Decision acknowledged successfully',
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Handle apply_tolerance_override tool
 */
async function handleApplyToleranceOverride(
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const voxelId = args.voxelId as string;
  const toleranceType = args.toleranceType as string;
  const standardValue = args.standardValue as number;
  const standardUnit = (args.standardUnit as string) || 'mm';
  const approvedValue = args.approvedValue as number;
  const approvedUnit = (args.approvedUnit as string) || 'mm';
  const sourceDecisionUrn = args.sourceDecisionUrn as string;
  const approvedByUrn = args.approvedByUrn as string | undefined;
  const rationale = args.rationale as string;
  const applicableTrades = args.applicableTrades as string[] | undefined;
  const expiresAt = args.expiresAt ? new Date(args.expiresAt as string) : undefined;

  const persistence = getPersistenceService();
  const result = await persistence.createToleranceOverride({
    voxelId,
    toleranceType,
    standardValue: { value: standardValue, unit: standardUnit },
    approvedValue: { value: approvedValue, unit: approvedUnit },
    sourceDecisionUrn,
    approvedByUrn,
    rationale,
    applicableTrades,
    expiresAt,
  });

  return {
    success: true,
    data: {
      overrideId: result.id,
      overrideUrn: result.urn,
      voxelId,
      toleranceType,
      variance: {
        from: { value: standardValue, unit: standardUnit },
        to: { value: approvedValue, unit: approvedUnit },
      },
      message: `Tolerance override applied: ${toleranceType} ${standardValue}${standardUnit} → ${approvedValue}${approvedUnit}`,
    },
  };
}

/**
 * Handle query_tolerance_overrides tool
 */
async function handleQueryToleranceOverrides(
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const projectId = args.projectId as string;
  const voxelId = args.voxelId as string | undefined;
  const toleranceType = args.toleranceType as string | undefined;
  const trade = args.trade as string | undefined;
  const includeExpired = (args.includeExpired as boolean) || false;

  const persistence = getPersistenceService();

  // If voxelId provided, query that voxel's overrides
  if (voxelId) {
    const overrides = await persistence.getToleranceOverrides(voxelId, includeExpired);

    // Filter by type and trade if specified
    let filtered = overrides;
    if (toleranceType) {
      filtered = filtered.filter((o: any) => o.tolerance_type === toleranceType);
    }
    if (trade) {
      filtered = filtered.filter((o: any) =>
        o.applicable_trades.includes(trade) || o.applicable_trades.length === 0
      );
    }

    return {
      success: true,
      data: {
        projectId,
        voxelId,
        overrideCount: filtered.length,
        overrides: filtered.map((o: any) => ({
          id: o.id,
          urn: o.urn,
          toleranceType: o.tolerance_type,
          standardValue: { value: o.standard_value, unit: o.standard_unit },
          approvedValue: { value: o.approved_value, unit: o.approved_unit },
          rationale: o.rationale,
          applicableTrades: o.applicable_trades,
          approvalDate: o.approval_date,
          expiresAt: o.expires_at,
          isExpired: o.expires_at ? new Date(o.expires_at) < new Date() : false,
        })),
      },
    };
  }

  // Project-wide query would require additional service method
  // For now, return guidance
  return {
    success: true,
    data: {
      projectId,
      message: 'Project-wide tolerance override query requires voxelId filter',
      overrideCount: 0,
      overrides: [],
    },
  };
}

/**
 * Handle request_inspection tool
 * Creates a proper Inspection record linked to voxels
 */
async function handleRequestInspection(
  service: VoxelDecompositionService,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const voxelId = args.voxelId as string;
  const projectId = args.projectId as string;
  const inspectionType = args.inspectionType as string;
  const requestedBy = args.requestedBy as string;
  const priority = (args.priority as string) || 'NORMAL';
  const notes = args.notes as string | undefined;
  const targetDate = args.targetDate as string | undefined;

  // Verify voxel exists
  const voxel = await service.getVoxel(voxelId);
  if (!voxel) {
    return {
      success: false,
      error: `Voxel not found: ${voxelId}`,
    };
  }

  // Create proper Inspection record via persistence service
  const persistence = getPersistenceService();
  const inspection = await persistence.createInspection({
    projectId,
    voxelIds: [voxelId],
    inspectionType,
    requestedBy,
    priority,
    title: `${inspectionType} Inspection - ${voxel.voxelId}`,
    notes,
    targetDate: targetDate ? new Date(targetDate) : undefined,
  });

  return {
    success: true,
    data: {
      inspectionId: inspection.id,
      inspectionUrn: inspection.urn,
      inspectionNumber: inspection.inspectionId,
      voxelId,
      voxelLabel: voxel.voxelId,
      projectId,
      inspectionType,
      priority,
      requestedBy,
      targetDate,
      status: 'SCHEDULED',
      voxelStatus: VoxelStatus.INSPECTION_REQUIRED,
      message: `${inspectionType} inspection ${inspection.inspectionId} created for voxel ${voxel.voxelId}`,
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Handle complete_inspection tool
 * Updates the Inspection record and all linked voxels
 */
async function handleCompleteInspection(
  service: VoxelDecompositionService,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const inspectionId = args.inspectionId as string;
  const voxelId = args.voxelId as string;
  const result = args.result as 'PASSED' | 'FAILED' | 'CONDITIONAL';
  const inspectorRef = args.inspectorRef as string;
  const findings = args.findings as string | undefined;
  const conditions = args.conditions as string[] | undefined;
  const decisionsReviewed = args.decisionsReviewed as string[] | undefined;

  const persistence = getPersistenceService();

  // Complete the inspection through persistence service
  // This updates the Inspection record and all linked voxels
  const completionResult = await persistence.completeInspection({
    inspectionId,
    result,
    inspectorRef,
    findings,
    conditions,
    decisionsReviewed,
    reinspectionRequired: result === 'FAILED',
  });

  if (!completionResult.success) {
    return {
      success: false,
      error: `Failed to complete inspection: ${inspectionId}`,
    };
  }

  // Determine new voxel status based on result for response
  let newStatus: VoxelStatus;
  switch (result) {
    case 'PASSED':
      newStatus = VoxelStatus.COMPLETE;
      break;
    case 'FAILED':
      newStatus = VoxelStatus.ISSUE;
      break;
    case 'CONDITIONAL':
      newStatus = VoxelStatus.ON_HOLD;
      break;
    default:
      newStatus = VoxelStatus.ON_HOLD;
  }

  // Get voxel label for response
  const voxel = await service.getVoxel(voxelId);
  const voxelLabel = voxel?.voxelId || voxelId;

  return {
    success: true,
    data: {
      inspectionId,
      voxelId,
      voxelLabel,
      voxelsUpdated: completionResult.voxelIds,
      result,
      inspectorRef,
      findings,
      conditions: conditions || [],
      decisionsReviewed: decisionsReviewed || [],
      newVoxelStatus: newStatus,
      completedAt: new Date().toISOString(),
      message: `Inspection ${result.toLowerCase()} - ${completionResult.voxelIds.length} voxel(s) updated`,
    },
  };
}

// ==============================================================================
// Exports
// ==============================================================================

export default {
  tools: voxelTools,
  execute: executeVoxelTool,
};
